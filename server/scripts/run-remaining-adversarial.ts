import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env';

const API_ENDPOINT = 'http://localhost:5000/api/ai/creative/generate';
const REAL_USER_ID = 'd15e131b-34da-43d2-bfaf-a9ba332506fd';
const ARTIFACTS_DIR = path.join(__dirname, '../audit-artifacts');

if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

const token = jwt.sign(
  { sub: REAL_USER_ID, email: 'testxyz@gmail.com', role: 'authenticated' },
  env.JWT_SECRET || 'secret'
);

interface TestCase {
  id: string;
  name: string;
  category: string;
  payload: any;
}

const remainingCases: TestCase[] = [
  {
    id: 'RUN-03B',
    name: '03-dark-image',
    category: 'dark image',
    payload: {
      prompt: 'Moody obsidian luxury timepiece resting on volcanic black basalt stone, deep dramatic shadows, chiaroscuro lighting, subtle golden rim light catching the sapphire crystal glass, clean dark background',
      contextType: 'personal',
      platforms: ['instagram'],
      aspectRatio: '4:5',
      goal: 'brand_awareness',
      funnelStage: 'TOFU',
      selectedStyleId: 'cinematic',
      brandVoice: {
        name: 'Aethel Horology',
        description: 'Bespoke artisanal Swiss luxury watches made for the discerning connoisseur',
        tone: 'mysterious, opulent, precise, dramatic',
      },
    },
  },
  {
    id: 'RUN-06B',
    name: '06-minimal-negative-space',
    category: 'minimal negative-space image',
    payload: {
      prompt: 'Intricate Moroccan mosaic tile pattern wallpaper covering the frame with detailed geometric textures, warm terracotta and azure glaze, continuous visual density',
      contextType: 'personal',
      platforms: ['instagram'],
      aspectRatio: '1:1',
      goal: 'engagement',
      funnelStage: 'MOFU',
      selectedStyleId: 'bold-punchy',
      brandVoice: {
        name: 'Zellij Studio',
        description: 'Authentic handcrafted architectural Moroccan tile heritage',
        tone: 'vibrant, artisanal, geometric, rich',
      },
    },
  },
  {
    id: 'RUN-07B',
    name: '07-intentional-material-overlap',
    category: 'intentional material overlap',
    payload: {
      prompt: 'Frosted sea-glass cosmetics bottle lying on rippling crystal water with floating translucent botanical petals, soft morning light refraction, translucent layering',
      contextType: 'personal',
      platforms: ['instagram'],
      aspectRatio: '4:5',
      goal: 'conversions',
      funnelStage: 'BOFU',
      selectedStyleId: 'organic-raw',
      brandVoice: {
        name: 'Thalassa Pure',
        description: 'Clean bio-marine restorative skincare elixir',
        tone: 'pure, ethereal, serene, organic',
      },
    },
  },
  {
    id: 'RUN-09B',
    name: '09-headline-support-cta-logo',
    category: 'headline + support + CTA + logo',
    payload: {
      prompt: 'Premium ergonomic mechanical keyboard on a sleek walnut desk with brass accents, warm ambient studio desk lighting, clean overhead diagonal view',
      contextType: 'personal',
      platforms: ['instagram'],
      aspectRatio: '4:5',
      goal: 'conversions',
      funnelStage: 'BOFU',
      selectedStyleId: 'editorial',
      brandVoice: {
        name: 'KeyCraft Atelier',
        description: 'Bespoke custom mechanical keyboards and tactile desk tools for creators',
        tone: 'architectural, premium, tactile, focused',
      },
    },
  },
  {
    id: 'RUN-10B',
    name: '10-separated-editorial-concept',
    category: 'separated editorial concept (style repair: creator-ugc -> editorial)',
    payload: {
      prompt: 'Artisanal Swiss luxury handcrafted tourbillon watch movement with ruby jewels and polished steel gears macro photography, studio precision lighting',
      contextType: 'personal',
      platforms: ['instagram'],
      aspectRatio: '4:5',
      goal: 'brand_awareness',
      funnelStage: 'TOFU',
      selectedStyleId: 'creator-ugc', // intentionally test repair: creator-ugc -> editorial
      brandVoice: {
        name: 'Vanguard Chrono',
        description: 'Ultra-exclusive mechanical horology crafted in Geneva',
        tone: 'luxurious, sophisticated, mechanical mastery',
      },
    },
  },
];

