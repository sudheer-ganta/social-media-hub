import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { analyzeImageField, type FieldRect } from './image-field';
import {
  createCanvasRepresentation,
  createCopyElement,
  createBrandDesignRepresentation,
  createDesignField,
  createDesignElement,
  createDynamicDesignContext,
} from './design-representation';

// Helper to create synthetic images
const makeImage = (width: number, height: number, paint: (nx: number, ny: number) => [number, number, number]) => {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x / width, y / height);
      const i = (y * width + x) * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
};

describe('Dynamic Design Representation — Phase 1', () => {
  describe('Canvas Representation', () => {
    it('computes correct geometric and aspect metrics for various canvas formats', () => {
      const square = createCanvasRepresentation(1200, 1200);
      expect(square.aspectRatio).toBeCloseTo(1.0);
      expect(square.orientation).toBe('square');
      expect(square.shortEdge).toBe(1200);
      expect(square.longEdge).toBe(1200);

      const portrait = createCanvasRepresentation(1080, 1920);
      expect(portrait.aspectRatio).toBeCloseTo(0.5625);
      expect(portrait.orientation).toBe('portrait');
      expect(portrait.shortEdge).toBe(1080);
      expect(portrait.longEdge).toBe(1920);

      const landscape = createCanvasRepresentation(1600, 900);
      expect(landscape.aspectRatio).toBeCloseTo(1.777, 2);
      expect(landscape.orientation).toBe('landscape');
      expect(landscape.shortEdge).toBe(900);
      expect(landscape.longEdge).toBe(1600);
    });

    it('accurately translates normalized coordinates to pixels and back', () => {
      const canvas = createCanvasRepresentation(1200, 1500);
      const norm = canvas.normalizePoint(600, 750);
      expect(norm.x).toBeCloseTo(0.5);
      expect(norm.y).toBeCloseTo(0.5);

      const px = canvas.toPixelsPoint(0.25, 0.8);
      expect(px.x).toBe(300);
      expect(px.y).toBe(1200);

      const rectPx = canvas.toPixelsRect({ x: 0.1, y: 0.2, width: 0.4, height: 0.3 });
      expect(rectPx.x).toBe(120);
      expect(rectPx.y).toBe(300);
      expect(rectPx.width).toBe(480);
      expect(rectPx.height).toBe(450);
    });
  });

  describe('Copy Element Representation', () => {
    it('structures copy as a first-class visual object with derived linguistic traits', () => {
      const headline = createCopyElement('c1', 'DISCOVER THE NEW CRAFT', 'primary-hook', 1);
      expect(headline.charCount).toBe(22);
      expect(headline.wordCount).toBe(4);
      expect(headline.words).toEqual(['DISCOVER', 'THE', 'NEW', 'CRAFT']);
      expect(headline.visualImportance).toBe(1.0);
      expect(headline.visualDensity).toBeGreaterThan(0);

      const subhead = createCopyElement('c2', 'Handcrafted seasonal single batches', 'secondary-hook', 2);
      expect(subhead.charCount).toBe(35);
      expect(subhead.wordCount).toBe(4);
      expect(subhead.visualImportance).toBeLessThan(headline.visualImportance);

      const cta = createCopyElement('c3', 'SHOP NOW', 'cta', 1);
      expect(cta.wordCount).toBe(2);
      expect(cta.semanticRole).toBe('cta');
    });
  });

  describe('Brand Design Representation', () => {
    it('creates a clean input boundary from BrandProfile and CreativeDna without duplicating truth', () => {
      const brand = createBrandDesignRepresentation({
        brandProfile: {
          name: 'Slowpour',
          tone: 'quiet, tactile',
          wordsToAvoid: ['rush', 'cheap'],
        },
        creativeDna: {
          brandColors: ['#14110f', '#c9a227', '#f4efe6', '#d97706'],
          mood: 'editorial',
        },
        logoAssetUrl: 'https://cdn.example.com/logo.png',
      });

      expect(brand.brandName).toBe('Slowpour');
      expect(brand.brandTone).toBe('quiet, tactile');
      expect(brand.primaryColors).toEqual(['#14110f', '#c9a227']);
      expect(brand.secondaryColors).toEqual(['#f4efe6', '#d97706']);
      expect(brand.neutralColors).toContain('#ffffff');
      expect(brand.neutralColors).toContain('#000000');
      expect(brand.constraints).toEqual(['rush', 'cheap']);
      expect(brand.logoAsset?.url).toBe('https://cdn.example.com/logo.png');
    });
  });

  describe('DesignField Continuous Spatial Representation', () => {
    it('samples continuous point properties across the image with bilinear precision', async () => {
      // Light background on left (0.9), dark on right (0.1)
      const buffer = await makeImage(256, 256, (nx) => (nx < 0.5 ? [230, 230, 230] : [25, 25, 25]));
      const imageField = await analyzeImageField(buffer);
      const field = createDesignField(imageField);

      const leftPoint = field.sample(0.2, 0.5);
      const rightPoint = field.sample(0.8, 0.5);
      const centerPoint = field.sample(0.5, 0.5);

      expect(leftPoint.luminance).toBeGreaterThan(0.7);
      expect(rightPoint.luminance).toBeLessThan(0.3);
      // Center boundary should be smoothly interpolated between left and right
      expect(centerPoint.luminance).toBeGreaterThan(rightPoint.luminance);
      expect(centerPoint.luminance).toBeLessThan(leftPoint.luminance);
    });

    it('evaluates proposed rectangular regions for quietness, luminance, and affordance', async () => {
      // Subject in bottom-right corner (nx: 0.6-0.9, ny: 0.6-0.9)
      const buffer = await makeImage(256, 256, (nx, ny) => {
        if (nx >= 0.6 && nx <= 0.9 && ny >= 0.6 && ny <= 0.9) {
          return [20, 20, 20]; // Dark high contrast subject
        }
        return [240, 240, 240]; // Light smooth background
      });

      const imageField = await analyzeImageField(buffer);
      const field = createDesignField(imageField);

      const quietTopLeft = field.evaluateRegion({ x: 0.05, y: 0.05, width: 0.4, height: 0.3 });
      const busyBottomRight = field.evaluateRegion({ x: 0.55, y: 0.55, width: 0.4, height: 0.4 });

      expect(quietTopLeft.quietness).toBeGreaterThan(0.6);
      expect(quietTopLeft.subjectOcclusion).toBeLessThan(0.05);
      expect(quietTopLeft.availableSpatialAffordance).toBeGreaterThan(0.7);

      expect(busyBottomRight.subjectOcclusion).toBeGreaterThan(0.5);
      expect(busyBottomRight.availableSpatialAffordance).toBeLessThan(quietTopLeft.availableSpatialAffordance);
    });

    it('proves dynamic variance: different images yield different measurements at identical coordinates', async () => {
      const darkImage = await makeImage(256, 256, () => [30, 30, 30]);
      const brightImage = await makeImage(256, 256, () => [240, 240, 240]);

      const darkField = createDesignField(await analyzeImageField(darkImage));
      const brightField = createDesignField(await analyzeImageField(brightImage));

      const testRect: FieldRect = { x: 0.1, y: 0.1, width: 0.5, height: 0.2 };
      const darkEval = darkField.evaluateRegion(testRect);
      const brightEval = brightField.evaluateRegion(testRect);

      expect(darkEval.verdict).toBe('dark');
      expect(brightEval.verdict).toBe('light');
      expect(darkEval.meanLuminance).toBeLessThan(0.1);
      expect(brightEval.meanLuminance).toBeGreaterThan(0.8);
    });

    it('discovers natural visual axes dynamically from image and canvas', async () => {
      const buffer = await makeImage(256, 256, (nx, ny) =>
        nx >= 0.5 && nx <= 0.8 && ny >= 0.2 && ny <= 0.8 ? [20, 20, 20] : [240, 240, 240]
      );
      const field = createDesignField(await analyzeImageField(buffer));
      const canvas = createCanvasRepresentation(1200, 1500);

      const axes = field.getVisualAxes(canvas);
      expect(axes.length).toBeGreaterThan(0);

      const marginAxes = axes.filter((a) => a.source === 'canvas-margin');
      const subjectAxes = axes.filter((a) => a.source === 'subject-edge');
      const focalAxes = axes.filter((a) => a.source === 'focal-point');

      expect(marginAxes.length).toBe(4);
      expect(subjectAxes.length).toBeGreaterThan(0);
      expect(focalAxes.length).toBe(2);
    });
  });

  describe('Unified Dynamic Design Context', () => {
    it('combines canvas, field, copy, brand, and elements into a unified state', async () => {
      const buffer = await makeImage(256, 256, () => [128, 128, 128]);
      const canvas = createCanvasRepresentation(1200, 1500);
      const field = createDesignField(await analyzeImageField(buffer));
      const copy = [
        createCopyElement('h1', 'HEADLINE', 'primary-hook', 1),
        createCopyElement('sub', 'Subtitle note', 'secondary-hook', 2),
      ];
      const brand = createBrandDesignRepresentation({
        brandProfile: { name: 'Test Brand' },
        creativeDna: { brandColors: ['#000000', '#ffffff'] },
      });

      const element = createDesignElement('elem_1', 'copy', { x: 0.1, y: 0.1, width: 0.8, height: 0.2 }, 'primary-hook');

      const context = createDynamicDesignContext({
        canvas,
        field,
        copyElements: copy,
        brand,
        initialElements: [element],
      });

      expect(context.canvas.width).toBe(1200);
      expect(context.copyElements.length).toBe(2);
      expect(context.brand.brandName).toBe('Test Brand');
      expect(context.elements.length).toBe(1);
    });
  });

  describe('Anti-Template Integrity Verification', () => {
    it('verifies that Phase 1 contains no hardcoded layout IDs, quadrant presets, or static template maps', () => {
      const codePath = path.join(__dirname, 'design-representation.ts');
      const code = fs.readFileSync(codePath, 'utf8');

      // Prohibited template/preset indicators
      const prohibitedTerms = [
        'TOP_LEFT',
        'TOP_RIGHT',
        'BOTTOM_LEFT',
        'BOTTOM_RIGHT',
        'LAYOUT_TEMPLATE',
        'PRESET_LAYOUT',
        'LAYOUT_PRESET',
        'QUADRANT_',
        'layoutId',
        'fashionLayout',
        'foodLayout',
        'techLayout',
      ];

      for (const term of prohibitedTerms) {
        expect(code).not.toContain(term);
      }
    });
  });
});
