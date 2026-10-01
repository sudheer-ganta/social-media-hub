/**
 * FLOWPOST AUTHORITATIVE FONT METRICS SERVICE
 *
 * Reads real local .ttf/.otf font files from disk and extracts true OpenType/TrueType
 * glyph metrics, character advance tables, and ascender/descender bounds.
 *
 * This service is the SINGLE SOURCE OF TRUTH for text measurement and geometry.
 * The renderer (@resvg/resvg-js) and this measurement service load the EXACT same font files.
 *
 * Zero external dependencies: high-speed, binary OpenType table parsing with in-memory caching.
 */

import fs from 'fs';
import { fontFilePath } from './font-catalog';

export interface ParsedFontMetrics {
  fontPath: string;
  unitsPerEm: number;
  ascender: number;
  descender: number;
  lineGap: number;
  numberOfHMetrics: number;
  glyphAdvances: Uint16Array;
  // Unicode -> Glyph ID mapping
  unicodeToGlyph: Map<number, number>;
}

export interface MeasuredTextMetrics {
  width: number; // width in pixels at the specified fontSize
  height: number; // total optical height (ascent - descent)
  ascent: number; // pixels above baseline
  descent: number; // pixels below baseline (positive distance)
  lineHeight: number; // default baseline distance
  glyphAdvances: number[];
}

export interface MeasuredBlockMetrics {
  lineWidths: number[];
  maxLineWidth: number;
  totalHeight: number;
  lineHeight: number;
  ascent: number;
  descent: number;
}

// In-memory cache of parsed font binary tables
const FONT_METRICS_CACHE = new Map<string, ParsedFontMetrics>();

/**
 * Parses TrueType / OpenType SFNT tables directly from buffer.
 */
export function parseTrueTypeFont(buffer: Buffer, fontPath: string): ParsedFontMetrics {
  if (buffer.length < 12) {
    throw new Error(`Font file too small: ${fontPath}`);
  }

  const numTables = buffer.readUInt16BE(4);
  const tables: Record<string, { offset: number; length: number }> = {};
  let off = 12;

  for (let i = 0; i < numTables; i++) {
    if (off + 16 > buffer.length) break;
    const tag = buffer.toString('ascii', off, off + 4);
    const offset = buffer.readUInt32BE(off + 8);
    const length = buffer.readUInt32BE(off + 12);
    tables[tag] = { offset, length };
    off += 16;
  }

  // 1. Parse 'head' table for unitsPerEm
  if (!tables['head']) {
    throw new Error(`Missing 'head' table in font: ${fontPath}`);
  }
  const headOffset = tables['head'].offset;
  const unitsPerEm = buffer.readUInt16BE(headOffset + 18) || 1000;

  // 2. Parse 'hhea' table for ascender, descender, lineGap, numberOfHMetrics
  if (!tables['hhea']) {
    throw new Error(`Missing 'hhea' table in font: ${fontPath}`);
  }
  const hheaOffset = tables['hhea'].offset;
  const ascender = buffer.readInt16BE(hheaOffset + 4);
  const descender = buffer.readInt16BE(hheaOffset + 6);
  const lineGap = buffer.readInt16BE(hheaOffset + 8);
  const numberOfHMetrics = buffer.readUInt16BE(hheaOffset + 34);

  // 3. Parse 'hmtx' table for advance widths
  if (!tables['hmtx']) {
    throw new Error(`Missing 'hmtx' table in font: ${fontPath}`);
  }
  const hmtxOffset = tables['hmtx'].offset;
  const glyphAdvances = new Uint16Array(numberOfHMetrics);
  for (let i = 0; i < numberOfHMetrics; i++) {
    glyphAdvances[i] = buffer.readUInt16BE(hmtxOffset + i * 4);
  }

  // 4. Parse 'cmap' table for Unicode to Glyph ID mapping
  const unicodeToGlyph = new Map<number, number>();
  if (tables['cmap']) {
    const cmapOffset = tables['cmap'].offset;
    const numSubtables = buffer.readUInt16BE(cmapOffset + 2);
    let subtableOffset = 0;
    let format = 0;

    // Search for Unicode subtables (Platform 0 or Platform 3 Windows Unicode)
    for (let i = 0; i < numSubtables; i++) {
      const platformId = buffer.readUInt16BE(cmapOffset + 4 + i * 8);
      const encodingId = buffer.readUInt16BE(cmapOffset + 6 + i * 8);
      const offset = buffer.readUInt32BE(cmapOffset + 8 + i * 8);

      if (platformId === 0 || (platformId === 3 && (encodingId === 1 || encodingId === 10))) {
        subtableOffset = cmapOffset + offset;
        format = buffer.readUInt16BE(subtableOffset);
        if (format === 4 || format === 12) break;
      }
    }

    if (format === 4 && subtableOffset > 0) {
      // Format 4: Segment mapping for BMP
      const segCountX2 = buffer.readUInt16BE(subtableOffset + 6);
      const segCount = segCountX2 / 2;
      const endCodesOffset = subtableOffset + 14;
      const startCodesOffset = endCodesOffset + segCountX2 + 2;
      const idDeltasOffset = startCodesOffset + segCountX2;
      const idRangeOffsetsOffset = idDeltasOffset + segCountX2;

      for (let s = 0; s < segCount - 1; s++) {
        const startCode = buffer.readUInt16BE(startCodesOffset + s * 2);
        const endCode = buffer.readUInt16BE(endCodesOffset + s * 2);
        const idDelta = buffer.readInt16BE(idDeltasOffset + s * 2);
        const idRangeOffset = buffer.readUInt16BE(idRangeOffsetsOffset + s * 2);

        for (let c = startCode; c <= endCode; c++) {
          let glyphId = 0;
          if (idRangeOffset === 0) {
            glyphId = (c + idDelta) & 0xffff;
          } else {
            const glyphOffset = idRangeOffsetsOffset + s * 2 + idRangeOffset + (c - startCode) * 2;
            if (glyphOffset + 2 <= buffer.length) {
              const val = buffer.readUInt16BE(glyphOffset);
              if (val !== 0) {
                glyphId = (val + idDelta) & 0xffff;
              }
            }
          }
          if (glyphId > 0) {
            unicodeToGlyph.set(c, glyphId);
          }
        }
      }
    } else if (format === 12 && subtableOffset > 0) {
      // Format 12: Segmented coverage for full Unicode range
      const numGroups = buffer.readUInt32BE(subtableOffset + 12);
      let groupOff = subtableOffset + 16;
      for (let g = 0; g < numGroups; g++) {
        const startCharCode = buffer.readUInt32BE(groupOff);
        const endCharCode = buffer.readUInt32BE(groupOff + 4);
        let startGlyphID = buffer.readUInt32BE(groupOff + 8);
        for (let c = startCharCode; c <= endCharCode; c++) {
          unicodeToGlyph.set(c, startGlyphID);
          startGlyphID++;
        }
        groupOff += 12;
      }
    }
  }

  return {
    fontPath,
    unitsPerEm,
    ascender,
    descender,
    lineGap,
    numberOfHMetrics,
    glyphAdvances,
    unicodeToGlyph,
  };
}

