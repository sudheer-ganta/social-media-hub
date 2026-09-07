/**
 * Real-pipeline visual verification of the style-fidelity work (Phases 1-7).
 * Runs the ACTUAL creativeGenerationService.generate() — real Gemini calls,
 * real Cloudinary uploads, real DB rows — for the same prompt across several
 * StyleDnaIds, and captures everything the audit needs to judge fidelity:
 * the structured logs each stage already emits (recipeSource, styleFidelity,
 * repair attempts, reference degradation), the persisted CreativeDirection
 * and typography, and the final image itself (downloaded locally so it can
 * actually be looked at, not just measured).
 *
 * Read-only with respect to source code — this is a diagnostic script, same
 * pattern as the existing verify-dogfood-*.ts scripts in this directory.
 *
 *   cd server && npx ts-node --transpile-only src/scripts/verify-style-fidelity-visual.ts <userId> <outDir> [styleId,styleId,...]
 */
import fs from 'fs';
import path from 'path';
import { creativeGenerationService } from '../services/creative-generation.service';
import { resolvePalette } from '../ai/render/layout-plan';
import { getStyleDNA, type StyleDnaId } from '../ai/style-dna/style-dna';

const userId = process.argv[2];
const OUT_DIR = process.argv[3] || path.resolve(__dirname, '../../../style-fidelity-out');
const STYLES: StyleDnaId[] = (process.argv[4]?.split(',') as StyleDnaId[] | undefined) ?? [
  'minimal-doodles',
  'minimalist',
  'y2k',
  'luxury',
  'neo-brutalism',
  'cinematic-drama',
  'desi-maximalism',
  'collage',
];

const PROMPT = 'Create an Instagram post promoting Korean spicy famous noodles.';

if (!userId) {
  console.error('Usage: verify-style-fidelity-visual.ts <userId> <outDir> [styleId,styleId,...]');
  process.exit(1);
}
fs.mkdirSync(OUT_DIR, { recursive: true });

// ── Capture structured logs during one generate() call without touching source ──
type LogRecord = { level: 'info' | 'warn'; args: unknown[] };

function withCapturedLogs<T>(fn: () => Promise<T>): Promise<{ result: T; logs: LogRecord[] }> {
  const logs: LogRecord[] = [];
  const originalInfo = console.info;
  const originalWarn = console.warn;
  console.info = (...args: unknown[]) => {
    logs.push({ level: 'info', args });
    originalInfo(...args);
  };
  console.warn = (...args: unknown[]) => {
    logs.push({ level: 'warn', args });
    originalWarn(...args);
  };
  return fn()
    .then((result) => ({ result, logs }))
    .finally(() => {
      console.info = originalInfo;
      console.warn = originalWarn;
    });
}

function findLog(logs: LogRecord[], tag: string): Record<string, unknown> | undefined {
  const entry = logs.find((l) => typeof l.args[0] === 'string' && (l.args[0] as string).includes(tag));
  return entry?.args[1] as Record<string, unknown> | undefined;
}

function findAllLogs(logs: LogRecord[], tag: string): Array<Record<string, unknown> | undefined> {
  return logs.filter((l) => typeof l.args[0] === 'string' && (l.args[0] as string).includes(tag)).map((l) => l.args[1] as Record<string, unknown> | undefined);
}

async function saveFromUrl(file: string, url: string) {
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(file, buf);
}

interface StyleReport {
  styleId: string;
  requestedAt: string;
  assetId?: string;
  imageUrl?: string;
  localImagePath?: string;
  error?: string;

  resolvedStyleDnaId?: string;
  resolvedStyleDnaSource?: string;
  resolvedStyleDnaVariant?: number;

  directionAttempts?: number;
  repairAttempted?: boolean;
  repairSucceeded?: boolean;
  stillMissing?: unknown;
  stillStyleNonCompliant?: unknown;

  creativeDirection?: Record<string, unknown>;

  recipeSource?: string;
  structure?: string;
  styleFidelityCompliant?: boolean;
  styleFidelityViolations?: unknown;

  typography?: { headline?: string; body?: string; accent?: string };

  finalPalette?: { ink: string; paper: string; accent: string };

  referenceCount?: number;
  referenceDegraded?: boolean;
  degradationWarnings?: unknown[];
  recipeFellBackWarning?: unknown;
  styleMismatchWarning?: unknown;

  imageCalls?: number;
  textCalls?: number;
  cloudinaryUploads?: number;
}

