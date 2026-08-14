/**
 * Dogfood round 7 — the reference-driven design system, end to end (spec §16).
 *
 * Five cases:
 *   A. Tactile editorial (Seven Sisters-style) references + momo promotion
 *   B. Same prompt + bold modern graphic references
 *   C. Same prompt + minimal premium references
 *   D. FlowPost promotion + tactile editorial references
 *   E. FlowPost promotion + modern SaaS references
 *
 * Reference sets are synthesized as real posters (so each set carries ONE
 * unambiguous design language), uploaded to Cloudinary, and analysed through
 * the production vision path. Every case saves: the ReferenceDesignRecipe,
 * the LayoutPlan, the raw Gemini visual, and the finished creative.
 *
 *   cd server && npx ts-node --transpile-only src/scripts/verify-dogfood-7-design-system.ts <userId> <outDir>
 */
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import sharp from 'sharp';

const userId = process.argv[2] || '00000000-0000-4000-8000-000000000000';
const outDir = process.argv[3] || path.join(__dirname, '..', '..', '..', 'dogfood-7-output');
// Read at call time by the service's debug tap, so import hoisting is harmless.
process.env.CREATIVE_DEBUG_DIR = outDir;

import { creativeGenerationService } from '../services/creative-generation.service';
import { generateReferenceStyleProfile } from '../ai/generators/reference-style.generator';
import { providerForRole } from '../ai';
import { cloudinaryService } from '../services/cloudinary.service';

// ─── Synthetic reference posters — one clear design language per set ────────

const TACTILE_POSTER = `<svg width="800" height="1000" viewBox="0 0 800 1000" xmlns="http://www.w3.org/2000/svg">
  <rect width="800" height="1000" fill="#f2e7d5"/>
  <text x="64" y="200" font-family="Georgia, serif" font-size="92" font-weight="700" fill="#5a3a22">The Long</text>
  <text x="64" y="300" font-family="Georgia, serif" font-size="92" font-weight="700" fill="#5a3a22">Autumn Table</text>
  <path d="M64 340 Q120 332 180 340 T300 338" stroke="#b0742c" stroke-width="5" fill="none" stroke-linecap="round"/>
  <text x="64" y="400" font-family="Segoe UI, sans-serif" font-size="26" letter-spacing="4" fill="#7a5b3a">SLOW EVENINGS · SHARED PLATES</text>
  <rect x="64" y="470" width="672" height="300" fill="#c9a06b" opacity="0.35"/>
  <path d="M0 850 L60 842 L130 856 L210 844 L300 858 L390 846 L480 856 L570 844 L660 854 L740 846 L800 852 L800 1000 L0 1000 Z" fill="#5a3a22"/>
  <text x="64" y="930" font-family="Georgia, serif" font-size="30" font-style="italic" fill="#f2e7d5">Cooked slowly, told warmly.</text>
  <text x="64" y="972" font-family="Segoe UI, sans-serif" font-size="20" letter-spacing="3" fill="#d9c4a5">EST. 1998 · OLD TOWN LANE</text>
  <filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2"/><feColorMatrix type="matrix" values="0 0 0 0 0.4 0 0 0 0 0.35 0 0 0 0 0.3 0 0 0 0.6 0"/></filter>
  <rect width="800" height="1000" filter="url(#g)" opacity="0.08"/>
</svg>`;

