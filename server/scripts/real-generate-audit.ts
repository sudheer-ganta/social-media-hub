import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env';
import { resolveAffordances } from '../src/ai/intent/image-affordance-evaluation';
import { evaluateCandidateComposition } from '../src/ai/render/composition-evaluation';
import { renderSvgComposition } from '../src/ai/render/svg-renderer';
import { rasterizeSvg } from '../src/ai/render/rasterizer';
import { evaluateRenderQuality } from '../src/ai/render/critic';
import { computeFidelityMetrics } from '../src/ai/render/creative-fidelity';

interface TestCase {
  name: string;
  category: string;
  payload: Record<string, any>;
  expectedRepair?: boolean;
}

const TEST_CASES: TestCase[] = [
  {
    name: '01-dense-person-fashion',
    category: 'dense person/fashion',
    payload: {
      prompt: 'Haute couture fashion editorial model walking through a densely textured crowd on a bustling Tokyo street at twilight, intricate embroidered floral jacket, neon reflections, highly detailed street architecture and busy pedestrian background',
      contextType: 'personal',
      platforms: ['instagram'],
      aspectRatio: '4:5',
      goal: 'brand_awareness',
      funnelStage: 'TOFU',
      selectedStyleId: 'editorial',
      brandVoice: {
        name: 'Maison Tokyo',
        description: 'Avant-garde luxury couture fashion house blending Eastern craftsmanship with modern silhouette',
        tone: 'high-fashion, sophisticated, dramatic',
      },
    },
  },
  {
    name: '02-dense-food',
    category: 'dense food',
    payload: {
      prompt: 'Lavish gourmet charcuterie grazing table feast overflowing with artisan cheeses, cured meats, fresh figs, grapes, nuts, rustic sourdough bread, olive branches, and textured marble platter filling the entire frame from edge to edge with complex textures',
      contextType: 'personal',
      platforms: ['instagram'],
      aspectRatio: '1:1',
      goal: 'conversions',
      funnelStage: 'MOFU',
      selectedStyleId: 'organic-raw',
      brandVoice: {
        name: 'Artisan Feast',
        description: 'Bespoke catering and artisanal culinary grazing experiences',
        tone: 'warm, rustic, lavish, mouth-watering',
      },
    },
  },
  {
    name: '03-dark-image',
    category: 'dark image',
    payload: {
      prompt: 'Moody obsidian luxury timepiece resting on volcanic black basalt stone, deep dramatic shadows, ultra low key chiaroscuro lighting, subtle golden rim light catching the sapphire crystal glass, deep pitch black negative space',
      contextType: 'personal',
      platforms: ['instagram'],
      aspectRatio: '4:5',
      goal: 'brand_awareness',
      funnelStage: 'BOFU',
      selectedStyleId: 'luxury-modern',
      brandVoice: {
        name: 'Aethelgard Chrono',
        description: 'Swiss-engineered minimalist luxury timepieces crafted from rare obsidian and meteorite',
        tone: 'stoic, luxurious, understated, powerful',
      },
    },
  },
  {
    name: '04-bright-image',
    category: 'bright image',
    payload: {
      prompt: 'Minimalist Scandinavian ceramic studio bathed in intense morning sunlight, high-key bright white porcelain vases on bleached white oak table, expansive airy white linen negative space, clean soft shadows',
      contextType: 'personal',
      platforms: ['instagram'],
      aspectRatio: '1:1',
      goal: 'brand_awareness',
      funnelStage: 'TOFU',
      selectedStyleId: 'minimal',
      brandVoice: {
        name: 'Nordic Clay',
        description: 'Handcrafted Scandinavian ceramic art and architectural home vessels',
        tone: 'pure, serene, minimalist, airy',
      },
    },
  },
  {
    name: '05-multi-subject',
    category: 'multi-subject',
    payload: {
      prompt: 'Five diverse modern architectural designers collaborating around a wooden blueprint desk in a glass pavilion studio, holding coffee cups, laptops, and sketch models, intricate studio background with multiple visual focus points across the frame',
      contextType: 'personal',
      platforms: ['linkedin'],
      aspectRatio: '16:9',
      goal: 'traffic',
      funnelStage: 'MOFU',
      selectedStyleId: 'tech-minimal',
      brandVoice: {
        name: 'Vector Studio',
        description: 'Collaborative architectural design studio creating sustainable urban structures',
        tone: 'innovative, precise, human-centric, visionary',
      },
    },
  },
  {
    name: '06-minimal-negative-space',
    category: 'minimal negative-space image',
    payload: {
      prompt: 'Intricate Moroccan mosaic tile pattern wallpaper covering every millimeter of the canvas with vibrant geometric cobalt, emerald, and terracotta tiles, edge-to-edge extreme visual density with zero empty negative space',
      contextType: 'personal',
      platforms: ['instagram'],
      aspectRatio: '1:1',
      goal: 'conversions',
      funnelStage: 'BOFU',
      selectedStyleId: 'bold-vibrant',
      brandVoice: {
        name: 'Medina Tiles',
        description: 'Authentic handcrafted zellij mosaic tiles and artisanal architectural surfaces',
        tone: 'vibrant, culturally rich, bold, geometric',
      },
    },
  },
  {
    name: '07-intentional-material-overlap',
    category: 'intentional material overlap',
    payload: {
      prompt: 'Frosted sea-glass cosmetics bottle lying on rippling crystal water with floating eucalyptus leaves, translucent glass material, delicate sun caustics, designed for intentional material interaction and frosted overlay treatment',
      contextType: 'personal',
      platforms: ['instagram'],
      aspectRatio: '4:5',
      goal: 'conversions',
      funnelStage: 'BOFU',
      selectedStyleId: 'luxury-modern',
      brandVoice: {
        name: 'Thalassa Skincare',
        description: 'Marine-derived biocompatible luxury botanical skincare formulated with deep sea minerals',
        tone: 'radiant, pristine, restorative, luxurious',
      },
    },
  },
  {
    name: '08-boundary-interaction',
    category: 'boundary interaction',
    payload: {
      prompt: 'Geometric brutalist concrete architecture with strong structural vertical columns, hard contrast shadow split line dividing the canvas into light and dark geometric zones, designed for boundary anchor text alignment',
      contextType: 'personal',
      platforms: ['instagram'],
      aspectRatio: '4:5',
      goal: 'brand_awareness',
      funnelStage: 'TOFU',
      selectedStyleId: 'editorial',
      brandVoice: {
        name: 'Brut Archive',
        description: 'Monographic publishing house celebrating modernist architecture and brutalist heritage',
        tone: 'architectural, monumental, structured, uncompromising',
      },
    },
  },
  {
    name: '09-headline-support-cta-logo',
    category: 'headline + support + CTA + logo',
    payload: {
      prompt: 'Premium ergonomic mechanical keyboard on a sleek walnut desk with brass accents, studio lighting, product launch campaign featuring headline, detailed supporting spec line, shop now CTA badge, and official brand logo mark',
      contextType: 'personal',
      platforms: ['instagram'],
      aspectRatio: '4:5',
      goal: 'conversions',
      funnelStage: 'BOFU',
      selectedStyleId: 'tech-minimal',
      brandVoice: {
        name: 'ApexKey Studio',
        description: 'Precision engineered custom mechanical keyboards with machined brass weights and gasket mounts',
        tone: 'technical, premium, tactile, enthusiast-grade',
      },
    },
  },
  {
    name: '10-separated-editorial-concept',
    category: 'separated editorial concept (style repair: creator-ugc -> editorial)',
    expectedRepair: true,
    payload: {
      prompt: 'Artisanal Swiss luxury handcrafted tourbillon watch movement with ruby jewels and Geneva stripes, bespoke horology master craftsmanship for discerning collectors',
      contextType: 'personal',
      platforms: ['instagram'],
      aspectRatio: '4:5',
      goal: 'brand_awareness',
      funnelStage: 'BOFU',
      selectedStyleId: 'creator-ugc', // Contradicts luxury tourbillon brief -> triggers style repair!
      brandVoice: {
        name: 'Chronometrie Haute',
        description: 'Independent Swiss haute horlogerie atelier hand-finishing grand complication watches',
        tone: 'ultra-luxury, prestigious, heirloom-grade, bespoke',
      },
    },
  },
];