/**
 * Loads and caches font metrics from a local font file path.
 */
export function getFontMetrics(filePath: string): ParsedFontMetrics {
  const cached = FONT_METRICS_CACHE.get(filePath);
  if (cached) return cached;

  if (!fs.existsSync(filePath)) {
    throw new Error(`Font file does not exist on disk: ${filePath}`);
  }

  const buffer = fs.readFileSync(filePath);
  const parsed = parseTrueTypeFont(buffer, filePath);
  FONT_METRICS_CACHE.set(filePath, parsed);
  return parsed;
}

/**
 * Measures an individual character's advance width in font units.
 */
export function getCharAdvance(metrics: ParsedFontMetrics, charCode: number): number {
  const glyphId = metrics.unicodeToGlyph.get(charCode) ?? 0;
  if (glyphId < metrics.glyphAdvances.length) {
    return metrics.glyphAdvances[glyphId];
  }
  // If glyphId exceeds numberOfHMetrics, TrueType spec says the last advance applies
  if (metrics.glyphAdvances.length > 0) {
    return metrics.glyphAdvances[metrics.glyphAdvances.length - 1];
  }
  return metrics.unitsPerEm * 0.5; // fallback
}

export interface MeasureTextOptions {
  fontFile?: string;
  family?: string;
  weight?: number;
  style?: 'normal' | 'italic';
  text: string;
  fontSize: number;
  letterSpacing?: number; // relative fraction of font size (e.g. 0.01 = +1% fontSize)
}

/**
 * Measures single-line text using exact glyph metrics from the local font file.
 */
