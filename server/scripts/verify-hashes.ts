import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const ARTIFACTS_DIR = path.resolve(__dirname, '../audit-artifacts');

function hashFile(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function scanArtifacts() {
  const runs = [
    { id: 'RUN-01', folder: 'RUN-01_01-dense-person-fashion' },
    { id: 'RUN-02', folder: 'RUN-02_02-dense-food' },
    { id: 'RUN-04', folder: 'RUN-04_04-bright-image' },
    { id: 'RUN-05', folder: 'RUN-05_05-multi-subject' },
    { id: 'RUN-08', folder: 'RUN-08_08-boundary-interaction' },
  ];

  console.log('========================================================================');
  console.log('   CRYPTOGRAPHIC HASH & UNIQUENESS AUDIT OF ALL SAVED RUNS             ');
  console.log('========================================================================\n');

  const allRawHashes = new Set<string>();
  const allFinalHashes = new Set<string>();

  for (const run of runs) {
    const runPath = path.join(ARTIFACTS_DIR, run.folder);
    if (!fs.existsSync(runPath)) continue;

    const files = fs.readdirSync(runPath);
    const rawFile = files.find(f => f.includes('raw'));
    const finalFile = files.find(f => f.includes('final') && f.endsWith('.png'));

    let rawHash = 'N/A';
    let rawSize = 0;
    if (rawFile) {
      const rawPath = path.join(runPath, rawFile);
      rawHash = hashFile(rawPath);
      rawSize = fs.statSync(rawPath).size;
      allRawHashes.add(rawHash);
    }

    let finalHash = 'N/A';
    let finalSize = 0;
    if (finalFile) {
      const finalPath = path.join(runPath, finalFile);
      finalHash = hashFile(finalPath);
      finalSize = fs.statSync(finalPath).size;
      allFinalHashes.add(finalHash);
    }

    let summary: any = {};
    const summaryPath = path.join(runPath, 'audit_summary.json');
    if (fs.existsSync(summaryPath)) {
      summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    }

    console.log(`[${run.id}] ${summary.testName || run.folder}`);
    console.log(`    Asset ID:       ${summary.assetId}`);
    console.log(`    Raw Cloudinary: ${summary.urls?.visualImageUrl}`);
    console.log(`    Raw File Size:  ${rawSize} bytes`);
    console.log(`    Raw SHA-256:    ${rawHash}`);
    console.log(`    Final Cloudinary: ${summary.urls?.finalImageUrl}`);
    console.log(`    Final File Size:  ${finalSize} bytes`);
    console.log(`    Final SHA-256:    ${finalHash}\n`);
  }

  console.log('------------------------------------------------------------------------');
  console.log(`Total Completed Runs Audited: ${runs.length}`);
  console.log(`Unique Raw Image Hashes:     ${allRawHashes.size} / ${runs.length}`);
  console.log(`Unique Final Image Hashes:   ${allFinalHashes.size} / ${runs.length}`);
  console.log(`Every Single Asset 100% Unique: ${allRawHashes.size === runs.length && allFinalHashes.size === runs.length}`);
  console.log('========================================================================\n');
}

scanArtifacts();