const TACTILE_MENU = `<svg width="800" height="1000" viewBox="0 0 800 1000" xmlns="http://www.w3.org/2000/svg">
  <rect width="800" height="1000" fill="#ece0c8"/>
  <rect x="48" y="48" width="704" height="904" fill="none" stroke="#6b4a2b" stroke-width="2"/>
  <text x="400" y="180" font-family="Georgia, serif" font-size="64" font-weight="700" fill="#6b4a2b" text-anchor="middle">Evening Menu</text>
  <path d="M280 220 Q340 212 400 220 T520 218" stroke="#b0742c" stroke-width="4" fill="none" stroke-linecap="round"/>
  <text x="400" y="320" font-family="Georgia, serif" font-size="34" font-style="italic" fill="#7a5b3a" text-anchor="middle">first, something warm</text>
  <circle cx="400" cy="520" r="150" fill="#c9a06b" opacity="0.4"/>
  <text x="400" y="800" font-family="Segoe UI, sans-serif" font-size="22" letter-spacing="4" fill="#7a5b3a" text-anchor="middle">HANDED OVER THE COUNTER SINCE 1998</text>
  <filter id="g2"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2"/><feColorMatrix type="matrix" values="0 0 0 0 0.4 0 0 0 0 0.35 0 0 0 0 0.3 0 0 0 0.6 0"/></filter>
  <rect width="800" height="1000" filter="url(#g2)" opacity="0.09"/>
</svg>`;

const BOLD_A = `<svg width="800" height="1000" viewBox="0 0 800 1000" xmlns="http://www.w3.org/2000/svg">
  <rect width="800" height="1000" fill="#e63122"/>
  <rect x="0" y="0" width="800" height="1000" fill="none" stroke="#111111" stroke-width="28"/>
  <text x="60" y="270" font-family="Arial Narrow, sans-serif" font-size="170" font-weight="900" fill="#111111" letter-spacing="-4">TURN</text>
  <text x="60" y="430" font-family="Arial Narrow, sans-serif" font-size="170" font-weight="900" fill="#f7d417" letter-spacing="-4">IT UP</text>
  <rect x="60" y="500" width="300" height="44" fill="#111111"/>
  <text x="72" y="532" font-family="Arial, sans-serif" font-size="26" font-weight="700" fill="#e63122" letter-spacing="6">NO HALF MEASURES</text>
  <polygon points="600,700 780,620 780,860" fill="#f7d417"/>
  <circle cx="200" cy="800" r="90" fill="#111111"/>
</svg>`;

const BOLD_B = `<svg width="800" height="1000" viewBox="0 0 800 1000" xmlns="http://www.w3.org/2000/svg">
  <rect width="800" height="1000" fill="#f7d417"/>
  <text x="400" y="360" font-family="Arial Narrow, sans-serif" font-size="230" font-weight="900" fill="#111111" text-anchor="middle" letter-spacing="-8">LOUD</text>
  <text x="400" y="560" font-family="Arial Narrow, sans-serif" font-size="230" font-weight="900" fill="#e63122" text-anchor="middle" letter-spacing="-8">ER.</text>
  <rect x="0" y="820" width="800" height="180" fill="#111111"/>
  <text x="400" y="930" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#f7d417" text-anchor="middle" letter-spacing="8">EVERY. SINGLE. DAY.</text>
  <defs><pattern id="h" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="5" cy="5" r="2.4" fill="#111111"/></pattern></defs>
  <rect x="560" y="60" width="180" height="180" fill="url(#h)"/>
</svg>`;

const BOLD_C = `<svg width="800" height="1000" viewBox="0 0 800 1000" xmlns="http://www.w3.org/2000/svg">
  <rect width="800" height="1000" fill="#111111"/>
  <polygon points="0,0 800,240 800,320 0,80" fill="#e63122"/>
  <text x="60" y="520" font-family="Arial Narrow, sans-serif" font-size="150" font-weight="900" fill="#ffffff" letter-spacing="-3">MAKE IT</text>
  <text x="60" y="670" font-family="Arial Narrow, sans-serif" font-size="150" font-weight="900" fill="#e63122" letter-spacing="-3">IMPOSSIBLE</text>
  <text x="60" y="820" font-family="Arial Narrow, sans-serif" font-size="150" font-weight="900" fill="#ffffff" letter-spacing="-3">TO IGNORE</text>
  <rect x="60" y="880" width="220" height="52" fill="#f7d417"/>
  <text x="80" y="916" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#111111" letter-spacing="4">START NOW</text>
</svg>`;