async function run() {
  const reports: StyleReport[] = [];

  for (const styleId of STYLES) {
    console.log('\n' + '='.repeat(70) + `\nSTYLE: ${styleId}\n` + '='.repeat(70));
    const report: StyleReport = { styleId, requestedAt: new Date().toISOString() };

    try {
      const { result: asset, logs } = await withCapturedLogs(() =>
        creativeGenerationService.generate(userId, {
          prompt: PROMPT,
          contextType: 'personal',
          styleId,
          goal: 'brand_awareness',
          funnelStage: 'TOFU',
          platforms: ['instagram'],
        }),
      );

      report.assetId = asset.id;
      report.imageUrl = asset.imageUrl ?? undefined;
      report.creativeDirection = asset.creativeBrief as unknown as Record<string, unknown>;
      report.typography = asset.typography as { headline?: string; body?: string; accent?: string } | undefined;

      const rc = asset.renderContext as { styleDna?: { id: string; variant: number; source: string } } | null;
      report.resolvedStyleDnaId = rc?.styleDna?.id;
      report.resolvedStyleDnaSource = rc?.styleDna?.source;
      report.resolvedStyleDnaVariant = rc?.styleDna?.variant;

      const directionLog = findLog(logs, '[ai] creative direction generated');
      report.directionAttempts = directionLog?.directionAttempts as number | undefined;
      report.repairAttempted = directionLog?.repairAttempted as boolean | undefined;
      report.repairSucceeded = directionLog?.repairSucceeded as boolean | undefined;
      report.stillMissing = directionLog?.stillMissing;
      report.stillStyleNonCompliant = directionLog?.stillStyleNonCompliant;

      const rendererLog = findLog(logs, '[creative] renderer completed');
      report.recipeSource = rendererLog?.recipeSource as string | undefined;
      report.structure = rendererLog?.structure as string | undefined;
      report.styleFidelityCompliant = rendererLog?.styleFidelityCompliant as boolean | undefined;
      report.styleFidelityViolations = rendererLog?.styleFidelityViolations;

      const imageStartLog = findLog(logs, '[creative] image generation started');
      report.referenceCount = imageStartLog?.referenceCount as number | undefined;
      report.referenceDegraded = imageStartLog?.referenceDegraded as boolean | undefined;
      report.degradationWarnings = findAllLogs(logs, '[creative] reference degradation');
      report.recipeFellBackWarning = findLog(logs, '[creative] selected style did not reach the renderer');
      report.styleMismatchWarning = findLog(logs, '[creative] finished render does not fully match');

      const timingLog = findLog(logs, '[creative] request timing');
      report.imageCalls = timingLog?.imageCalls as number | undefined;
      report.textCalls = timingLog?.textCalls as number | undefined;
      report.cloudinaryUploads = timingLog?.cloudinaryUploads as number | undefined;

      // Final resolved palette — same pure function + same inputs the renderer used
      // (recipe.colorPalette is always [] from styleDnaToRecipe; direction.palette
      // and creativeDna.brandColors are the only real inputs).
      const direction = asset.creativeBrief as unknown as { palette?: string[] };
      const creativeDna = (asset.renderContext as { creativeDna?: { brandColors?: string[] } } | null)?.creativeDna;
      report.finalPalette = resolvePalette(creativeDna?.brandColors ?? [], [], direction.palette ?? []);

      if (asset.imageUrl) {
        const localPath = path.join(OUT_DIR, `${styleId}.png`);
        await saveFromUrl(localPath, asset.imageUrl);
        report.localImagePath = localPath;
      }
    } catch (error) {
      report.error = error instanceof Error ? error.message : String(error);
      console.error(`FAILED for ${styleId}:`, error);
    }

    reports.push(report);
    fs.writeFileSync(path.join(OUT_DIR, '_report.json'), JSON.stringify(reports, null, 2));
  }

  console.log('\n' + '='.repeat(70) + '\nSUMMARY\n' + '='.repeat(70));
  for (const r of reports) {
    console.log(`\n${r.styleId}`);
    console.log('  resolvedStyleDna:', r.resolvedStyleDnaId, r.resolvedStyleDnaSource, 'variant', r.resolvedStyleDnaVariant);
    console.log('  recipeSource:', r.recipeSource, '| structure:', r.structure);
    console.log('  typography:', JSON.stringify(r.typography));
    console.log('  finalPalette:', JSON.stringify(r.finalPalette));
    console.log('  styleFidelity compliant:', r.styleFidelityCompliant, 'violations:', JSON.stringify(r.styleFidelityViolations));
    console.log('  direction: mood=%j lighting=%j composition=%j palette=%j', (r.creativeDirection as any)?.mood, (r.creativeDirection as any)?.lighting, (r.creativeDirection as any)?.composition, (r.creativeDirection as any)?.palette);
    console.log('  repairAttempted:', r.repairAttempted, 'repairSucceeded:', r.repairSucceeded, 'directionAttempts:', r.directionAttempts);
    console.log('  referenceCount:', r.referenceCount, 'referenceDegraded:', r.referenceDegraded);
    console.log('  imageCalls:', r.imageCalls, 'textCalls:', r.textCalls);
    console.log('  imageUrl:', r.imageUrl);
    console.log('  local:', r.localImagePath);
    if (r.error) console.log('  ERROR:', r.error);
  }

  console.log('\nFull JSON report:', path.join(OUT_DIR, '_report.json'));
  console.log('DONE —', OUT_DIR);
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('verify-style-fidelity-visual failed:', error);
    process.exit(1);
  });
