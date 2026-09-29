import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { Resvg } from '@resvg/resvg-js';
import { fittedCopySvg, renderDesignerPlan, type DesignNode, type DesignerPlan } from './designer-composition';
import { fontFilePath } from '../typography/font-catalog';
import type { TypographySelection } from '../typography/font-selector';
import type { CampaignCopyLine } from '../prompts/campaign-creative.prompt';
import type { CreativeDirection, CreativeRenderContext } from '../types';
import { resolveBrandProfile } from '../brand/brand-profile';
import { resolveCreativeDna } from '../brand/creative-dna';

const mockTypography: TypographySelection = {
  headlineFont: 'Playfair Display',
  headlineWeight: 700,
  bodyFont: 'Inter',
  bodyWeight: 400,
  category: 'serif',
  facesUsed: [
    { family: 'Playfair Display', weight: 700, style: 'normal' },
    { family: 'Playfair Display', weight: 600, style: 'normal' },
    { family: 'Inter', weight: 400, style: 'normal' },
    { family: 'Inter', weight: 600, style: 'normal' },
    { family: 'DM Sans', weight: 500, style: 'normal' },
    { family: 'Cinzel', weight: 700, style: 'normal' },
    { family: 'Plus Jakarta Sans', weight: 400, style: 'normal' },
    { family: 'Anton', weight: 400, style: 'normal' },
    { family: 'Manrope', weight: 400, style: 'normal' },
  ],
  rationale: 'Editorial pairing',
};

const direction: CreativeDirection = {
  concept: 'Luxury Tea',
  visualStory: 'Steaming tea in ceramic cup',
  subject: 'Tea',
  environment: '',
  composition: 'centered',
  lighting: '',
  mood: 'quiet',
  palette: ['#ffffff', '#111111'],
  brandConstraints: [],
  productTreatment: '',
  background: '',
  negativeVisualConstraints: [],
  aspectRatio: '1:1',
  platform: 'instagram',
  mode: 'EDITORIAL',
  artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY',
  copyTreatment: 'headline',
  headline: 'The Light Within the Steamer',
  supportingLine: 'Hand-harvested green tea from high altitude gardens',
  cta: 'Discover Collection',
  interactionInstructions: '',
};

const copyLines: CampaignCopyLine[] = [
  { role: 'HEADLINE', text: 'The Light Within the Steamer' },
  { role: 'SUPPORT', text: 'Hand-harvested green tea from high altitude gardens' },
  { role: 'OFFER', text: 'Discover Collection' },
];

