import fs from 'fs';
import path from 'path';
import { FONT_CATALOG, FONTS_ROOT } from '../ai/typography/font-catalog';
import { FONT_MANIFEST } from '../ai/typography/font-manifest';

interface FontFileInfo {
  filePath: string;
  relPath: string;
  fileName: string;
  ext: string;
  sizeBytes: number;
  familyDir: string;
  parsedName?: string;
  weightParsed?: number;
  styleParsed?: 'normal' | 'italic';
  unitsPerEm?: number;
  ascender?: number;
  descender?: number;
  hasCmap?: boolean;
  hasHmtx?: boolean;
  isVariable?: boolean;
  variableAxes?: string[];
}

function parseSfntBasic(buf: Buffer): Partial<FontFileInfo> {
  if (buf.length < 12) return {};
  const magic = buf.readUInt32BE(0);
  const isTtf = magic === 0x00010000 || magic === 0x74727565; // 'true'
  const isCff = magic === 0x4f54544f; // 'OTTO'
  const isWoff = magic === 0x774f4646; // 'wOFF'
  const isWoff2 = magic === 0x774f4632; // 'wOF2'

  if (!isTtf && !isCff && !isWoff && !isWoff2) return {};

  if (isTtf || isCff) {
    const numTables = buf.readUInt16BE(4);
    const tables: Record<string, { offset: number; length: number }> = {};
    let off = 12;
    for (let i = 0; i < numTables; i++) {
      if (off + 16 > buf.length) break;
      const tag = buf.toString('ascii', off, off + 4);
      const offset = buf.readUInt32BE(off + 8);
      const length = buf.readUInt32BE(off + 12);
      tables[tag] = { offset, length };
      off += 16;
    }

    let unitsPerEm: number | undefined;
    if (tables['head'] && tables['head'].offset + 36 <= buf.length) {
      unitsPerEm = buf.readUInt16BE(tables['head'].offset + 18);
    }

    let ascender: number | undefined;
    let descender: number | undefined;
    if (tables['hhea'] && tables['hhea'].offset + 36 <= buf.length) {
      ascender = buf.readInt16BE(tables['hhea'].offset + 4);
      descender = buf.readInt16BE(tables['hhea'].offset + 6);
    }

    const isVariable = !!tables['fvar'];
    const variableAxes: string[] = [];
    if (isVariable && tables['fvar'].offset + 16 <= buf.length) {
      const fvarOff = tables['fvar'].offset;
      const axesArrayOffset = fvarOff + buf.readUInt16BE(fvarOff + 4);
      const axisCount = buf.readUInt16BE(fvarOff + 8);
      const axisSize = buf.readUInt16BE(fvarOff + 10);
      for (let a = 0; a < axisCount; a++) {
        const axOff = axesArrayOffset + a * axisSize;
        if (axOff + 4 <= buf.length) {
          variableAxes.push(buf.toString('ascii', axOff, axOff + 4));
        }
      }
    }

    return {
      unitsPerEm,
      ascender,
      descender,
      hasCmap: !!tables['cmap'],
      hasHmtx: !!tables['hmtx'],
      isVariable,
      variableAxes,
    };
  }

  return {};
}

export function auditLocalFontAssets() {
  const fontFiles: FontFileInfo[] = [];

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const fullPath = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(fullPath);
      } else if (/\.(ttf|otf|woff|woff2)$/i.test(e.name)) {
        const ext = path.extname(e.name).toLowerCase();
        const stat = fs.statSync(fullPath);
        const relPath = path.relative(FONTS_ROOT, fullPath).replace(/\\/g, '/');
        const familyDir = path.dirname(relPath);
        const buf = fs.readFileSync(fullPath);

        // Parse filename pattern e.g. "700-normal.ttf" or "400-italic.ttf"
        const match = /^(\d+)-(normal|italic)/.exec(e.name);
        const weightParsed = match ? parseInt(match[1], 10) : undefined;
        const styleParsed = match ? (match[2] as 'normal' | 'italic') : undefined;

        const sfntInfo = parseSfntBasic(buf);

        fontFiles.push({
          filePath: fullPath,
          relPath,
          fileName: e.name,
          ext,
          sizeBytes: stat.size,
          familyDir,
          weightParsed,
          styleParsed,
          ...sfntInfo,
        });
      }
    }
  }

  walk(FONTS_ROOT);

  // Group by family directory
  const byDir = new Map<string, FontFileInfo[]>();
  for (const f of fontFiles) {
    const list = byDir.get(f.familyDir) ?? [];
    list.push(f);
    byDir.set(f.familyDir, list);
  }

  // Compare with FONT_MANIFEST and FONT_CATALOG
  const manifestSlugs = new Set(FONT_MANIFEST.map((m) => m.fontsourceSlug));
  const catalogFamilies = new Set(FONT_CATALOG.map((c) => c.family));

  const missingFromCatalog: string[] = [];
  const missingFilesForCatalog: Array<{ family: string; expectedPath: string }> = [];

  for (const dir of byDir.keys()) {
    if (!manifestSlugs.has(dir)) {
      missingFromCatalog.push(dir);
    }
  }

  for (const cat of FONT_CATALOG) {
    for (const w of cat.weights) {
      for (const s of cat.styles) {
        const rel = `${cat.family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}/${w}-${s}.ttf`;
        const expected = path.join(FONTS_ROOT, rel);
        if (!fs.existsSync(expected)) {
          missingFilesForCatalog.push({ family: cat.family, expectedPath: rel });
        }
      }
    }
  }

  return {
    totalFiles: fontFiles.length,
    distinctDirectories: byDir.size,
    fontFiles,
    byDir,
    missingFromCatalog,
    missingFilesForCatalog,
    manifestCount: FONT_MANIFEST.length,
    catalogCount: FONT_CATALOG.length,
  };
}

if (require.main === module) {
  const report = auditLocalFontAssets();
  console.log('=== FONT ASSET AUDIT REPORT ===');
  console.log(`Total font files found on disk: ${report.totalFiles}`);
  console.log(`Total font family directories: ${report.distinctDirectories}`);
  console.log(`Manifest entries: ${report.manifestCount}`);
  console.log(`Catalog entries: ${report.catalogCount}`);

  console.log(`\nMissing from catalog (on disk but not in manifest/catalog):`, report.missingFromCatalog);
  console.log(`Missing files for catalog entries (expected but not on disk):`, report.missingFilesForCatalog.length);
  if (report.missingFilesForCatalog.length > 0) {
    console.log(report.missingFilesForCatalog);
  }

  const variableFonts = report.fontFiles.filter((f) => f.isVariable);
  console.log(`\nVariable font files found: ${variableFonts.length}`);
  if (variableFonts.length > 0) {
    console.log(variableFonts.map((f) => ({ rel: f.relPath, axes: f.variableAxes })));
  }

  const formats = report.fontFiles.reduce((acc, f) => {
    acc[f.ext] = (acc[f.ext] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log(`\nFont format breakdown:`, formats);

  console.log('\nSample family details:');
  for (const [dir, files] of Array.from(report.byDir.entries()).slice(0, 8)) {
    console.log(`  - ${dir}: ${files.map((f) => `${f.fileName} (${f.unitsPerEm} em, asc: ${f.ascender}, desc: ${f.descender})`).join(', ')}`);
  }
}