async function runAudit() {
  const userId = 'd15e131b-34da-43d2-bfaf-a9ba332506fd';
  const token = jwt.sign(
    { sub: userId, email: 'testxyz@gmail.com', role: 'authenticated' },
    env.JWT_SECRET || 'secret'
  );

  const outputBaseDir = path.resolve(__dirname, '../audit-artifacts');
  if (!fs.existsSync(outputBaseDir)) {
    fs.mkdirSync(outputBaseDir, { recursive: true });
  }

  console.log(`\n========================================================================`);
  console.log(`   FLOWPOST PRODUCTION LIVE VALIDATION AUDIT (10 ADVERSARIAL CASES)   `);
  console.log(`   Executing against live HTTP server: http://localhost:5000         `);
  console.log(`========================================================================\n`);

  const auditResults: any[] = [];

  for (let i = 0; i < TEST_CASES.length; i++) {
    const testCase = TEST_CASES[i];
    const runNumber = i + 1;
    const runId = `RUN-${String(runNumber).padStart(2, '0')}`;
    const requestId = `req-live-audit-${runNumber}-${Date.now()}`;
    const runDir = path.join(outputBaseDir, `${runId}_${testCase.name}`);
    if (!fs.existsSync(runDir)) {
      fs.mkdirSync(runDir, { recursive: true });
    }

    console.log(`\n>>> [${runId}/10] Executing: ${testCase.name} (${testCase.category})`);
    console.log(`    Request ID: ${requestId}`);
    console.log(`    Prompt: "${testCase.payload.prompt.substring(0, 75)}..."`);

    const tStart = Date.now();
    let res: Response;
    let data: any;

    try {
      res = await fetch('http://localhost:5000/api/ai/creative/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Creative-Request-Id': requestId,
        },
        body: JSON.stringify(testCase.payload),
      });

      const totalHttpDuration = Date.now() - tStart;
      data = await res.json();

      if (res.status !== 200) {
        console.error(`    FAILED with status ${res.status}:`, data);
        auditResults.push({
          runId,
          name: testCase.name,
          category: testCase.category,
          status: 'FAILED',
          httpStatus: res.status,
          error: data,
          durationMs: totalHttpDuration,
        });
        continue;
      }

      console.log(`    HTTP 200 OK received in ${totalHttpDuration}ms!`);
      console.log(`    Asset ID: ${data.id}`);
      console.log(`    Provider/Model: ${data.provider} / ${data.model}`);
      console.log(`    Concept: "${data.creativeBrief?.concept}"`);
      console.log(`    Selected Style: "${data.renderContext?.canonicalBrief?.creativeStyle?.id || data.creativeBrief?.mode}"`);
      console.log(`    Headline: "${data.creativeBrief?.headline}"`);
      console.log(`    Raw Visual URL: ${data.renderContext?.visualImageUrl}`);
      console.log(`    Final Image URL: ${data.imageUrl}`);

      // Save raw response JSON
      fs.writeFileSync(path.join(runDir, 'asset_response.json'), JSON.stringify(data, null, 2));

      // Download Raw AI image and Final Composited Raster image
      let rawImageBuffer: Buffer | null = null;
      let finalImageBuffer: Buffer | null = null;

      if (data.renderContext?.visualImageUrl) {
        try {
          const rawImgRes = await fetch(data.renderContext.visualImageUrl);
          rawImageBuffer = Buffer.from(await rawImgRes.arrayBuffer());
          fs.writeFileSync(path.join(runDir, '01_raw_ai_background.png'), rawImageBuffer);
        } catch (e) {
          console.warn('    Could not download raw AI image:', e);
        }
      }

      if (data.imageUrl) {
        try {
          const finalImgRes = await fetch(data.imageUrl);
          finalImageBuffer = Buffer.from(await finalImgRes.arrayBuffer());
          fs.writeFileSync(path.join(runDir, '02_final_creative_raster.png'), finalImageBuffer);
        } catch (e) {
          console.warn('    Could not download final image:', e);
        }
      }

      // Analyze Affordances and Composition from the downloaded raw image if present
      let affordances: any = null;
      let candidateEvaluation: any = null;
      if (rawImageBuffer) {
        try {
          const affStart = Date.now();
          affordances = await resolveAffordances(rawImageBuffer, 'image/png', {
            visualDensity: data.creativeBrief?.layoutDirection?.visualDensity || 'medium',
            focalPoints: data.creativeBrief?.subject ? [data.creativeBrief.subject] : [],
          });
          const affDuration = Date.now() - affStart;

          // Also evaluate the winning composition state
          const w = data.width || 1280;
          const h = data.height || 1600;
          
          candidateEvaluation = {
            affordancesDurationMs: affDuration,
            negativeSpaceBoxes: affordances.negativeSpaceBoxes,
            subjectMaskBoxes: affordances.subjectMaskBoxes,
            colorMetrics: affordances.colorMetrics,
          };
        } catch (e) {
          console.warn('    Affordance extraction warning:', e);
        }
      }

      // Record comprehensive audit item
      const record = {
        runId,
        testName: testCase.name,
        category: testCase.category,
        requestId,
        assetId: data.id,
        timestamp: data.createdAt,
        totalDurationMs: totalHttpDuration,
        requestedStyleId: testCase.payload.selectedStyleId,
        resolvedStyleId: data.renderContext?.canonicalBrief?.creativeStyle?.id || data.creativeBrief?.mode,
        styleRepairOccurred: testCase.payload.selectedStyleId !== (data.renderContext?.canonicalBrief?.creativeStyle?.id || data.creativeBrief?.mode),
        concept: data.creativeBrief?.concept,
        visualMechanism: data.renderContext?.graphicConcept?.creativeMechanism || data.renderContext?.canonicalBrief?.chosenConcept?.visualMechanism,
        provider: data.provider,
        model: data.model,
        dimensions: { width: data.width, height: data.height, aspectRatio: data.creativeBrief?.aspectRatio },
        copy: {
          headline: data.creativeBrief?.headline,
          supportingLine: data.creativeBrief?.supportingLine,
          cta: data.creativeBrief?.cta,
        },
        typography: {
          headlineFont: data.typography?.headlineFont,
          headlineWeight: data.typography?.headlineWeight,
          bodyFont: data.typography?.bodyFont,
          bodyWeight: data.typography?.bodyWeight,
          headlineFontSizeRel: data.typography?.hierarchy?.headline?.fontSize,
          bodyFontSizeRel: data.typography?.hierarchy?.body?.fontSize,
          reasoning: data.typography?.typographyReasoning,
        },
        graphicConcept: {
          hero: data.renderContext?.graphicConcept?.hero,
          anchor: data.renderContext?.graphicConcept?.anchor,
          imageRole: data.renderContext?.graphicConcept?.imageRole,
          dominantRegion: data.renderContext?.graphicConcept?.dominantRegion,
          spatialRelationship: data.renderContext?.graphicConcept?.spatialRelationship,
          typeBehavior: data.renderContext?.graphicConcept?.typeBehavior,
          compositionFamily: data.renderContext?.graphicConcept?.compositionFamily,
        },
        urls: {
          visualImageUrl: data.renderContext?.visualImageUrl,
          finalImageUrl: data.imageUrl,
          cloudinaryPublicId: data.cloudinaryPublicId,
        },
        rawImageSaved: !!rawImageBuffer,
        finalImageSaved: !!finalImageBuffer,
        affordances,
        status: 'SUCCESS',
      };

      auditResults.push(record);
      fs.writeFileSync(path.join(runDir, 'audit_summary.json'), JSON.stringify(record, null, 2));

    } catch (err: any) {
      console.error(`    Exception on ${runId}:`, err);
      auditResults.push({
        runId,
        name: testCase.name,
        category: testCase.category,
        status: 'EXCEPTION',
        error: String(err),
      });
    }
  }

  // Save the complete master audit report
  fs.writeFileSync(path.join(outputBaseDir, 'MASTER_AUDIT_REPORT.json'), JSON.stringify(auditResults, null, 2));

  console.log(`\n========================================================================`);
  console.log(`   AUDIT COMPLETE: ${auditResults.filter((r) => r.status === 'SUCCESS').length}/${TEST_CASES.length} SUCCEEDED   `);
  console.log(`   Artifacts saved to: ${outputBaseDir}`);
  console.log(`========================================================================\n`);
}

runAudit().catch(console.error);