describe('Typography Handoff Integrity Tests', () => {
  const canvasW = 1600;
  const canvasH = 1600;

  it('1. Headline family preserved', () => {
    const node: DesignNode = {
      id: 'primary-hook',
      kind: 'copy',
      x: 0.05,
      y: 0.05,
      width: 0.8,
      height: 0.2,
      color: '#111111',
      surface: 'none',
      fontFamily: 'Playfair Display',
      fontWeight: 600,
      fontScale: 0.06,
      align: 'left',
      shape: 'rectangle',
      lines: ['The Light', 'Within the Steamer'],
    };
    const svg = fittedCopySvg(node, copyLines[0], mockTypography, canvasW, canvasH);
    expect(svg).toContain('font-family="Playfair Display"');
  });

  it('2. Headline weight preserved', () => {
    const node: DesignNode = {
      id: 'primary-hook',
      kind: 'copy',
      x: 0.05,
      y: 0.05,
      width: 0.8,
      height: 0.2,
      color: '#111111',
      surface: 'none',
      fontFamily: 'Playfair Display',
      fontWeight: 600,
      fontScale: 0.06,
      align: 'left',
      shape: 'rectangle',
      lines: ['The Light', 'Within the Steamer'],
    };
    const svg = fittedCopySvg(node, copyLines[0], mockTypography, canvasW, canvasH);
    expect(svg).toContain('font-weight="600"');
  });

  it('3. Support family preserved', () => {
    const node: DesignNode = {
      id: 'secondary-hook',
      kind: 'copy',
      x: 0.05,
      y: 0.30,
      width: 0.8,
      height: 0.15,
      color: '#333333',
      surface: 'none',
      fontFamily: 'Inter',
      fontWeight: 400,
      fontScale: 0.035,
      align: 'left',
      shape: 'rectangle',
      lines: ['Hand-harvested green tea', 'from high altitude gardens'],
    };
    const svg = fittedCopySvg(node, copyLines[1], mockTypography, canvasW, canvasH);
    expect(svg).toContain('font-family="Inter"');
    expect(svg).not.toContain('font-family="Playfair Display"');
  });

  it('4. Support weight preserved', () => {
    const node: DesignNode = {
      id: 'secondary-hook',
      kind: 'copy',
      x: 0.05,
      y: 0.30,
      width: 0.8,
      height: 0.15,
      color: '#333333',
      surface: 'none',
      fontFamily: 'Inter',
      fontWeight: 400,
      fontScale: 0.035,
      align: 'left',
      shape: 'rectangle',
      lines: ['Hand-harvested green tea', 'from high altitude gardens'],
    };
    const svg = fittedCopySvg(node, copyLines[1], mockTypography, canvasW, canvasH);
    expect(svg).toContain('font-weight="400"');
    expect(svg).not.toContain('font-weight="700"');
  });

  it('5. CTA family preserved', () => {
    const node: DesignNode = {
      id: 'cta',
      kind: 'copy',
      x: 0.05,
      y: 0.50,
      width: 0.3,
      height: 0.08,
      color: '#111111',
      surface: 'none',
      fontFamily: 'DM Sans',
      fontWeight: 500,
      fontScale: 0.03,
      align: 'left',
      shape: 'rectangle',
      lines: ['Discover Collection'],
    };
    const svg = fittedCopySvg(node, copyLines[2], mockTypography, canvasW, canvasH);
    expect(svg).toContain('font-family="DM Sans"');
  });

  it('6. CTA weight preserved', () => {
    const node: DesignNode = {
      id: 'cta',
      kind: 'copy',
      x: 0.05,
      y: 0.50,
      width: 0.3,
      height: 0.08,
      color: '#111111',
      surface: 'none',
      fontFamily: 'DM Sans',
      fontWeight: 500,
      fontScale: 0.03,
      align: 'left',
      shape: 'rectangle',
      lines: ['Discover Collection'],
    };
    const svg = fittedCopySvg(node, copyLines[2], mockTypography, canvasW, canvasH);
    expect(svg).toContain('font-weight="500"');
  });

  it('7. Font size preserved', () => {
    const node: DesignNode = {
      id: 'primary-hook',
      kind: 'copy',
      x: 0.05,
      y: 0.05,
      width: 0.8,
      height: 0.2,
      color: '#111111',
      surface: 'none',
      fontFamily: 'Playfair Display',
      fontWeight: 700,
      fontScale: 0.055,
      align: 'left',
      shape: 'rectangle',
      lines: ['The Light Within'],
    };
    const expectedPx = canvasW * 0.055; // 88px
    const svg = fittedCopySvg(node, copyLines[0], mockTypography, canvasW, canvasH);
    expect(svg).toContain(`font-size="${expectedPx}"`);
  });

  it('8. Tracking preserved', () => {
    const node: DesignNode = {
      id: 'primary-hook',
      kind: 'copy',
      x: 0.05,
      y: 0.05,
      width: 0.8,
      height: 0.2,
      color: '#111111',
      surface: 'none',
      fontFamily: 'Playfair Display',
      fontWeight: 700,
      fontScale: 0.05,
      tracking: -0.015,
      align: 'left',
      shape: 'rectangle',
      lines: ['The Light Within'],
    };
    const size = canvasW * 0.05; // 80px
    const expectedTracking = (-0.015 * size).toFixed(2); // "-1.20"
    const svg = fittedCopySvg(node, copyLines[0], mockTypography, canvasW, canvasH);
    expect(svg).toContain(`letter-spacing="${expectedTracking}"`);
  });

  it('9. Line structure preserved', () => {
    const lines = ['First Line Segment', 'Second Line Segment', 'Third Line Segment'];
    const node: DesignNode = {
      id: 'primary-hook',
      kind: 'copy',
      x: 0.05,
      y: 0.05,
      width: 0.8,
      height: 0.3,
      color: '#111111',
      surface: 'none',
      fontFamily: 'Playfair Display',
      fontWeight: 700,
      fontScale: 0.04,
      align: 'left',
      shape: 'rectangle',
      lines,
    };
    const svg = fittedCopySvg(node, copyLines[0], mockTypography, canvasW, canvasH);
    const renderedLines = [...svg.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map(m => m[1]);
    expect(renderedLines).toEqual(lines);
  });

  it('10. Line count preserved', () => {
    const lines = ['Line One', 'Line Two'];
    const node: DesignNode = {
      id: 'primary-hook',
      kind: 'copy',
      x: 0.05,
      y: 0.05,
      width: 0.8,
      height: 0.2,
      color: '#111111',
      surface: 'none',
      fontFamily: 'Playfair Display',
      fontWeight: 700,
      fontScale: 0.045,
      align: 'left',
      shape: 'rectangle',
      lines,
    };
    const svg = fittedCopySvg(node, copyLines[0], mockTypography, canvasW, canvasH);
    const renderedLines = [...svg.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map(m => m[1]);
    expect(renderedLines.length).toBe(2);
  });

  it('11. Line height preserved', () => {
    const node: DesignNode = {
      id: 'primary-hook',
      kind: 'copy',
      x: 0.05,
      y: 0.05,
      width: 0.8,
      height: 0.25,
      color: '#111111',
      surface: 'none',
      fontFamily: 'Playfair Display',
      fontWeight: 700,
      fontScale: 0.05, // 80px
      lineHeight: 1.14,
      align: 'left',
      shape: 'rectangle',
      lines: ['Line 1', 'Line 2'],
    };
    const size = 80;
    const expectedY0 = size; // 80
    const expectedY1 = size + size * 1.14; // 171.2
    const svg = fittedCopySvg(node, copyLines[0], mockTypography, canvasW, canvasH);
    expect(svg).toContain(`y="${expectedY0}"`);
    expect(svg).toContain(`y="${expectedY1}"`);
  });

  it('12. Renderer does not call character-based re-breaking when valid BestState lines exist', () => {
    const longSingleLine = ['Hand-harvested green tea from high altitude gardens'];
    const node: DesignNode = {
      id: 'secondary-hook',
      kind: 'copy',
      x: 0.05,
      y: 0.3,
      width: 0.9,
      height: 0.1,
      color: '#111111',
      surface: 'none',
      fontFamily: 'Inter',
      fontWeight: 400,
      fontScale: 0.03,
      align: 'left',
      shape: 'rectangle',
      lines: longSingleLine,
    };
    const svg = fittedCopySvg(node, copyLines[1], mockTypography, canvasW, canvasH);
    const renderedLines = [...svg.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map(m => m[1]);
    expect(renderedLines).toEqual(longSingleLine);
  });

  it('13. Renderer does not apply 0.90x shrink when BestState geometry is valid', () => {
    const node: DesignNode = {
      id: 'primary-hook',
      kind: 'copy',
      x: 0.04,
      y: 0.04,
      width: 0.85,
      height: 0.25,
      color: '#111111',
      surface: 'none',
      fontFamily: 'Playfair Display',
      fontWeight: 700,
      fontScale: 0.095, // 152px
      align: 'left',
      shape: 'rectangle',
      lines: ['Pure Vitamin', 'C Radiant Glow'],
    };
    const svg = fittedCopySvg(node, copyLines[0], mockTypography, canvasW, canvasH);
    expect(svg).toContain('font-size="152"');
  });

  it('14. Secondary-hook id does not override its resolved font', () => {
    const node: DesignNode = {
      id: 'secondary-hook',
      kind: 'copy',
      x: 0.05,
      y: 0.35,
      width: 0.6,
      height: 0.15,
      color: '#222222',
      surface: 'none',
      fontFamily: 'Plus Jakarta Sans',
      fontWeight: 400,
      fontScale: 0.035,
      align: 'left',
      shape: 'rectangle',
      lines: ['Secondary copy note'],
    };
    const svg = fittedCopySvg(node, copyLines[1], mockTypography, canvasW, canvasH);
    expect(svg).toContain('font-family="Plus Jakarta Sans"');
    expect(svg).toContain('font-weight="400"');
  });

  it('15. Different headline/support families survive SVG generation', () => {
    const headlineNode: DesignNode = {
      id: 'primary-hook',
      kind: 'copy',
      x: 0.05,
      y: 0.05,
      width: 0.8,
      height: 0.2,
      color: '#000000',
      surface: 'none',
      fontFamily: 'Cinzel',
      fontWeight: 700,
      fontScale: 0.06,
      align: 'left',
      shape: 'rectangle',
      lines: ['Headline Title'],
    };
    const supportNode: DesignNode = {
      id: 'secondary-hook',
      kind: 'copy',
      x: 0.05,
      y: 0.3,
      width: 0.8,
      height: 0.15,
      color: '#444444',
      surface: 'none',
      fontFamily: 'Inter',
      fontWeight: 400,
      fontScale: 0.035,
      align: 'left',
      shape: 'rectangle',
      lines: ['Support description text'],
    };
    const svgH = fittedCopySvg(headlineNode, copyLines[0], mockTypography, canvasW, canvasH);
    const svgS = fittedCopySvg(supportNode, copyLines[1], mockTypography, canvasW, canvasH);
    expect(svgH).toContain('font-family="Cinzel"');
    expect(svgS).toContain('font-family="Inter"');
  });

  it('16. Different headline/support weights survive SVG generation', () => {
    const headlineNode: DesignNode = {
      id: 'primary-hook',
      kind: 'copy',
      x: 0.05,
      y: 0.05,
      width: 0.8,
      height: 0.2,
      color: '#000000',
      surface: 'none',
      fontFamily: 'Inter',
      fontWeight: 700,
      fontScale: 0.06,
      align: 'left',
      shape: 'rectangle',
      lines: ['Bold Headline'],
    };
    const supportNode: DesignNode = {
      id: 'secondary-hook',
      kind: 'copy',
      x: 0.05,
      y: 0.3,
      width: 0.8,
      height: 0.15,
      color: '#444444',
      surface: 'none',
      fontFamily: 'Inter',
      fontWeight: 400,
      fontScale: 0.035,
      align: 'left',
      shape: 'rectangle',
      lines: ['Regular Support'],
    };
    const svgH = fittedCopySvg(headlineNode, copyLines[0], mockTypography, canvasW, canvasH);
    const svgS = fittedCopySvg(supportNode, copyLines[1], mockTypography, canvasW, canvasH);
    expect(svgH).toContain('font-weight="700"');
    expect(svgS).toContain('font-weight="400"');
  });

  it('17. Final SVG typography matches DesignNode typography', () => {
    const node: DesignNode = {
      id: 'primary-hook',
      kind: 'copy',
      x: 0.1,
      y: 0.1,
      width: 0.7,
      height: 0.2,
      color: '#1a1a1a',
      surface: 'none',
      fontFamily: 'Anton',
      fontWeight: 400,
      fontScale: 0.08,
      tracking: 0.01,
      lineHeight: 1.1,
      align: 'center',
      shape: 'rectangle',
      lines: ['ANTON HEADLINE'],
    };
    const svg = fittedCopySvg(node, copyLines[0], mockTypography, canvasW, canvasH);
    expect(svg).toContain('font-family="Anton"');
    expect(svg).toContain('font-weight="400"');
    expect(svg).toContain('font-size="128"');
    expect(svg).toContain('letter-spacing="1.28"');
    expect(svg).toContain('text-anchor="middle"');
    expect(svg).toContain('ANTON HEADLINE');
  });

  it('18. Existing successful "The Light Within the Steamer" creative does not regress', async () => {
    const plan: DesignerPlan = {
      background: '#fafaf9',
      rationale: 'Editorial ceramic calm',
      nodes: [
        {
          id: 'primary-hook',
          kind: 'copy',
          x: 0.05,
          y: 0.05,
          width: 0.85,
          height: 0.25,
          color: '#1c1917',
          surface: 'none',
          fontFamily: 'Playfair Display',
          fontWeight: 600,
          fontScale: 0.065,
          align: 'left',
          shape: 'rectangle',
          lines: ['The Light Within', 'the Steamer'],
        },
        {
          id: 'secondary-hook',
          kind: 'copy',
          x: 0.05,
          y: 0.32,
          width: 0.75,
          height: 0.15,
          color: '#44403c',
          surface: 'none',
          fontFamily: 'Inter',
          fontWeight: 400,
          fontScale: 0.035,
          align: 'left',
          shape: 'rectangle',
          lines: ['Hand-harvested green tea', 'from high altitude gardens'],
        },
        {
          id: 'brand-mark',
          kind: 'logo',
          x: 0.05,
          y: 0.88,
          width: 0.15,
          height: 0.05,
          color: '#1c1917',
          surface: 'none',
          fontScale: 0.045,
          align: 'left',
          shape: 'rectangle',
          lines: [],
        },
      ],
    };

    const context: CreativeRenderContext = {
      brand: resolveBrandProfile(),
      creativeDna: resolveCreativeDna(),
      goal: 'awareness',
      funnelStage: 'TOFU',
      platforms: ['instagram'],
    };

    const dummyLogo = {
      mimeType: 'image/png',
      data: (await sharp({ create: { width: 100, height: 40, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png().toBuffer()).toString('base64'),
    };

    const rendered = await renderDesignerPlan(
      plan,
      { direction, products: [], logo: dummyLogo },
      copyLines,
      mockTypography,
    );

    expect(rendered).toBeInstanceOf(Buffer);
    expect(rendered.length).toBeGreaterThan(1000);
  });

  it('19. GOLDEN HANDOFF INTEGRATION TEST: BestState === DesignNode === SVG across multi-role configuration', () => {
    // Multi-role setup:
    // Headline: Playfair Display 600
    // Support:  Inter 400
    // CTA:      DM Sans 500
    const nodes: DesignNode[] = [
      {
        id: 'primary-hook',
        kind: 'copy',
        x: 0.05,
        y: 0.06,
        width: 0.75,
        height: 0.22,
        color: '#18181b',
        surface: 'none',
        fontFamily: 'Playfair Display',
        fontWeight: 600,
        fontScale: 0.075,
        tracking: -0.015,
        lineHeight: 1.08,
        align: 'left',
        shape: 'rectangle',
        lines: ['Artisan Roastery', 'Special Release'],
      },
      {
        id: 'secondary-hook',
        kind: 'copy',
        x: 0.05,
        y: 0.32,
        width: 0.65,
        height: 0.14,
        color: '#52525b',
        surface: 'none',
        fontFamily: 'Inter',
        fontWeight: 400,
        fontScale: 0.038,
        tracking: 0.002,
        lineHeight: 1.25,
        align: 'left',
        shape: 'rectangle',
        lines: ['Micro-lot bourbon varietal', 'naturally fermented on raised beds'],
      },
      {
        id: 'cta',
        kind: 'copy',
        x: 0.05,
        y: 0.50,
        width: 0.32,
        height: 0.07,
        color: '#18181b',
        surface: 'none',
        fontFamily: 'DM Sans',
        fontWeight: 500,
        fontScale: 0.032,
        tracking: 0.02,
        lineHeight: 1.2,
        align: 'left',
        shape: 'rectangle',
        lines: ['Order Bag Now'],
      },
    ];

    const renderedSvgs = nodes.map((n, i) => fittedCopySvg(n, copyLines[i], mockTypography, canvasW, canvasH));

    // Assert Headline
    expect(renderedSvgs[0]).toContain('font-family="Playfair Display"');
    expect(renderedSvgs[0]).toContain('font-weight="600"');
    expect(renderedSvgs[0]).toContain(`font-size="${(canvasW * 0.075).toFixed(0)}"`);
    expect(renderedSvgs[0]).toContain(`letter-spacing="${(-0.015 * canvasW * 0.075).toFixed(2)}"`);
    expect(renderedSvgs[0]).toContain('<text x="0" y="120">Artisan Roastery</text>');
    expect(renderedSvgs[0]).toContain(`<text x="0" y="${120 + 120 * 1.08}">Special Release</text>`);

    // Assert Support
    expect(renderedSvgs[1]).toContain('font-family="Inter"');
    expect(renderedSvgs[1]).toContain('font-weight="400"');
    expect(renderedSvgs[1]).toContain(`font-size="${(canvasW * 0.038).toFixed(1)}"`);
    expect(renderedSvgs[1]).toContain(`letter-spacing="${(0.002 * canvasW * 0.038).toFixed(2)}"`);
    expect(renderedSvgs[1]).toContain('<text x="0" y="60.8">Micro-lot bourbon varietal</text>');
    expect(renderedSvgs[1]).toContain('<text x="0" y="136.8">naturally fermented on raised beds</text>');

    // Assert CTA
    expect(renderedSvgs[2]).toContain('font-family="DM Sans"');
    expect(renderedSvgs[2]).toContain('font-weight="500"');
    expect(renderedSvgs[2]).toContain(`font-size="${(canvasW * 0.032).toFixed(1)}"`);
    expect(renderedSvgs[2]).toContain(`letter-spacing="${(0.02 * canvasW * 0.032).toFixed(2)}"`);
    expect(renderedSvgs[2]).toContain('Order Bag Now');

    // Render in Resvg to verify rasterization succeeds without errors
    const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}">${renderedSvgs.join('')}</svg>`;
    const fontFiles = mockTypography.facesUsed.map(f => fontFilePath(f.family, f.weight, f.style));
    const resvg = new Resvg(fullSvg, { font: { fontFiles, loadSystemFonts: false } });
    const buffer = resvg.render().asPng();
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
  });
});