const MINIMAL_A = `<svg width="800" height="1000" viewBox="0 0 800 1000" xmlns="http://www.w3.org/2000/svg">
  <rect width="800" height="1000" fill="#fafaf7"/>
  <rect x="40" y="40" width="720" height="920" fill="none" stroke="#1c1c1a" stroke-width="1"/>
  <text x="400" y="480" font-family="Georgia, serif" font-size="44" fill="#1c1c1a" text-anchor="middle" letter-spacing="10">MAISON</text>
  <line x1="360" y1="520" x2="440" y2="520" stroke="#1c1c1a" stroke-width="1"/>
  <text x="400" y="560" font-family="Segoe UI, sans-serif" font-size="16" fill="#8a8a85" text-anchor="middle" letter-spacing="6">QUIETLY MADE</text>
</svg>`;

const MINIMAL_B = `<svg width="800" height="1000" viewBox="0 0 800 1000" xmlns="http://www.w3.org/2000/svg">
  <rect width="800" height="1000" fill="#ffffff"/>
  <circle cx="400" cy="430" r="70" fill="#e8e6e1"/>
  <circle cx="400" cy="430" r="70" fill="none" stroke="#1c1c1a" stroke-width="1"/>
  <text x="400" y="880" font-family="Segoe UI, sans-serif" font-size="15" fill="#8a8a85" text-anchor="middle" letter-spacing="5">NOTHING UNNECESSARY</text>
</svg>`;

const MINIMAL_C = `<svg width="800" height="1000" viewBox="0 0 800 1000" xmlns="http://www.w3.org/2000/svg">
  <rect width="800" height="1000" fill="#f4f4f1"/>
  <text x="80" y="140" font-family="Georgia, serif" font-size="30" fill="#1c1c1a" letter-spacing="2">A single good thing,</text>
  <text x="80" y="185" font-family="Georgia, serif" font-size="30" fill="#1c1c1a" letter-spacing="2">made properly.</text>
  <line x1="80" y1="880" x2="240" y2="880" stroke="#1c1c1a" stroke-width="1"/>
  <text x="80" y="920" font-family="Segoe UI, sans-serif" font-size="15" fill="#8a8a85" letter-spacing="5">SINCE 2011</text>
</svg>`;

const SAAS_A = `<svg width="800" height="1000" viewBox="0 0 800 1000" xmlns="http://www.w3.org/2000/svg">
  <rect width="800" height="1000" fill="#ffffff"/>
  <text x="64" y="180" font-family="Segoe UI, sans-serif" font-size="72" font-weight="700" fill="#0b1220">Ship work,</text>
  <text x="64" y="260" font-family="Segoe UI, sans-serif" font-size="72" font-weight="700" fill="#2563eb">not busywork.</text>
  <text x="64" y="330" font-family="Segoe UI, sans-serif" font-size="26" fill="#5a6472">One place for the whole team to move faster.</text>
  <rect x="64" y="400" width="672" height="380" rx="24" fill="#eef3fe"/>
  <rect x="104" y="450" width="280" height="28" rx="14" fill="#c8d8fa"/>
  <rect x="104" y="500" width="480" height="28" rx="14" fill="#dfe8fc"/>
  <rect x="104" y="550" width="380" height="28" rx="14" fill="#dfe8fc"/>
  <rect x="64" y="850" width="240" height="64" rx="32" fill="#2563eb"/>
  <text x="184" y="892" font-family="Segoe UI, sans-serif" font-size="26" font-weight="600" fill="#ffffff" text-anchor="middle">Get started</text>
</svg>`;