async function runRemaining() {
  console.log('========================================================================');
  console.log('   RUNNING REMAINING 5 ADVERSARIAL CASES AGAINST LIVE /generate        ');
  console.log('========================================================================\n');

  for (let i = 0; i < remainingCases.length; i++) {
    const testCase = remainingCases[i];
    const runDir = path.join(ARTIFACTS_DIR, `${testCase.id}_${testCase.name}`);
    if (!fs.existsSync(runDir)) {
      fs.mkdirSync(runDir, { recursive: true });
    }

    const requestId = `req-live-audit-${testCase.id}-${Date.now()}`;
    console.log(`>>> [${testCase.id}] Executing: ${testCase.name} (${testCase.category})`);
    console.log(`    Request ID: ${requestId}`);

    const startTime = Date.now();

    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Creative-Request-Id': requestId,
        },
        body: JSON.stringify(testCase.payload),
      });

      const totalHttpDuration = Date.now() - startTime;
      const data: any = await response.json();

      if (!response.ok) {
        console.error(`    FAILED with status ${response.status}:`, data);
        fs.writeFileSync(
          path.join(runDir, '00_error_response.json'),
          JSON.stringify({ status: response.status, error: data, durationMs: totalHttpDuration }, null, 2)
        );
        continue;
      }

      console.log(`    HTTP 200 OK received in ${totalHttpDuration}ms!`);
      console.log(`    Asset ID: ${data.id}`);
      console.log(`    Provider/Model: ${data.provider} / ${data.model}`);
      console.log(`    Concept: "${data.creativeBrief?.concept}"`);
      console.log(`    Selected Style: "${data.renderContext?.canonicalBrief?.creativeStyle?.id || data.creativeBrief?.mode}"`);
      console.log(`    Headline: "${data.creativeBrief?.headline}"`);
      console.log(`    Raw Visual URL: ${data.visualImageUrl}`);
      console.log(`    Final Image URL: ${data.imageUrl}`);

      // Save raw response payload
      fs.writeFileSync(path.join(runDir, '00_api_response_payload.json'), JSON.stringify(data, null, 2));

      // Save SVG if present
      if (data.svgContent) {
        fs.writeFileSync(path.join(runDir, '01_final_composition.svg'), data.svgContent);
      }

      // Download raw and final images
      if (data.visualImageUrl) {
        try {
          const rawImgRes = await fetch(data.visualImageUrl);
          const rawBuf = Buffer.from(await rawImgRes.arrayBuffer());
          fs.writeFileSync(path.join(runDir, '02_raw_ai_generated_image.png'), rawBuf);
        } catch (e) {
          console.warn('    Could not download raw image:', e);
        }
      }

      if (data.imageUrl) {
        try {
          const finalImgRes = await fetch(data.imageUrl);
          const finalBuf = Buffer.from(await finalImgRes.arrayBuffer());
          fs.writeFileSync(path.join(runDir, '02_final_creative_raster.png'), finalBuf);
        } catch (e) {
          console.warn('    Could not download final image:', e);
        }
      }

      fs.writeFileSync(
        path.join(runDir, 'audit_summary.json'),
        JSON.stringify(
          {
            runId: testCase.id,
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
            typography: data.creativeBrief?.typography,
            graphicConcept: data.renderContext?.graphicConcept,
            urls: {
              visualImageUrl: data.visualImageUrl,
              finalImageUrl: data.imageUrl,
              cloudinaryPublicId: data.cloudinaryPublicId,
            },
            status: 'SUCCESS',
          },
          null,
          2
        )
      );
    } catch (err: any) {
      console.error(`    Exception during execution:`, err.message);
    }
  }

  console.log('\n========================================================================');
  console.log('   REMAINING RUNS FINISHED                                             ');
  console.log('========================================================================\n');
}

runRemaining().catch(console.error);
