import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import dotenv from 'dotenv';
dotenv.config();

import { geminiMarketingProvider } from '../ai/providers/gemini.provider';
import { geminiImageProvider } from '../ai/providers/gemini-image.provider';
import { buildCanonicalCreativeBrief } from '../ai/brand/creative-brief';
import { generateGraphicDesignConcept } from '../ai/generators/art-director.generator';
import { generateCreativeDirection } from '../ai/generators/creative-direction.generator';
import { getStyleDNA, resolveStyleDNA } from '../ai/style-dna/style-dna';
import { resolveBrandProfile } from '../ai/brand/brand-profile';
import { resolveCreativeDna } from '../ai/brand/creative-dna';
import { analyzeImageField, FieldRect } from '../ai/render/image-field';
import { createDesignField, createCanvasRepresentation, createBrandDesignRepresentation } from '../ai/render/design-representation';
import { discoverPlacementCandidates, evaluatePlacementRegion } from '../ai/render/dynamic-placement';
import { discoverOptimizedComposition } from '../ai/render/composition-evaluation';
import { renderDesignerPlan, composeHighFidelityVisualPrompt, DesignerPlan, DesignNode } from '../ai/render/designer-composition';
import { evaluateRenderedDesign } from '../ai/generators/design-critic.generator';
import { selectTypography } from '../ai/typography/font-selector';
import { buildTypeSystem } from '../ai/typography/type-system';
import { classifyCriticFailure } from '../ai/render/critic-recovery';

