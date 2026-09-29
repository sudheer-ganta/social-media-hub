import sharp from 'sharp';
import { discoverOptimizedComposition } from '../ai/render/composition-evaluation';
import { createCanvasRepresentation, createBrandDesignRepresentation, createDesignField } from '../ai/render/design-representation';
import { analyzeImageField } from '../ai/render/image-field';

async function runForensics() {
  console.log('=== 1. CONTINUOUS BACKDROP / CANVAS VARIATION TRACE ===');
  const width = 1080;
  const height = 1080;
  const canvas = createCanvasRepresentation(width, height);

  const copyItems = [
    {
      id: 'headline',
      text: 'Ceramic Heritage Collection',
      role: 'headline' as const,
      priority: 1,
      font: 'Playfair Display',
      weight: 700,
    },
  ];

  const logoItem = {
    id: 'brand-mark',
    role: 'logo' as const,
    aspectRatio: 2.5,
    sourceDimensions: { width: 250, height: 100 },
  };

  const brand = createBrandDesignRepresentation({
    colors: ['#1A1A1A', '#C5A059'],
    approvedFonts: { headline: ['Playfair Display'], body: ['Inter'] },
    logo: {
      aspectRatio: 2.5,
      detectedColor: '#1A1A1A',
      recommendedPlacement: 'top-left',
    },
  });

  // Test across 7 backdrop brightness levels from deep dark to high light
  const backdropLuminances = [0.08, 0.20, 0.35, 0.50, 0.65, 0.80, 0.95];
  for (const lum of backdropLuminances) {
    const hexVal = Math.round(lum * 255).toString(16).padStart(2, '0');
    const colorHex = `#${hexVal}${hexVal}${hexVal}`;

    const svg = `<svg width="${width}" height="${height}">
      <rect width="${width}" height="${height}" fill="${colorHex}"/>
      <circle cx="${width * 0.5}" cy="${height * 0.5}" r="${width * 0.3}" fill="#884422"/>
    </svg>`;
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
    const rawImageField = await analyzeImageField(buf);
    const field = createDesignField(rawImageField);

    const normalResult = discoverOptimizedComposition({ copyItems, logoItem, field, canvas, brand });
    const normalLogo = normalResult.bestState.elements.find(e => e.role === 'logo')!;

    console.log(`Backdrop Lum: ${(lum * 100).toFixed(0)}% (${colorHex}) -> Logo Rect: [x=${normalLogo.rect.x}, y=${normalLogo.rect.y}, w=${normalLogo.rect.width}, h=${normalLogo.rect.height}], Ink: ${normalLogo.ink.color.hex}, WCAG: ${normalLogo.ink.contrast.wcagRatio}:1, Score: ${normalResult.bestState.evaluation.aggregateScore}`);
  }

  console.log('\n=== 2. SHOWING BESTSTATE SELECTING SMALLER (< 0.055) AND LARGER (> 0.055) LOGO ===');
  
  // Clean serene bright image: quiet negative space allows compact elegant logo (e.g. h = 0.042)
  const cleanSvg = `<svg width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#f8fafc"/></svg>`;
  const cleanBuf = await sharp(Buffer.from(cleanSvg)).png().toBuffer();
  const cleanField = createDesignField(await analyzeImageField(cleanBuf));
  const cleanRes = discoverOptimizedComposition({ copyItems, logoItem, field: cleanField, canvas, brand });
  const cleanLogo = cleanRes.bestState.elements.find(e => e.role === 'logo')!;
  console.log(`Clean Serene Field -> Logo height: ${cleanLogo.rect.height} (Smaller than 0.055: ${cleanLogo.rect.height < 0.055})`);

  // Busy textured dark field under recovery: requires larger optical presence to cut through noise
  const busySvg = `<svg width="${width}" height="${height}">
    <rect width="${width}" height="${height}" fill="#111111"/>
    <circle cx="${width * 0.5}" cy="${height * 0.5}" r="${width * 0.4}" fill="#332211"/>
  </svg>`;
  const busyBuf = await sharp(Buffer.from(busySvg)).png().toBuffer();
  const busyField = createDesignField(await analyzeImageField(busyBuf));
  const recoveryContext = { failures: ['LOGO_LEGIBILITY_FAILURE'] as any[], reasons: ['Logo illegible'] };
  const busyRes = discoverOptimizedComposition({ copyItems, logoItem, field: busyField, canvas, brand, recoveryContext });
  const busyLogo = busyRes.bestState.elements.find(e => e.role === 'logo')!;
  console.log(`Busy Dark Field (Recovery) -> Logo height: ${busyLogo.rect.height} (Larger than 0.055: ${busyLogo.rect.height > 0.055})`);
}

runForensics().catch(console.error);
