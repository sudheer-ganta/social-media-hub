import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env';

const API_ENDPOINT = 'http://localhost:5000/api/ai/creative/generate';
const REAL_USER_ID = 'd15e131b-34da-43d2-bfaf-a9ba332506fd';
const OUTPUT_DIR = path.resolve(__dirname, '../audit-artifacts/DIVERSITY_AUDIT_6X');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const token = jwt.sign(
  { sub: REAL_USER_ID, email: 'testxyz@gmail.com', role: 'authenticated' },
  env.JWT_SECRET || 'secret'
);

interface DiversityCase {
  id: string;
  name: string;
  category: string;
  payload: Record<string, any>;
}

const DIVERSITY_CASES: DiversityCase[] = [
  {
    id: 'CASE-01',
    name: 'luxury-horology-chiaroscuro',
    category: 'Luxury / Watchmaking',
    payload: {
      prompt: 'Avant-garde Swiss tourbillon luxury watch with exposed rose gold gears resting on a sculpted black marble pedestal, dramatic museum spotlighting, intense specular highlights on sapphire glass',
      contextType: 'personal',
      platforms: ['instagram'],
      aspectRatio: '4:5',
      goal: 'brand_awareness',
      funnelStage: 'TOFU',
      selectedStyleId: 'editorial',
      brandVoice: {
        name: 'Vanguard Chrono',
        description: 'Exclusive Swiss haute horlogerie marrying micro-mechanics with sculptural art',
        tone: 'mysterious, luxurious, authoritative',
      },
    },
  },
  {
    id: 'CASE-02',
    name: 'kinetic-athletics-sprint',
    category: 'Kinetic Sports / Athletic Performance',
    payload: {
      prompt: 'Elite sprinter exploding from starting blocks on a rainy neon-lit Olympic track at night, high-speed motion streaks, water droplets suspended in mid-air with dynamic rim lighting',
      contextType: 'personal',
      platforms: ['instagram'],
      aspectRatio: '4:5',
      goal: 'conversions',
      funnelStage: 'MOFU',
      selectedStyleId: 'bold-punchy',
      brandVoice: {
        name: 'AeroStrike Running',
        description: 'Next-generation carbon-plated speed footwear for record breakers',
        tone: 'high-energy, aggressive, kinetic, motivational',
      },
    },
  },
  {
    id: 'CASE-03',
    name: 'botanical-skincare-serenity',
    category: 'Organic Skincare / Botanicals',
    payload: {
      prompt: 'Frosted amber glass facial oil bottle resting on smooth wet river stones with fresh dewy eucalyptus leaves and soft morning sunlight dappled through trees',
      contextType: 'personal',
      platforms: ['instagram'],
      aspectRatio: '4:5',
      goal: 'brand_awareness',
      funnelStage: 'TOFU',
      selectedStyleId: 'organic-raw',
      brandVoice: {
        name: 'Natura Vera',
        description: 'Wildcrafted organic botanical skincare formulated from virgin rainforest plants',
        tone: 'earthy, serene, pure, calming',
      },
    },
  },
  {
    id: 'CASE-04',
    name: 'architectural-brutalist-geometry',
    category: 'Brutalist Architecture / Concrete Form',
    payload: {
      prompt: 'Monumental brutalist concrete art gallery pavilion in Berlin with sweeping diagonal cantilever beams and sharp geometric sunlight shadows across textured raw aggregate walls',
      contextType: 'personal',
      platforms: ['instagram'],
      aspectRatio: '4:5',
      goal: 'engagement',
      funnelStage: 'TOFU',
      selectedStyleId: 'editorial',
      brandVoice: {
        name: 'Form & Mass Press',
        description: 'Architectural monograph publisher celebrating monolithic 20th-century brutalism',
        tone: 'intellectual, monumental, structural, stark',
      },
    },
  },
  {
    id: 'CASE-05',
    name: 'artisanal-specialty-coffee',
    category: 'Artisanal Food / Coffee Roasting',
    payload: {
      prompt: 'Close-up pour-over coffee extraction with glistening golden amber brew dripping through a ceramic V60 dripper into a glass carafe, warm cozy barista brew bar morning atmosphere',
      contextType: 'personal',
      platforms: ['instagram'],
      aspectRatio: '1:1',
      goal: 'conversions',
      funnelStage: 'BOFU',
      selectedStyleId: 'warm-editorial',
      brandVoice: {
        name: 'Origin Roast Lab',
        description: 'Single-origin micro-lot specialty coffees sourced directly from volcanic soil farms',
        tone: 'warm, artisanal, sensory, inviting',
      },
    },
  },
  {
    id: 'CASE-06',
    name: 'cyber-interface-tech-hardware',
    category: 'High-Tech / Mechanical Hardware',
    payload: {
      prompt: 'Custom milled titanium mechanical keyboard with glowing teal underglow and brass weight bar resting on a dark anodized aluminum workbench in a modern tech workshop',
      contextType: 'personal',
      platforms: ['instagram'],
      aspectRatio: '4:5',
      goal: 'conversions',
      funnelStage: 'MOFU',
      selectedStyleId: 'neo-brutalism',
      brandVoice: {
        name: 'Kinesis Precision',
        description: 'Industrial-grade bespoke mechanical interfaces engineered for high-throughput software developers',
        tone: 'precise, industrial, unapologetic, elite',
      },
    },
  },
];