export function measureText(options: MeasureTextOptions): MeasuredTextMetrics {
  const { text, fontSize, letterSpacing = 0 } = options;
  const filePath = options.fontFile ?? fontFilePath(options.family || 'Inter', options.weight || 400, options.style || 'normal');
  const metrics = getFontMetrics(filePath);

  const scale = fontSize / metrics.unitsPerEm;
  const trackingPx = letterSpacing * fontSize;

  let totalAdvance = 0;
  const advances: number[] = [];

  for (let i = 0; i < text.length; i++) {
    const code = text.codePointAt(i)!;
    const advanceUnits = getCharAdvance(metrics, code);
    const advancePx = advanceUnits * scale + trackingPx;
    advances.push(advancePx);
    totalAdvance += advancePx;

    // Handle surrogate pairs
    if (code > 0xffff) i++;
  }

  const ascentPx = Math.round(metrics.ascender * scale);
  const descentPx = Math.round(Math.abs(metrics.descender) * scale);
  const heightPx = ascentPx + descentPx;
  const defaultLineHeight = Math.round((metrics.ascender - metrics.descender + metrics.lineGap) * scale);

  return {
    width: Math.round(totalAdvance),
    height: heightPx,
    ascent: ascentPx,
    descent: descentPx,
    lineHeight: defaultLineHeight,
    glyphAdvances: advances,
  };
}

export interface MeasureBlockOptions {
  fontFile?: string;
  family?: string;
  weight?: number;
  style?: 'normal' | 'italic';
  lines: string[];
  fontSize: number;
  lineHeightMultiplier?: number;
  letterSpacing?: number;
}

/**
 * Measures a multi-line text block using exact glyph metrics from the local font file.
 */
export function measureMultiLineBlock(options: MeasureBlockOptions): MeasuredBlockMetrics {
  const { lines, fontSize, lineHeightMultiplier = 1.15, letterSpacing = 0 } = options;
  const filePath = options.fontFile ?? fontFilePath(options.family || 'Inter', options.weight || 400, options.style || 'normal');
  const metrics = getFontMetrics(filePath);

  const scale = fontSize / metrics.unitsPerEm;
  const lineWidths: number[] = [];

  for (const line of lines) {
    const lineMeasure = measureText({
      fontFile: filePath,
      text: line,
      fontSize,
      letterSpacing,
    });
    lineWidths.push(lineMeasure.width);
  }

  const maxLineWidth = lineWidths.length > 0 ? Math.max(...lineWidths) : 0;
  const lineHeightPx = Math.round(fontSize * lineHeightMultiplier);
  const ascentPx = Math.round(metrics.ascender * scale);
  const descentPx = Math.round(Math.abs(metrics.descender) * scale);

  const totalHeight = lines.length > 1
    ? Math.round((lines.length - 1) * lineHeightPx + ascentPx + descentPx)
    : ascentPx + descentPx;

  return {
    lineWidths,
    maxLineWidth,
    totalHeight,
    lineHeight: lineHeightPx,
    ascent: ascentPx,
    descent: descentPx,
  };
}

export interface TypographicMassMetrics {
  massProxy: number;
  totalAdvancePx: number;
  opticalHeightPx: number;
  weightRatio: number;
  capHeightRatio: number;
  lineCount: number;
}

/**
 * Calculates physical typographic mass proxy from exact TrueType glyph advances,
 * optical ascender/descender bounds, font weight, physical font size, and line count.
 * Note: Contrast is explicitly excluded here to keep physical mass and visual contrast separated.
 */
export function calculateTypographicMassProxy(options: {
  fontFile?: string;
  family?: string;
  weight?: number;
  style?: 'normal' | 'italic';
  lines: string[];
  fontSize: number;
}): TypographicMassMetrics {
  const { lines, fontSize, weight = 400, style = 'normal' } = options;
  const filePath = options.fontFile ?? fontFilePath(options.family || 'Inter', weight, style);
  const metrics = getFontMetrics(filePath);
  const scale = fontSize / metrics.unitsPerEm;

  let totalAdvanceUnits = 0;
  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      const code = line.charCodeAt(i);
      const glyphId = metrics.unicodeToGlyph.get(code) ?? 0;
      const adv = glyphId < metrics.glyphAdvances.length ? metrics.glyphAdvances[glyphId] : metrics.unitsPerEm * 0.5;
      totalAdvanceUnits += adv;
    }
  }

  const totalAdvancePx = totalAdvanceUnits * scale;
  const ascenderPx = metrics.ascender * scale;
  const descentPx = Math.abs(metrics.descender) * scale;
  const opticalHeightPx = ascenderPx + descentPx;
  const weightRatio = 0.60 + (weight / 1000) * 0.90;
  const capHeightRatio = metrics.ascender / metrics.unitsPerEm;

  const massProxy = Number(((totalAdvancePx * opticalHeightPx * weightRatio) / 1000).toFixed(2));

  return {
    massProxy,
    totalAdvancePx: Math.round(totalAdvancePx),
    opticalHeightPx: Math.round(opticalHeightPx),
    weightRatio: Number(weightRatio.toFixed(3)),
    capHeightRatio: Number(capHeightRatio.toFixed(3)),
    lineCount: lines.length,
  };
}

