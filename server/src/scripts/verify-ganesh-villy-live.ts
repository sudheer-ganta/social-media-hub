import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import dotenv from 'dotenv';
dotenv.config();

import { geminiMarketingProvider, geminiVisionProvider } from '../ai/providers/gemini.provider';
import { geminiImageProvider } from '../ai/providers/gemini-image.provider';
import { buildCanonicalCreativeBrief } from '../ai/brand/creative-brief';
import { generateGraphicDesignConcept } from '../ai/generators/art-director.generator';
import { generateCreativeDirection } from '../ai/generators/creative-direction.generator';
import { designCreative } from '../ai/render/designer-composition';
import { getStyleDNA, resolveStyleDNA } from '../ai/style-dna/style-dna';
import { resolveBrandProfile } from '../ai/brand/brand-profile';
import { resolveCreativeDna } from '../ai/brand/creative-dna';
import { isStructuredArtifact } from '../ai/intent/copy-sanitizer';

async function getVillyLogo(): Promise<string> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="140" viewBox="0 0 500 140">
    <rect width="500" height="140" fill="none"/>
    <text x="250" y="70" font-family="sans-serif" font-weight="900" font-size="52" fill="#FFFFFF" text-anchor="middle" letter-spacing="4">VILLY AI</text>
    <text x="250" y="110" font-family="sans-serif" font-weight="500" font-size="16" fill="#D97706" text-anchor="middle" letter-spacing="3">2D VIRTUAL TRY-ON</text>
  </svg>`;
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return buf.toString('base64');
}

interface RunResult {
  runIndex: number;
  durationMs: number;
  imageCalls: number;
  textCalls: number;
  criticCalls: number;
  recoveryAttempts: number;
  finalCriticPassed: boolean;
  criticProblems: string[];
  criticFeedback?: string;
  observedFailures: string[];
  rawCopyItems: Array<{ role: string; text: string }>;
  renderableCopyItems: Array<{ role: string; text: string }>;
  structuredArtifactsFound: boolean;
  historicCorruptionFound: boolean;
  outputPath?: string;
}

async function runSingleValidation(runIndex: number, outputDir: string): Promise<RunResult> {
  console.log(`\n================================================================`);
  console.log(`>>> RUN ${runIndex}: EXACT GANESH CHATURTHI / VILLY AI GENERATION <<<`);
  console.log(`================================================================`);

  const startTime = Date.now();
  let imageCalls = 0;
  let textCalls = 0;
  let criticCalls = 0;

  const userPrompt = 'Ganesh Chaturthi special campaign for Villy AI virtual try-on from home. Experience 2D Try On for festive ethnic wear.';
  const requiredClaims = ['Ganesh Chaturthi', 'Villy AI', '2D virtual try-on'];

  const brand = resolveBrandProfile({
    brand: {
      name: 'Villy AI',
      description: 'Next-generation 2D virtual try-on technology bringing festive ethnic fashion fitting directly into your home.',
      tone: 'innovative, festive, confident, modern',
      wordsToUse: ['experience', 'try on', 'festive', 'home', 'fitting', 'ganesh chaturthi'],
      wordsToAvoid: ['unleash', 'disrupt', 'game-changing'],
    },
  });

  const creativeDna = resolveCreativeDna({
    creativeDna: {
      brandColors: ['#0f172a', '#d97706', '#f59e0b', '#ffffff'],
      mood: 'festive, vibrant, modern, high-tech',
    },
  });

  const styleDna = getStyleDNA('editorial')!;
  const resolvedStyleDna = resolveStyleDNA({ styleId: 'editorial', prompt: userPrompt })!;
  const logoData = await getVillyLogo();
  const logoAsset = { mimeType: 'image/png', data: logoData };

  // 1. Creative Strategy / Brief
  console.log(`[Stage 1] Building Canonical Brief...`);
  textCalls++;
  const brief = buildCanonicalCreativeBrief({
    userPrompt,
    brand,
    creativeDna,
    intent: {
      goal: 'ENGAGEMENT',
      funnelStage: 'MOFU',
      aspectRatio: '1:1',
      requiredClaims,
      keyPhrases: ['2D virtual try-on', 'Ganesh Chaturthi'],
    },
    styleDna: resolvedStyleDna,
  });

  // 2. Art Direction Concept
  console.log(`[Stage 2] Generating Art Direction Concept...`);
  textCalls++;
  const concept = await generateGraphicDesignConcept({
    brief,
    styleDna: resolvedStyleDna,
    provider: geminiMarketingProvider,
  });
  console.log(`  -> Concept: "${concept.conceptName}", Hero: ${concept.hero}, Composition: ${concept.compositionFamily}`);

  // 3. Creative Direction & Copy Synthesis
  console.log(`[Stage 3] Generating Creative Direction & Synthesizing Copy...`);
  textCalls++;
  const { direction } = await generateCreativeDirection({
    provider: geminiMarketingProvider,
    request: userPrompt,
    goal: 'event_promotion',
    funnelStage: 'MOFU',
    platforms: ['instagram'],
    hasAssets: false,
    brand,
    creativeDna,
    mode: 'EDITORIAL',
    artDirectionFamily: 'CULTURAL_EDITORIAL',
    selectedStyle: styleDna,
    intent: {
      goal: 'ENGAGEMENT',
      funnelStage: 'MOFU',
      aspectRatio: '1:1',
      requiredClaims,
      keyPhrases: ['2D virtual try-on', 'Ganesh Chaturthi'],
    },
    graphicConcept: concept,
  });
  console.log(`  -> Headline: "${direction.headline}"`);
  console.log(`  -> Offer: "${direction.marketingCreative?.offerText || 'N/A'}"`);
  console.log(`  -> CTA: "${direction.marketingCreative?.ctaText || 'N/A'}"`);
  console.log(`  -> Visual Story: "${direction.visualStory?.slice(0, 80)}..."`);

  // Trace copy items before composition
  const rawCopyCollected: Array<{ role: string; text: string }> = [
    { role: 'HEADLINE', text: direction.headline || '' },
    ...(direction.marketingCreative?.eventBadge ? [{ role: 'EVENT', text: direction.marketingCreative.eventBadge }] : []),
    ...(direction.marketingCreative?.offerText ? [{ role: 'OFFER', text: direction.marketingCreative.offerText }] : []),
    ...(direction.marketingCreative?.ctaText ? [{ role: 'CTA', text: direction.marketingCreative.ctaText }] : []),
    ...(direction.copyLines || []).map((l) => ({ role: l.role, text: l.text })),
  ].filter((c) => c.text.length > 0);

  console.log(`[Stage 3.1] Raw Collected Copy Items (${rawCopyCollected.length}):`);
  rawCopyCollected.forEach((item, idx) => {
    console.log(`   ${idx + 1}. [${item.role}] "${item.text}"`);
  });

  // Check for historical corruption or structured code artifacts
  let structuredArtifactsFound = false;
  let historicCorruptionFound = false;
  for (const item of rawCopyCollected) {
    if (isStructuredArtifact(item.text)) {
      structuredArtifactsFound = true;
      console.warn(`   [ALERT] Structured artifact detected in raw copy item: "${item.text}"`);
    }
    if (item.text.includes("from home.', 'cta'") || item.text.includes('marketin')) {
      historicCorruptionFound = true;
      console.error(`   [CRITICAL] Historic corruption string detected! "${item.text}"`);
    }
  }

  // 4. Execution of Designer Composition (Real Image Generation, Solver, Resvg Render, Critic, Recovery)
  console.log(`[Stage 4] Running designCreative with Authoritative Copy Gate & Design Critic...`);
  const stageTimings: Record<string, number> = {};

  const compositionResult = await designCreative({
    direction,
    concept,
    graphicConcept: concept,
    canonicalBrief: brief,
    styleDna: resolvedStyleDna,
    context: {
      brand,
      creativeDna,
      intent: {
        goal: 'ENGAGEMENT',
        funnelStage: 'MOFU',
        aspectRatio: '1:1',
        requiredClaims,
      },
    },
    products: [],
    references: [],
    logo: logoAsset,
    onCall: (type: string) => {
      if (type === 'image') imageCalls++;
      if (type === 'text') textCalls++;
      if (type === 'critic') criticCalls++;
    },
    textProvider: geminiMarketingProvider,
    imageProvider: geminiImageProvider,
    onStageTiming: (stage, duration) => {
      stageTimings[stage] = duration;
    },
  });

  const durationMs = Date.now() - startTime;
  const critic = compositionResult.critic;
  criticCalls++;

  console.log(`\n[Stage 5] Design Result & Critic Evaluation:`);
  console.log(`  - Critic Passed: ${critic.passed}`);
  console.log(`  - Template Look: ${critic.templateLook} | Human Craft: ${critic.humanCraft} | Single Clear Idea: ${critic.singleClearIdea}`);
  console.log(`  - Problems (${critic.problems.length}):`, critic.problems);
  console.log(`  - Reasons to Reject:`, critic.reasonsToReject);
  console.log(`  - Redesign Feedback:`, critic.redesignFeedback || 'None');
  console.log(`  - Image Calls: ${imageCalls} | Text Calls: ${textCalls} | Critic Calls: ${criticCalls}`);
  console.log(`  - Total Duration: ${(durationMs / 1000).toFixed(2)}s`);

  // Inspect nodes in final DesignerPlan
  const finalPlanCopyNodes = compositionResult.plan.nodes.filter((n) => n.kind === 'copy');
  console.log(`\n[Stage 6] Final Rendered Copy Nodes in DesignerPlan (${finalPlanCopyNodes.length}):`);
  const renderableCopyItems: Array<{ role: string; text: string }> = [];
  finalPlanCopyNodes.forEach((node, idx) => {
    const text = node.lines.join(' ');
    renderableCopyItems.push({ role: node.id, text });
    console.log(`   ${idx + 1}. [${node.id}] fontScale=${node.fontScale} color=${node.color} surface=${node.surface}`);
    console.log(`      text: "${text}"`);

    if (isStructuredArtifact(text)) {
      structuredArtifactsFound = true;
      console.error(`   [CRITICAL] Structured artifact made it into final plan node ${node.id}: "${text}"`);
    }
    if (text.includes("from home.', 'cta'") || text.includes('marketin')) {
      historicCorruptionFound = true;
      console.error(`   [CRITICAL] Historic corruption in final plan node ${node.id}: "${text}"`);
    }
  });

  // Save the artwork PNG for visual inspection
  const outPath = path.join(outputDir, `ganesh_villy_run_${runIndex}.png`);
  fs.writeFileSync(outPath, compositionResult.data);
  console.log(`  -> Saved final rendered artwork to: ${outPath}`);

  return {
    runIndex,
    durationMs,
    imageCalls,
    textCalls,
    criticCalls,
    recoveryAttempts: critic.passed ? 0 : 1,
    finalCriticPassed: critic.passed,
    criticProblems: critic.problems,
    criticFeedback: critic.redesignFeedback,
    observedFailures: critic.reasonsToReject,
    rawCopyItems: rawCopyCollected,
    renderableCopyItems,
    structuredArtifactsFound,
    historicCorruptionFound,
    outputPath: outPath,
  };
}

async function main() {
  const outputDir = 'C:\\Users\\mail\\.gemini\\antigravity-ide\\brain\\883c88f1-51d2-48c5-9f76-362c1a730c46\\scratch\\validation-output';
  fs.mkdirSync(outputDir, { recursive: true });

  console.log('================================================================');
  console.log('STARTING 5x REAL PRODUCTION VALIDATION RUNS (GANESH / VILLY)');
  console.log('================================================================');

  const runs: RunResult[] = [];
  for (let i = 1; i <= 5; i++) {
    try {
      const res = await runSingleValidation(i, outputDir);
      runs.push(res);
    } catch (err) {
      console.error(`[ERROR] Run ${i} failed with error:`, err);
      runs.push({
        runIndex: i,
        durationMs: 0,
        imageCalls: 0,
        textCalls: 0,
        criticCalls: 0,
        recoveryAttempts: 0,
        finalCriticPassed: false,
        criticProblems: [err instanceof Error ? err.message : String(err)],
        observedFailures: ['RUNTIME_ERROR'],
        rawCopyItems: [],
        renderableCopyItems: [],
        structuredArtifactsFound: false,
        historicCorruptionFound: false,
      });
    }
  }

  console.log(`\n================================================================`);
  console.log(`5x PRODUCTION VALIDATION SUMMARY`);
  console.log(`================================================================`);
  console.table(runs.map((r) => ({
    Run: r.runIndex,
    Passed: r.finalCriticPassed ? 'PASS' : 'FAIL',
    ImageCalls: r.imageCalls,
    TextCalls: r.textCalls,
    DurationSec: (r.durationMs / 1000).toFixed(1),
    StructuredArtifacts: r.structuredArtifactsFound ? 'FOUND (FAIL)' : 'CLEAN (PASS)',
    HistoricCorruption: r.historicCorruptionFound ? 'FOUND (FAIL)' : 'CLEAN (PASS)',
    NodesCount: r.renderableCopyItems.length,
  })));

  // Write summary JSON for auditing
  const summaryPath = path.join(outputDir, 'production-validation-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(runs, null, 2));
  console.log(`\nFull validation report saved to: ${summaryPath}`);
}

main().catch((err) => {
  console.error('Fatal execution error in main:', err);
  process.exit(1);
});