const SAAS_B = `<svg width="800" height="1000" viewBox="0 0 800 1000" xmlns="http://www.w3.org/2000/svg">
  <rect width="800" height="1000" fill="#0b1220"/>
  <text x="64" y="220" font-family="Segoe UI, sans-serif" font-size="88" font-weight="700" fill="#ffffff">Less noise.</text>
  <text x="64" y="320" font-family="Segoe UI, sans-serif" font-size="88" font-weight="700" fill="#60a5fa">More signal.</text>
  <line x1="64" y1="400" x2="736" y2="400" stroke="#243044" stroke-width="1"/>
  <line x1="64" y1="500" x2="736" y2="500" stroke="#243044" stroke-width="1"/>
  <line x1="64" y1="600" x2="736" y2="600" stroke="#243044" stroke-width="1"/>
  <rect x="64" y="860" width="220" height="60" rx="8" fill="#2563eb"/>
  <text x="174" y="900" font-family="Segoe UI, sans-serif" font-size="24" font-weight="600" fill="#ffffff" text-anchor="middle">Try it free</text>
</svg>`;

const SAAS_C = `<svg width="800" height="1000" viewBox="0 0 800 1000" xmlns="http://www.w3.org/2000/svg">
  <rect width="800" height="1000" fill="#f6f8fb"/>
  <rect x="64" y="64" width="672" height="500 " rx="20" fill="#ffffff" stroke="#e3e9f2" stroke-width="2"/>
  <rect x="104" y="120" width="200" height="200" rx="16" fill="#2563eb" opacity="0.12"/>
  <rect x="330" y="120" width="360" height="24" rx="12" fill="#dbe4f2"/>
  <rect x="330" y="170" width="280" height="24" rx="12" fill="#e8eef8"/>
  <text x="64" y="680" font-family="Segoe UI, sans-serif" font-size="56" font-weight="700" fill="#0b1220">Everything in one flow</text>
  <text x="64" y="740" font-family="Segoe UI, sans-serif" font-size="24" fill="#5a6472">Plan, publish and learn without leaving the page.</text>
  <rect x="0" y="900" width="800" height="100" fill="#0b1220"/>
  <text x="64" y="962" font-family="Segoe UI, sans-serif" font-size="20" fill="#93a5bd" letter-spacing="2">TRUSTED BY 4,000 TEAMS</text>
</svg>`;

// Real photography for the tactile set — the language needs a photographic
// register too, not just print design. Known-good Wikimedia files from round 6.
const WIKI_PAPER = 'https://upload.wikimedia.org/wikipedia/commons/1/1c/Free_dark_vintage_paper_page_texture_for_layers_%282982207584%29.jpg';
const WIKI_DUMPLINGS = 'https://upload.wikimedia.org/wikipedia/commons/7/70/Asian_Dumplings_%28Jiaozi%29_by_ArmAg.jpg';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** This machine's route to Cloudinary drops for minutes at a time — retry with a real backoff instead of dying at the first blip. */
async function withNetworkRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.warn(`  ${label}: attempt ${attempt} failed (${error instanceof Error ? error.message : error}) — backing off`);
      await sleep(attempt * 8000);
    }
  }
  throw lastError;
}

async function uploadSvgPoster(svg: string, label: string): Promise<string> {
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const uploaded = await withNetworkRetry(`upload ${label}`, () => cloudinaryService.uploadImageBuffer(png, 'image/png'));
  console.log(`  uploaded reference "${label}": ${uploaded.url}`);
  return uploaded.url;
}

/** The Cloudinary CDN has shown cold-start timeouts right after upload — warm each URL until it actually serves. (Wikimedia URLs are long warm and 403 UA-less probes, so they're skipped.) */
async function warmUrls(allUrls: string[]) {
  const urls = allUrls.filter((url) => url.includes('res.cloudinary.com'));
  for (const url of urls) {
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
        break;
      } catch (error) {
        console.warn(`  warm-up attempt ${attempt} failed for ${url}`);
        if (attempt === 4) throw error;
      }
    }
  }
}

async function uploadLogo(): Promise<string> {
  const svgPath = path.join(__dirname, '..', '..', '..', 'public', 'favicon.svg');
  const png = await sharp(fs.readFileSync(svgPath), { density: 300 }).resize(512, 512).png().toBuffer();
  const uploaded = await cloudinaryService.uploadImageBuffer(png, 'image/png');
  console.log(`  uploaded FlowPost logo: ${uploaded.url}`);
  return uploaded.url;
}