async function getVillyLogo(): Promise<string> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="140" viewBox="0 0 500 140">
    <rect width="500" height="140" fill="none"/>
    <text x="250" y="70" font-family="sans-serif" font-weight="900" font-size="52" fill="#FFFFFF" text-anchor="middle" letter-spacing="4">VILLY AI</text>
    <text x="250" y="110" font-family="sans-serif" font-weight="500" font-size="16" fill="#D97706" text-anchor="middle" letter-spacing="3">2D VIRTUAL TRY-ON</text>
  </svg>`;
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return buf.toString('base64');
}

async function runForensicAudit() {
  console.log('================================================================');
  console.log('STARTING DEEP FORENSIC AUDIT OF PRODUCTION PLACEMENT ENGINE');
  console.log('================================================================');

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

  // 1. Brief & Concept
  console.log('[1] Generating Brief & Art Direction Concept...');
  const brief = (buildCanonicalCreativeBrief as any)({
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

  const concept = await (generateGraphicDesignConcept as any)({
    brief,
    styleDna: resolvedStyleDna,
    provider: geminiMarketingProvider,
  });
  console.log('  -> Concept:', concept.conceptName);

  // 2. Creative Direction
  console.log('[2] Generating Creative Direction...');
  const { direction } = await (generateCreativeDirection as any)({
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

  console.log('  -> Headline:', direction.headline);
  console.log('  -> Visual Story:', direction.visualStory);

  // 3. Generate Visual Image
  console.log('[3] Generating Visual Image...');
  const visualPrompt = (composeHighFidelityVisualPrompt as any)({
    direction,
    concept,
    context: {
      brand,
      creativeDna,
      intent: { goal: 'ENGAGEMENT', funnelStage: 'MOFU', aspectRatio: '1:1', requiredClaims },
    },
    styleDna: resolvedStyleDna,
  });

  const [visual] = await geminiImageProvider.generateImage({
    prompt: `${visualPrompt}\nCampaign context: ${direction.subject}. ${direction.visualStory}. Follow the attached STYLE references for visual language only; never import their text, products or logos. No lettering, logos, numbers or placeholders. Do not default to photography if the selected style calls for another medium. Ensure bright, radiant daylight or high-key studio lighting with clean, luminous, airy backgrounds. Avoid dark, pitch-black, or dim shadowy lighting.`,
    referenceImages: [],
    aspectRatio: '1:1',
  });

  const visualBuffer = Buffer.from(visual.data, 'base64');
  const auditDir = 'C:\\Users\\mail\\.gemini\\antigravity-ide\\brain\\883c88f1-51d2-48c5-9f76-362c1a730c46\\scratch\\validation-output';
  fs.mkdirSync(auditDir, { recursive: true });
  fs.writeFileSync(path.join(auditDir, 'audit_raw_image.png'), visualBuffer);
  console.log('  -> Saved audit raw image to audit_raw_image.png');

  // 4. Image Field Audit
  console.log('\n[4] AUDITING IMAGE FIELD...');
  const rawImageField = await analyzeImageField(visualBuffer);
  const designField = createDesignField(rawImageField);
  const canvas = createCanvasRepresentation(1080, 1080, 0.04);
  const brandRep = createBrandDesignRepresentation({
    brandProfile: brand as any,
    creativeDna: creativeDna as any,
    logoData: logoData,
  });

  console.log('=== Image Field Extraction ===');
  console.log('subjectBox:', JSON.stringify(rawImageField.subjectBox));
  console.log('focalCentroid:', JSON.stringify(rawImageField.focalCentroid));
  console.log('quietRects count:', rawImageField.quietRects.length);
  rawImageField.quietRects.forEach((qr, i) => {
    console.log(`  QuietRect[${i}]: x=${qr.x.toFixed(2)}, y=${qr.y.toFixed(2)}, w=${qr.width.toFixed(2)}, h=${qr.height.toFixed(2)}, quietness=${qr.quietness.toFixed(3)}, meanLum=${qr.tone.meanLuminance.toFixed(3)}, stdDev=${qr.tone.stdDev.toFixed(3)}, verdict=${qr.tone.verdict}`);
  });

  // Calculate grid statistics
  const { luminance, energy, cols, rows } = rawImageField.grid;
  let meanLum = 0, meanEnergy = 0;
  for (let i = 0; i < cols * rows; i++) {
    meanLum += luminance[i];
    meanEnergy += energy[i];
  }
  meanLum /= (cols * rows);
  meanEnergy /= (cols * rows);
  console.log(`Grid stats: cols=${cols}, rows=${rows}, globalMeanLum=${meanLum.toFixed(3)}, globalMeanDetailEnergy=${meanEnergy.toFixed(3)}`);

  const visualAxes = designField.getVisualAxes(canvas);
  console.log('visualAxes count:', visualAxes.length);
  visualAxes.forEach((ax, i) => {
    console.log(`  Axis[${i}]: ${ax.orientation} pos=${ax.position.toFixed(3)} strength=${ax.strength} source=${ax.source}`);
  });

  // 5. Form Copy Items and Discover Placement Candidates
  console.log('\n[5] AUDITING PLACEMENT CANDIDATES...');
  const { resolveDesignRecipe } = await import('../ai/render/design-recipe');
  const { recipe } = resolveDesignRecipe(direction, creativeDna, {
    styleDna: resolvedStyleDna?.style,
    styleDnaVariant: resolvedStyleDna?.variant,
  });

  const headlineText = direction.headline || 'Festive Fitting at Home.';
  const typography = await (selectTypography as any)({
    direction,
    creativeDna,
    recipe,
    styleDna: resolvedStyleDna?.style,
    provider: geminiMarketingProvider,
  });
  const typeSystem = buildTypeSystem({ typography, concept, copy: [{ role: 'HEADLINE', text: headlineText }] });

  const copyItems = [{
    id: 'headline',
    text: headlineText,
    role: 'headline' as const,
    priority: 1,
    font: typography.headlineFont,
    approvedFonts: [typography.headlineFont],
    weight: typography.headlineWeight,
  }];

  // Discover composition
  const discoveryResult = discoverOptimizedComposition({
    copyItems,
    field: designField,
    canvas,
    brand: brandRep,
  });

  const bestState = discoveryResult.bestState;
  console.log('\n=== Holistic Composition Best State ===');
  console.log('Best State Aggregate Score:', bestState.evaluation.aggregateScore.toFixed(4));
  console.log('Best State Reasons:', JSON.stringify(bestState.evaluation.reasons, null, 2));
  console.log('Best State Element Rects:');
  bestState.elements.forEach((el) => {
    console.log(`  Element ${el.id} (${el.role}): x=${el.rect.x.toFixed(3)}, y=${el.rect.y.toFixed(3)}, w=${el.rect.width.toFixed(3)}, h=${el.rect.height.toFixed(3)}`);
    console.log(`    Ink: ${el.ink.color.hex}`);
    console.log(`    Typography fontScale: ${el.typographyState.fontScale}, weight: ${el.typographyState.weight}`);
  });

  // Evaluate candidate placements for headline
  const headlineEl = bestState.elements[0];
  const headlinePlacements = discoverPlacementCandidates({
    typographyState: headlineEl.typographyState,
    field: designField,
    canvas,
    safeMargin: 0.04,
    maxCandidates: 50,
  });

  console.log(`\n=== Top Candidate Placements for Headline (${headlinePlacements.length} total) ===`);
  const top15 = headlinePlacements.slice(0, 15);
  console.log('Rank | x     | y     | w     | h     | SubjOvr | Quiet | Energy | FocDist | BdPress | Contrast | Legib | Balance | Harmony | Score');
  console.log('-----------------------------------------------------------------------------------------------------------------------------');
  top15.forEach((c, idx) => {
    const s = c.signals;
    const sc = c.scores;
    console.log(
      `${(idx + 1).toString().padStart(4)} | ` +
      `${c.rect.x.toFixed(3)} | ${c.rect.y.toFixed(3)} | ${c.rect.width.toFixed(3)} | ${c.rect.height.toFixed(3)} | ` +
      `${s.subjectOverlap.overlapRatio.toFixed(3)}   | ` +
      `${s.quietness.toFixed(3)} | ` +
      `${s.detailEnergy.toFixed(3)}  | ` +
      `${s.focalDistance.toFixed(3)}   | ` +
      `${s.canvasBoundaryPressure.toFixed(3)}   | ` +
      `${s.contrastPotential.toFixed(3)}    | ` +
      `${sc.legibilityScore.toFixed(3)} | ` +
      `${sc.spatialBalanceScore.toFixed(3)}   | ` +
      `${sc.subjectHarmonyScore.toFixed(3)}   | ` +
      `${sc.compositeScore.toFixed(4)}`
    );
  });

  // Winning candidate detailed score breakdown
  console.log('\n=== Winning Candidate Detailed Breakdown ===');
  const win = headlinePlacements[0];
  console.log('Winning Rect:', JSON.stringify(win.rect));
  console.log('Winning Signals:', JSON.stringify(win.signals, null, 2));
  console.log('Winning Scores:', JSON.stringify(win.scores, null, 2));

  // 6. Compare Winning Region vs Best Apparent Negative Space Region
  console.log('\n=== Comparing Chosen Region vs Best Negative Space Region ===');
  const quietTop = rawImageField.quietRects[0] || { x: 0.04, y: 0.04, width: 0.52, height: 0.28 };
  const chosenEval = designField.evaluateRegion(win.rect);
  const quietEval = designField.evaluateRegion(quietTop);

  console.log('Chosen Region:', {
    rect: win.rect,
    meanLuminance: chosenEval.meanLuminance,
    detailEnergy: chosenEval.detailEnergy,
    quietness: chosenEval.quietness,
    subjectOcclusion: chosenEval.subjectOcclusion,
    focalDistance: chosenEval.focalDistance,
    spatialAffordance: chosenEval.availableSpatialAffordance,
    compositeScore: win.scores.compositeScore,
  });

  console.log('Best Quiet Region:', {
    rect: quietTop,
    meanLuminance: quietEval.meanLuminance,
    detailEnergy: quietEval.detailEnergy,
    quietness: quietEval.quietness,
    subjectOcclusion: quietEval.subjectOcclusion,
    focalDistance: quietEval.focalDistance,
    spatialAffordance: quietEval.availableSpatialAffordance,
  });

  // 7. Render DesignerPlan and Trace Coordinates
  console.log('\n[6] AUDITING COORDINATE TRACE & RENDERER...');
  const planNodes: DesignNode[] = [
    {
      id: 'hero-visual',
      kind: 'visual',
      x: 0,
      y: 0,
      width: 1.0,
      height: 1.0,
      color: 'none',
      surface: 'none',
      fontScale: 0.045,
      align: 'left',
      shape: 'rectangle',
      lines: [],
    },
    {
      id: headlineEl.id,
      kind: 'copy',
      x: Number(headlineEl.rect.x.toFixed(3)),
      y: Number(headlineEl.rect.y.toFixed(3)),
      width: Number(headlineEl.rect.width.toFixed(3)),
      height: Number(headlineEl.rect.height.toFixed(3)),
      color: headlineEl.ink.color.hex,
      surface: 'none',
      fontFamily: typography.headlineFont,
      fontWeight: headlineEl.typographyState.weight,
      fontScale: Number(headlineEl.typographyState.fontScale.toFixed(4)),
      align: headlineEl.rect.x + headlineEl.rect.width / 2 > 0.65 ? 'right' : Math.abs(headlineEl.rect.x + headlineEl.rect.width / 2 - 0.5) < 0.10 ? 'center' : 'left',
      shape: 'rectangle',
      lines: [headlineText],
    },
  ];

  const plan: DesignerPlan = {
    background: '#111111',
    rationale: bestState.evaluation.reasons.join('; '),
    visualPrompt: direction.visualStory || direction.concept,
    nodes: planNodes,
  };

  console.log('DesignerPlan Node:');
  console.log(JSON.stringify(planNodes[1], null, 2));

  const renderedPng = await renderDesignerPlan(
    plan,
    {
      direction,
      context: { brand, creativeDna, intent: { goal: 'ENGAGEMENT' as any, funnelStage: 'MOFU', aspectRatio: '1:1', requiredClaims } },
      products: [],
      references: [],
      logo: logoAsset,
    } as any,
    [{ role: 'HEADLINE', text: headlineText }],
    typography,
    visual,
    undefined,
    concept,
    typeSystem
  );

  const renderedPath = path.join(auditDir, 'audit_rendered_output.png');
  fs.writeFileSync(renderedPath, renderedPng);
  console.log('  -> Rendered PNG saved to:', renderedPath);

  // 8. Run Design Critic on this Rendered PNG
  console.log('\n[7] AUDITING DESIGN CRITIC CLASSIFICATION...');
  const critic = await evaluateRenderedDesign({
    provider: geminiMarketingProvider,
    renderedPng,
    brief: {
      userPrompt: direction.subject,
      goal: 'event_promotion',
      funnelStage: 'MOFU',
      primaryMessage: direction.headline || direction.subject,
      secondaryMessages: [],
      subject: direction.subject,
      event: direction.marketingCreative?.eventBadge,
      offer: direction.marketingCreative?.offerText,
      visualStory: direction.visualStory,
      firstRead: direction.headline || direction.subject,
      attentionHierarchy: concept.attentionHierarchy ?? [],
      emotionalTone: direction.mood || 'confident',
      brandVoice: { tone: direction.mood || 'confident', personality: ['authentic'] },
      creativeStyle: {
        id: styleDna.id,
        name: styleDna.name,
        visualLanguage: [],
        typographyLanguage: [],
        compositionLanguage: [],
        imageTreatment: [],
        textureLanguage: [],
        colorLanguage: [],
        imperfectionLanguage: [],
      },
      assets: { productAssets: [], referenceImages: [] },
      requiredClaims,
    },
    concept,
    productImages: [],
    referenceImages: [],
    logoImage: logoAsset,
  });

  const failureAnalysis = classifyCriticFailure(critic);

  console.log('Critic Result:', {
    passed: critic.passed,
    templateLook: critic.templateLook,
    humanCraft: critic.humanCraft,
    singleClearIdea: critic.singleClearIdea,
    layoutExpressesIdea: critic.layoutExpressesIdea,
    interchangeableWithAnotherEvent: critic.interchangeableWithAnotherEvent,
    problems: critic.problems,
    redesignFeedback: critic.redesignFeedback,
  });

  console.log('Critic Failure Analysis:', JSON.stringify(failureAnalysis, null, 2));

  const auditReport = {
    concept: concept.conceptName,
    headline: headlineText,
    rawImageField: {
      subjectBox: rawImageField.subjectBox,
      focalCentroid: rawImageField.focalCentroid,
      gridStats: { cols, rows, meanLum, meanEnergy },
      quietRects: rawImageField.quietRects,
    },
    winningCandidate: {
      rect: win.rect,
      pixelBounds: win.pixelBounds,
      signals: win.signals,
      scores: win.scores,
    },
    top15Candidates: top15.map(c => ({
      rect: c.rect,
      signals: c.signals,
      scores: c.scores,
    })),
    bestState: {
      aggregateScore: bestState.evaluation.aggregateScore,
      reasons: bestState.evaluation.reasons,
      elements: bestState.elements.map(e => ({
        id: e.id,
        role: e.role,
        rect: e.rect,
        ink: { color: e.ink.color.hex },
        fontScale: e.typographyState.fontScale,
      })),
    },
    regionComparison: {
      chosen: {
        rect: win.rect,
        evaluation: chosenEval,
        scores: win.scores,
      },
      quiet: {
        rect: quietTop,
        evaluation: quietEval,
      },
    },
    planNode: planNodes[1],
    critic,
    failureAnalysis,
  };

  fs.writeFileSync(path.join(auditDir, 'placement_forensic_data.json'), JSON.stringify(auditReport, null, 2));
  console.log('  -> Complete forensic report saved to placement_forensic_data.json');
}

runForensicAudit().catch(err => {
  console.error('Forensic audit error:', err);
});
