import sharp from 'sharp';
import { createCanvasRepresentation, createBrandDesignRepresentation, createDesignField } from '../ai/render/design-representation';
import { discoverOptimizedComposition } from '../ai/render/composition-evaluation';
import { analyzeImageField } from '../ai/render/image-field';

interface ArchetypeSpec {
  name: string;
  category: string;
  copy: Array<{ id: string; text: string; role: 'headline' | 'subheadline' | 'body' | 'cta' | 'offer'; priority: number; font?: string; weight?: number }>;
  brand: { name: string; colors: string[]; fonts?: string[] };
  generateVisual: (width: number, height: number) => Promise<Buffer>;
}

const ARCHETYPES: ArchetypeSpec[] = [
  // 1. Subject Left (Travel Editorial)
  {
    name: '1. Subject Left (Coastal Destination)',
    category: 'subject-left',
    copy: [
      { id: 'primary-hook', text: 'Coastline Retreats', role: 'headline', priority: 1, font: 'Inter', weight: 800 },
      { id: 'secondary-hook', text: 'Exclusive Summer Escapes', role: 'subheadline', priority: 2, font: 'Inter', weight: 500 },
      { id: 'cta', text: 'Book Journey', role: 'cta', priority: 3, font: 'Inter', weight: 600 },
    ],
    brand: { name: 'AeroLux', colors: ['#0f172a', '#38bdf8', '#ffffff'], fonts: ['Inter'] },
    generateVisual: async (w, h) => {
      const svg = `<svg width="${w}" height="${h}">
        <rect width="${w}" height="${h}" fill="#f8fafc"/>
        <circle cx="${w * 0.28}" cy="${h * 0.50}" r="${w * 0.22}" fill="#0f172a"/>
      </svg>`;
      return sharp(Buffer.from(svg)).png().toBuffer();
    },
  },

  // 2. Subject Right (Luxury Watchmaking)
  {
    name: '2. Subject Right (Horology Studio)',
    category: 'subject-right',
    copy: [
      { id: 'primary-hook', text: 'Mechanical Precision', role: 'headline', priority: 1, font: 'Inter', weight: 700 },
      { id: 'secondary-hook', text: 'Handcrafted in Geneva', role: 'subheadline', priority: 2, font: 'Inter', weight: 400 },
      { id: 'offer', text: 'Limited Edition 50 Pcs', role: 'offer', priority: 3, font: 'Inter', weight: 600 },
    ],
    brand: { name: 'Vanguard Timepieces', colors: ['#18181b', '#d97706', '#ffffff'], fonts: ['Inter'] },
    generateVisual: async (w, h) => {
      const svg = `<svg width="${w}" height="${h}">
        <rect width="${w}" height="${h}" fill="#f4f4f5"/>
        <rect x="${w * 0.60}" y="${h * 0.20}" width="${w * 0.35}" height="${h * 0.60}" rx="24" fill="#18181b"/>
      </svg>`;
      return sharp(Buffer.from(svg)).png().toBuffer();
    },
  },

  // 3. Centered Subject (Artisan Ceramics)
  {
    name: '3. Centered Subject (Minimal Tableware)',
    category: 'centered-subject',
    copy: [
      { id: 'primary-hook', text: 'Form & Silence', role: 'headline', priority: 1, font: 'Playfair Display', weight: 700 },
      { id: 'secondary-hook', text: 'Handmade Stoneware Collection', role: 'subheadline', priority: 2, font: 'Inter', weight: 400 },
    ],
    brand: { name: 'Kanso Studio', colors: ['#27272a', '#d4d4d8', '#ffffff'], fonts: ['Playfair Display', 'Inter'] },
    generateVisual: async (w, h) => {
      const svg = `<svg width="${w}" height="${h}">
        <rect width="${w}" height="${h}" fill="#faf6f0"/>
        <circle cx="${w * 0.50}" cy="${h * 0.50}" r="${w * 0.25}" fill="#a1a1aa"/>
      </svg>`;
      return sharp(Buffer.from(svg)).png().toBuffer();
    },
  },

  // 4. Full-Frame Subject (Macro Botanical Photography)
  {
    name: '4. Full-Frame Subject (Organic Skincare)',
    category: 'full-frame-subject',
    copy: [
      { id: 'primary-hook', text: 'Pure Botanical Radiance', role: 'headline', priority: 1, font: 'Outfit', weight: 700 },
      { id: 'secondary-hook', text: 'Cold-Pressed Seed Oils', role: 'subheadline', priority: 2, font: 'Inter', weight: 500 },
    ],
    brand: { name: 'Flora Labs', colors: ['#064e3b', '#10b981', '#ecfdf5'], fonts: ['Outfit', 'Inter'] },
    generateVisual: async (w, h) => {
      const svg = `<svg width="${w}" height="${h}">
        <rect width="${w}" height="${h}" fill="#064e3b"/>
        <circle cx="${w * 0.40}" cy="${h * 0.40}" r="${w * 0.35}" fill="#047857"/>
        <circle cx="${w * 0.65}" cy="${h * 0.65}" r="${w * 0.30}" fill="#059669"/>
      </svg>`;
      return sharp(Buffer.from(svg)).png().toBuffer();
    },
  },

  // 5. High-Key (Daylight Architectural Loft)
  {
    name: '5. High-Key (Bright Daylight Interiors)',
    category: 'high-key',
    copy: [
      { id: 'primary-hook', text: 'Space for Clarity', role: 'headline', priority: 1, font: 'Inter', weight: 700 },
      { id: 'secondary-hook', text: 'Architectural Workspace Design', role: 'subheadline', priority: 2, font: 'Inter', weight: 400 },
    ],
    brand: { name: 'Atelier Light', colors: ['#18181b', '#71717a', '#ffffff'], fonts: ['Inter'] },
    generateVisual: async (w, h) => {
      return sharp({ create: { width: w, height: h, channels: 3, background: '#fdfbf7' } }).png().toBuffer();
    },
  },

  // 6. Dark Atmospheric (Nocturne Audio Gear)
  {
    name: '6. Dark Atmospheric (Acoustic Studio)',
    category: 'dark',
    copy: [
      { id: 'primary-hook', text: 'Immersive Acoustics', role: 'headline', priority: 1, font: 'Plus Jakarta Sans', weight: 800 },
      { id: 'secondary-hook', text: 'Lossless Studio Monitoring', role: 'subheadline', priority: 2, font: 'Inter', weight: 500 },
    ],
    brand: { name: 'SonicLab', colors: ['#ffffff', '#f43f5e', '#09090b'], fonts: ['Plus Jakarta Sans', 'Inter'] },
    generateVisual: async (w, h) => {
      const svg = `<svg width="${w}" height="${h}">
        <rect width="${w}" height="${h}" fill="#09090b"/>
        <circle cx="${w * 0.80}" cy="${h * 0.20}" r="${w * 0.25}" fill="#18181b"/>
      </svg>`;
      return sharp(Buffer.from(svg)).png().toBuffer();
    },
  },

  // 7. High-Detail / High-Noise (Urban Street Fashion)
  {
    name: '7. High-Detail / Noisy (Streetwear Drop)',
    category: 'high-detail',
    copy: [
      { id: 'primary-hook', text: 'Raw Urban Movement', role: 'headline', priority: 1, font: 'Space Grotesk', weight: 700 },
      { id: 'secondary-hook', text: 'Winter Capsule Collection', role: 'subheadline', priority: 2, font: 'Space Grotesk', weight: 500 },
      { id: 'offer', text: 'Drop 04 Available Now', role: 'offer', priority: 3, font: 'Space Grotesk', weight: 700 },
    ],
    brand: { name: 'District Nine', colors: ['#facc15', '#000000', '#ffffff'], fonts: ['Space Grotesk'] },
    generateVisual: async (w, h) => {
      const noise = Buffer.alloc(w * h * 3);
      for (let i = 0; i < noise.length; i += 3) {
        const v = (i % 5 === 0 || i % 11 === 0 || i % 17 === 0) ? 230 : 30;
        noise[i] = v; noise[i + 1] = v; noise[i + 2] = v;
      }
      return sharp(noise, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
    },
  },

  // 8. Low-Detail (Minimal Fintech App)
  {
    name: '8. Low-Detail (Treasury & Capital)',
    category: 'low-detail',
    copy: [
      { id: 'primary-hook', text: 'Autonomous Capital', role: 'headline', priority: 1, font: 'Inter', weight: 700 },
      { id: 'secondary-hook', text: 'Real-Time Liquidity Infrastructure', role: 'subheadline', priority: 2, font: 'Inter', weight: 400 },
    ],
    brand: { name: 'VaultPay', colors: ['#0f172a', '#2563eb', '#ffffff'], fonts: ['Inter'] },
    generateVisual: async (w, h) => {
      const svg = `<svg width="${w}" height="${h}">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#eff6ff"/>
            <stop offset="1" stop-color="#dbeafe"/>
          </linearGradient>
        </defs>
        <rect width="${w}" height="${h}" fill="url(#g)"/>
      </svg>`;
      return sharp(Buffer.from(svg)).png().toBuffer();
    },
  },

  // 9. Asymmetric Diagonal (Contemporary Art Exhibition)
  {
    name: '9. Asymmetric (Contemporary Pavilion)',
    category: 'asymmetric',
    copy: [
      { id: 'primary-hook', text: 'Beyond the Grid', role: 'headline', priority: 1, font: 'Montserrat', weight: 800 },
      { id: 'secondary-hook', text: 'Biennale of Spatial Art', role: 'subheadline', priority: 2, font: 'Inter', weight: 400 },
    ],
    brand: { name: 'Kunsthaus', colors: ['#dc2626', '#111111', '#ffffff'], fonts: ['Montserrat', 'Inter'] },
    generateVisual: async (w, h) => {
      const svg = `<svg width="${w}" height="${h}">
        <rect width="${w}" height="${h}" fill="#fdfbf7"/>
        <polygon points="${w * 0.45},0 ${w},0 ${w},${h * 0.75}" fill="#18181b"/>
      </svg>`;
      return sharp(Buffer.from(svg)).png().toBuffer();
    },
  },

  // 10. Directional Flow (Aerospace Mobility)
  {
    name: '10. Directional Flow (Hypersonic Travel)',
    category: 'directional-composition',
    copy: [
      { id: 'primary-hook', text: 'Mach Five Horizon', role: 'headline', priority: 1, font: 'Space Grotesk', weight: 700 },
      { id: 'secondary-hook', text: 'Next-Generation Commercial Flight', role: 'subheadline', priority: 2, font: 'Inter', weight: 400 },
    ],
    brand: { name: 'Stratosphere Dynamics', colors: ['#0284c7', '#0f172a', '#ffffff'], fonts: ['Space Grotesk', 'Inter'] },
    generateVisual: async (w, h) => {
      const svg = `<svg width="${w}" height="${h}">
        <rect width="${w}" height="${h}" fill="#0f172a"/>
        <polygon points="0,${h * 0.85} ${w},${h * 0.35} ${w},${h} 0,${h}" fill="#0284c7"/>
      </svg>`;
      return sharp(Buffer.from(svg)).png().toBuffer();
    },
  },
];

async function runValidation() {
  console.log('========================================================================');
  console.log('FLOWPOST DYNAMIC DESIGN ENGINE — 10 REAL CREATIVE VALIDATION TRACE');
  console.log('========================================================================\n');

  const canvas = createCanvasRepresentation(1600, 1600);

  for (let idx = 0; idx < ARCHETYPES.length; idx++) {
    const spec = ARCHETYPES[idx];
    const brand = createBrandDesignRepresentation({
      brandProfile: { name: spec.brand.name },
      creativeDna: { brandColors: spec.brand.colors },
    });
    brand.approvedFonts = {
      headline: spec.brand.fonts || ['Inter'],
      body: ['Inter'],
    };

    const visualBuf = await spec.generateVisual(1600, 1600);
    const rawImageField = await analyzeImageField(visualBuf);
    const designField = createDesignField(rawImageField);

    const startTime = Date.now();
    const result = discoverOptimizedComposition({
      copyItems: spec.copy,
      field: designField,
      canvas,
      brand,
    });
    const latency = Date.now() - startTime;

    const best = result.bestState;
    const hElement = best.elements[0];
    const sElement = best.elements[1];

    console.log(`CREATIVE ${idx + 1}/10: ${spec.name}`);
    console.log(`  Archetype Category : ${spec.category}`);
    console.log(`  Discovery Latency  : ${latency} ms (hypotheses: ${result.metrics.totalHypothesesFormed}, evaluated: ${result.metrics.totalStatesEvaluated})`);
    console.log(`  Aggregate Score    : ${(best.evaluation.aggregateScore * 100).toFixed(1)}%`);
    console.log(`  Legibility Quality : ${(best.tradeoffProfile.legibilityScore * 100).toFixed(1)}% (WCAG: ${best.signals.wcagRatio}:1, APCA: ${best.signals.apcaEstimatedLc})`);
    console.log(`  Image Preservation : ${(best.tradeoffProfile.imageIntegrityScore * 100).toFixed(1)}% (Subject Occlusion: ${(best.signals.subjectInterference * 100).toFixed(0)}%)`);
    console.log(`  Spatial Balance    : ${(best.signals.spatialBalance * 100).toFixed(1)}% (Axis Coherence: ${(best.signals.axisCoherence * 100).toFixed(1)}%)`);
    console.log(`  Headline Choice    : Font: ${hElement.typographyState.family} ${hElement.typographyState.weight}, Size: ${(hElement.typographyState.fontScale * 100).toFixed(2)}%, Lines: ${hElement.typographyState.hypothesis?.lines?.length || 1}`);
    console.log(`  Headline Geometry  : [x: ${hElement.rect.x.toFixed(3)}, y: ${hElement.rect.y.toFixed(3)}, w: ${hElement.rect.width.toFixed(3)}, h: ${hElement.rect.height.toFixed(3)}]`);
    console.log(`  Color & Surface    : Ink: ${hElement.ink.color.hex} (${hElement.ink.role}), Surface: ${hElement.surface.surfaceField ? hElement.surface.surfaceField.background : 'none'}`);
    if (sElement) {
      console.log(`  Secondary Geometry : [x: ${sElement.rect.x.toFixed(3)}, y: ${sElement.rect.y.toFixed(3)}, w: ${sElement.rect.width.toFixed(3)}, h: ${sElement.rect.height.toFixed(3)}]`);
    }
    console.log(`  Decision Reasons   :`);
    for (const r of best.evaluation.reasons) {
      console.log(`    • ${r}`);
    }
    console.log(`  Retained Alternates: ${result.retainedAlternatives.length} diverse tradeoff states preserved`);
    console.log('------------------------------------------------------------------------\n');
  }
}

runValidation().catch(console.error);