interface CaseSpec {
  key: string;
  title: string;
  refSet: string;
  body: Record<string, unknown>;
}

async function saveOutputs(key: string, assetId: string, imageUrl: string | null) {
  if (imageUrl) {
    const response = await axios.get<ArrayBuffer>(imageUrl, { responseType: 'arraybuffer' });
    fs.writeFileSync(path.join(outDir, `${key}-final.png`), Buffer.from(response.data));
  }
  for (const [suffix, target] of [
    ['1-visual.png', `${key}-visual.png`],
    ['plan.json', `${key}-plan.json`],
  ] as const) {
    const src = path.join(outDir, `${assetId}-${suffix}`);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(outDir, target));
  }
}

async function run() {
  fs.mkdirSync(outDir, { recursive: true });
  console.log(`Output directory: ${outDir}\n`);

  // Reference uploads are cached across runs — this machine's Cloudinary route
  // is flaky, so every avoided upload is one fewer chance to die mid-run.
  const urlCachePath = path.join(outDir, 'reference-urls.json');
  let tactilePoster: string, tactileMenu: string, boldA: string, boldB: string, boldC: string;
  let minA: string, minB: string, minC: string, saasA: string, saasB: string, saasC: string, logoUrl: string;
  if (fs.existsSync(urlCachePath)) {
    console.log('Reusing previously uploaded reference posters (reference-urls.json)…');
    [tactilePoster, tactileMenu, boldA, boldB, boldC, minA, minB, minC, saasA, saasB, saasC, logoUrl] = JSON.parse(
      fs.readFileSync(urlCachePath, 'utf8'),
    );
  } else {
    console.log('Uploading synthetic reference posters + logo to Cloudinary…');
    [tactilePoster, tactileMenu, boldA, boldB, boldC, minA, minB, minC, saasA, saasB, saasC, logoUrl] =
      await Promise.all([
        uploadSvgPoster(TACTILE_POSTER, 'tactile-poster'),
        uploadSvgPoster(TACTILE_MENU, 'tactile-menu'),
        uploadSvgPoster(BOLD_A, 'bold-a'),
        uploadSvgPoster(BOLD_B, 'bold-b'),
        uploadSvgPoster(BOLD_C, 'bold-c'),
        uploadSvgPoster(MINIMAL_A, 'minimal-a'),
        uploadSvgPoster(MINIMAL_B, 'minimal-b'),
        uploadSvgPoster(MINIMAL_C, 'minimal-c'),
        uploadSvgPoster(SAAS_A, 'saas-a'),
        uploadSvgPoster(SAAS_B, 'saas-b'),
        uploadSvgPoster(SAAS_C, 'saas-c'),
        uploadLogo(),
      ]);
    fs.writeFileSync(urlCachePath, JSON.stringify([tactilePoster, tactileMenu, boldA, boldB, boldC, minA, minB, minC, saasA, saasB, saasC, logoUrl], null, 2));
  }

  const REF_SETS: Record<string, string[]> = {
    tactile: [tactilePoster, tactileMenu, WIKI_PAPER, WIKI_DUMPLINGS],
    bold: [boldA, boldB, boldC],
    minimal: [minA, minB, minC],
    saas: [saasA, saasB, saasC],
  };

  const momoBody = {
    prompt: 'Promote our momo dish for the weekend.',
    contextType: 'personal',
    brandVoice: { name: 'Seven Sisters', industry: 'Food / Restaurant' },
    goal: 'brand_awareness',
    funnelStage: 'TOFU',
    platforms: ['instagram'],
  };
  const flowpostBody = {
    prompt: "Promote FlowPost's one-composer workflow.",
    contextType: 'personal',
    brandVoice: { name: 'FlowPost', industry: 'Social media management software' },
    goal: 'brand_awareness',
    funnelStage: 'TOFU',
    platforms: ['linkedin'],
    creativeDna: { brandColors: ['#2563eb'], logoAssetUrl: logoUrl },
  };

  const cases: CaseSpec[] = [
    { key: 'caseA', title: 'A — tactile editorial refs + momo promotion', refSet: 'tactile', body: momoBody },
    { key: 'caseB', title: 'B — bold graphic refs + same momo prompt', refSet: 'bold', body: momoBody },
    { key: 'caseC', title: 'C — minimal premium refs + same momo prompt', refSet: 'minimal', body: momoBody },
    { key: 'caseD', title: 'D — FlowPost promotion + tactile editorial refs', refSet: 'tactile', body: flowpostBody },
    { key: 'caseE', title: 'E — FlowPost promotion + modern SaaS refs', refSet: 'saas', body: flowpostBody },
  ];

  // One vision analysis per reference SET, reused across its cases — mirrors a
  // member reusing a saved Creative Style Profile.
  console.log('\nWarming reference URLs on the CDN…');
  await warmUrls(Object.values(REF_SETS).flat());

  const profiles: Record<string, Awaited<ReturnType<typeof generateReferenceStyleProfile>>> = {};
  for (const setName of Object.keys(REF_SETS)) {
    console.log(`\nAnalysing reference set "${setName}"…`);
    for (let attempt = 1; attempt <= 2; attempt++) {
      profiles[setName] = await generateReferenceStyleProfile({
        provider: providerForRole('vision'),
        referenceUrls: REF_SETS[setName],
      });
      if (profiles[setName].analysed) break;
      console.warn(`  analysis came back empty (attempt ${attempt}) — retrying`);
    }
    if (!profiles[setName].analysed) throw new Error(`reference set "${setName}" could not be analysed — aborting rather than dogfooding a fallback`);
    console.log(`  visualLanguage: ${profiles[setName].visualLanguage}`);
    console.log(`  designRecipe: ${JSON.stringify(profiles[setName].designRecipe, null, 2)}`);
  }
  fs.writeFileSync(path.join(outDir, 'reference-profiles.json'), JSON.stringify(profiles, null, 2));

  const summary: Array<{ key: string; structure?: string; headline?: string; imageUrl?: string | null; error?: string }> = [];
  for (const c of cases) {
    console.log('\n' + '='.repeat(70), `\nCASE ${c.title}\n`, '='.repeat(70));
    try {
      // One retry per case — Cloudinary/Gemini transport blips shouldn't cost a whole run.
      const asset = await creativeGenerationService
        .generate(userId, { ...c.body, referenceStyleProfile: profiles[c.refSet] })
        .catch((error) => {
          console.warn(`  first attempt failed (${error instanceof Error ? error.message : error}) — retrying once`);
          return creativeGenerationService.generate(userId, { ...c.body, referenceStyleProfile: profiles[c.refSet] });
        });
      const brief = asset.creativeBrief;
      console.log('  headline:', JSON.stringify(brief.headline));
      console.log('  cta:', JSON.stringify(brief.cta));
      console.log('  artDirectionFamily:', brief.artDirectionFamily, '| aspectRatio:', brief.aspectRatio);
      await saveOutputs(c.key, asset.id, asset.imageUrl);
      console.log(`  saved: ${c.key}-final.png / ${c.key}-visual.png / ${c.key}-plan.json`);
      summary.push({ key: c.key, headline: brief.headline, imageUrl: asset.imageUrl });
    } catch (error) {
      console.error(`  CASE FAILED: ${error instanceof Error ? error.message : String(error)}`);
      summary.push({ key: c.key, error: error instanceof Error ? error.message : String(error) });
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('DONE — dogfood round 7. Compare side by side:');
  for (const s of summary) {
    console.log(`  ${s.key}: ${s.error ? `FAILED — ${s.error}` : s.headline}`);
  }
  console.log('\nExpected: A vs B vs C differ in typography, composition, footer, texture,');
  console.log('spacing and image treatment — not just colour. D echoes A\'s language on a');
  console.log('different brand; E looks like a different (SaaS) brand system entirely.');
}

run().catch((error) => {
  console.error('verify-dogfood-7-design-system failed:', error);
  process.exit(1);
});