async function runDiversityAudit() {
  console.log('========================================================================');
  console.log('   FLOWPOST CREATIVE DIVERSITY & UNIQUENESS AUDIT (6 DISTINCT CASES)   ');
  console.log('   Executing against live HTTP server: http://localhost:5000           ');
  console.log('========================================================================\n');

  const results: any[] = [];
  const rawHashes = new Set<string>();
  const finalHashes = new Set<string>();

  for (let i = 0; i < DIVERSITY_CASES.length; i++) {
    const testCase = DIVERSITY_CASES[i];
    const caseDir = path.join(OUTPUT_DIR, `${testCase.id}_${testCase.name}`);
    if (!fs.existsSync(caseDir)) {
      fs.mkdirSync(caseDir, { recursive: true });
    }

    const requestId = `req-diversity-${testCase.id}-${Date.now()}`;
    console.log(`>>> [${testCase.id}] Executing: ${testCase.name} (${testCase.category})`);
    console.log(`    Request ID: ${requestId}`);
    console.log(`    Prompt: "${testCase.payload.prompt.substring(0, 75)}..."`);

    const tStart = Date.now();

    try {
      const res = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Creative-Request-Id': requestId,
        },
        body: JSON.stringify(testCase.payload),
      });

      const totalDuration = Date.now() - tStart;
      const data: any = await res.json();

      if (!res.ok) {
        console.error(`    FAILED with status ${res.status}:`, data);
        results.push({
          id: testCase.id,
          name: testCase.name,
          category: testCase.category,
          status: res.status === 422 ? 'EXPECTED_REJECTION' : 'INFRASTRUCTURE_FAILURE',
          httpStatus: res.status,
          error: data,
          totalDurationMs: totalDuration,
        });
        fs.writeFileSync(
          path.join(caseDir, 'error_response.json'),
          JSON.stringify({ status: res.status, error: data, durationMs: totalDuration }, null, 2)
        );
        continue;
      }

      console.log(`    HTTP 200 OK received in ${totalDuration}ms!`);
      console.log(`    Asset ID: ${data.id}`);
      console.log(`    Concept: "${data.creativeBrief?.concept}"`);
      console.log(`    Headline: "${data.creativeBrief?.headline}"`);
      console.log(`    Raw Image URL: ${data.visualImageUrl}`);
      console.log(`    Final Image URL: ${data.imageUrl}`);

      // Download Raw Image & compute SHA-256
      let rawImageSha256 = '';
      let rawImageBytes = 0;
      if (data.visualImageUrl) {
        try {
          const rawRes = await fetch(data.visualImageUrl);
          const rawBuf = Buffer.from(await rawRes.arrayBuffer());
          rawImageSha256 = crypto.createHash('sha256').update(rawBuf).digest('hex');
          rawImageBytes = rawBuf.length;
          fs.writeFileSync(path.join(caseDir, 'raw_ai_image.png'), rawBuf);
        } catch (e) {
          console.warn('    Could not download raw image:', e);
        }
      }

      // Download Final Image & compute SHA-256
      let finalImageSha256 = '';
      let finalImageBytes = 0;
      if (data.imageUrl) {
        try {
          const finalRes = await fetch(data.imageUrl);
          const finalBuf = Buffer.from(await finalRes.arrayBuffer());
          finalImageSha256 = crypto.createHash('sha256').update(finalBuf).digest('hex');
          finalImageBytes = finalBuf.length;
          fs.writeFileSync(path.join(caseDir, 'final_creative.png'), finalBuf);
        } catch (e) {
          console.warn('    Could not download final image:', e);
        }
      }

      // Check for uniqueness collisions
      const rawIsDuplicate = rawHashes.has(rawImageSha256);
      const finalIsDuplicate = finalHashes.has(finalImageSha256);
      if (rawImageSha256) rawHashes.add(rawImageSha256);
      if (finalImageSha256) finalHashes.add(finalImageSha256);

      const record = {
        id: testCase.id,
        name: testCase.name,
        category: testCase.category,
        status: rawIsDuplicate ? 'DUPLICATE_REUSE' : 'SUCCESS',
        requestId,
        assetId: data.id,
        timestamp: data.createdAt,
        totalDurationMs: totalDuration,
        conceptId: data.renderContext?.canonicalConceptId || data.creativeBrief?.concept || data.id,
        conceptName: data.creativeBrief?.concept,
        headline: data.creativeBrief?.headline,
        style: data.renderContext?.canonicalBrief?.creativeStyle?.id || data.creativeBrief?.mode,
        mechanism: data.renderContext?.graphicConcept?.creativeMechanism || data.renderContext?.canonicalBrief?.chosenConcept?.visualMechanism || 'N/A',
        relationshipMode: data.renderContext?.graphicConcept?.compositionFamily || 'asymmetric-editorial',
        anchor: data.renderContext?.graphicConcept?.anchor || 'bottom-left',
        headlineFont: data.creativeBrief?.typography?.headlineFont,
        bodyFont: data.creativeBrief?.typography?.bodyFont,
        rawImageUrl: data.visualImageUrl,
        rawImageSha256,
        rawImageBytes,
        finalImageUrl: data.imageUrl,
        finalImageSha256,
        finalImageBytes,
        isUniqueRawImage: !rawIsDuplicate,
        isUniqueFinalImage: !finalIsDuplicate,
      };

      results.push(record);
      fs.writeFileSync(path.join(caseDir, 'audit_record.json'), JSON.stringify(record, null, 2));
      fs.writeFileSync(path.join(caseDir, 'asset_response.json'), JSON.stringify(data, null, 2));
    } catch (err: any) {
      console.error(`    Exception during execution:`, err.message);
      results.push({
        id: testCase.id,
        name: testCase.name,
        status: 'INFRASTRUCTURE_FAILURE',
        error: err.message,
      });
    }
  }

  const summary = {
    totalRuns: DIVERSITY_CASES.length,
    successfulRuns: results.filter((r) => r.status === 'SUCCESS').length,
    uniqueRawImagesCount: rawHashes.size,
    uniqueFinalImagesCount: finalHashes.size,
    duplicateReusesDetected: results.filter((r) => r.status === 'DUPLICATE_REUSE').length,
    allHashesDistinct: rawHashes.size === results.filter((r) => r.status === 'SUCCESS').length,
    records: results,
  };

  fs.writeFileSync(path.join(OUTPUT_DIR, 'DIVERSITY_MASTER_REPORT.json'), JSON.stringify(summary, null, 2));

  console.log('\n========================================================================');
  console.log(`   DIVERSITY AUDIT COMPLETE: ${summary.successfulRuns}/${summary.totalRuns} SUCCEEDED`);
  console.log(`   Unique Raw Images: ${summary.uniqueRawImagesCount} / ${summary.successfulRuns}`);
  console.log(`   Unique Final Images: ${summary.uniqueFinalImagesCount} / ${summary.successfulRuns}`);
  console.log(`   All Hashes Distinct: ${summary.allHashesDistinct}`);
  console.log('========================================================================\n');
}

runDiversityAudit().catch(console.error);
