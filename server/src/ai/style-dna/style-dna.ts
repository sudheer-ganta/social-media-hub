import type {
  ArtDirectionFamily,
  RecipeBorderStyle,
  RecipeFooterStyle,
  RecipeImageTreatment,
  RecipeImperfection,
  RecipeLayoutBehaviour,
  RecipeLogoTreatment,
  RecipeShapeLanguage,
  RecipeSpacing,
  RecipeTexture,
  RecipeTypographyFamily,
  RecipeVisualDensity,
  ReferenceDesignRecipe,
} from '../types';

export type StyleDnaId =
  | 'minimalist' | 'editorial' | 'y2k' | 'desi-maximalism' | 'neo-brutalism'
  | 'minimal-doodles' | 'imperfect-handmade' | 'bold-typography' | 'cinematic-drama'
  | 'creator-ugc' | 'vibrant-color-blocking' | 'luxury' | 'retro-nostalgic'
  | 'collage' | '3d-futuristic';

export interface StyleTypographyDNA {
  displayPersonality: string[];
  bodyPersonality: string[];
  accentPersonality: string[];
  preferredWeights: number[];
  hierarchy: 'restrained' | 'strong' | 'dramatic';
  tracking: 'tight' | 'normal' | 'wide';
  lineHeight: 'compact' | 'normal' | 'open';
  textDensity: 'low' | 'medium' | 'high';
  preferredCategories: Array<'serif' | 'sans-serif' | 'display' | 'handwritten'>;
  accentAllowed: boolean;
}

export interface StyleColorDNA {
  paletteFamilies: string[][];
  accentFamilies: string[][];
  background: string[];
  contrast: 'low' | 'medium' | 'high';
  saturation: 'muted' | 'balanced' | 'vibrant';
  brightness: 'dark' | 'balanced' | 'bright';
  temperature: 'warm' | 'neutral' | 'cool' | 'mixed';
  relationships: string[];
  usageRatios: { primary: number; secondary: number; accent: number };
}

export interface StyleLightingDNA {
  direction: string[];
  quality: Array<'soft' | 'hard' | 'mixed'>;
  temperature: Array<'warm' | 'neutral' | 'cool' | 'mixed'>;
  contrast: 'low' | 'medium' | 'high';
  shadows: string[];
  highlights: string[];
  source: Array<'natural' | 'studio' | 'practical' | 'mixed'>;
  atmosphere: string[];
}

export interface StyleImageryDNA {
  medium: Array<'photography' | 'illustration' | 'mixed' | '3d'>;
  realism: 'low' | 'medium' | 'high';
  cameraFeel: string[];
  subjectPlacement: string[];
  depthOfField: string[];
  background: string[];
  cropping: string[];
  perspective: string[];
  detail: 'restrained' | 'balanced' | 'rich';
  productPresentation: string[];
}

export interface StyleLayoutDNA {
  grid: string[];
  alignment: string[];
  symmetry: 'symmetric' | 'asymmetric' | 'mixed';
  whitespace: 'tight' | 'controlled' | 'generous';
  density: RecipeVisualDensity;
  margins: 'tight' | 'standard' | 'wide';
  textImageRelationship: string[];
  focalPoint: string[];
  balance: string[];
  layoutBehaviour: RecipeLayoutBehaviour[];
}

export interface StyleImperfectionDNA {
  level: RecipeImperfection;
  allowed: string[];
  forbidden: string[];
}

export interface StyleDNA {
  id: StyleDnaId;
  name: string;
  description: string;
  aliases: string[];
  artDirectionFamilies: ArtDirectionFamily[];
  visualCharacter: string[];
  mood: string[];
  typography: StyleTypographyDNA;
  color: StyleColorDNA;
  lighting: StyleLightingDNA;
  composition: string[];
  layout: StyleLayoutDNA;
  imagery: StyleImageryDNA;
  texture: RecipeTexture[];
  graphicElements: string[];
  imperfection: StyleImperfectionDNA;
  renderer: {
    typographyFamily: RecipeTypographyFamily[];
    logoTreatment: RecipeLogoTreatment[];
    spacing: RecipeSpacing[];
    footer: RecipeFooterStyle[];
    border: RecipeBorderStyle[];
    shapeLanguage: RecipeShapeLanguage[];
    imageTreatment: RecipeImageTreatment[];
  };
  qualityConstraints: string[];
}

const GLOBAL_FAILURES = [
  'misspelled or malformed text', 'clipped or overflowing text', 'unintended overlaps',
  'unreadable text or insufficient contrast', 'elements outside the canvas',
  'distorted or invented logos', 'random alignment or inconsistent spacing',
];

type Seed = Omit<StyleDNA, 'qualityConstraints'>;
const define = (seed: Seed): StyleDNA => ({ ...seed, qualityConstraints: GLOBAL_FAILURES });

const type = (displayPersonality: string[], preferredCategories: StyleTypographyDNA['preferredCategories'], options: Partial<StyleTypographyDNA> = {}): StyleTypographyDNA => ({
  displayPersonality, bodyPersonality: ['readable', 'clear'], accentPersonality: [], preferredWeights: [400, 600, 700],
  hierarchy: 'strong', tracking: 'normal', lineHeight: 'normal', textDensity: 'medium', preferredCategories, accentAllowed: false, ...options,
});
const color = (paletteFamilies: string[][], options: Partial<StyleColorDNA> = {}): StyleColorDNA => ({
  paletteFamilies, accentFamilies: [['signal red'], ['electric blue'], ['warm gold']], background: ['paper white', 'near black'],
  contrast: 'medium', saturation: 'balanced', brightness: 'balanced', temperature: 'neutral', relationships: ['dominant neutral with one controlled accent'],
  usageRatios: { primary: 65, secondary: 25, accent: 10 }, ...options,
});
const light = (options: Partial<StyleLightingDNA> = {}): StyleLightingDNA => ({
  direction: ['front-side'], quality: ['soft'], temperature: ['neutral'], contrast: 'medium', shadows: ['controlled soft shadows'],
  highlights: ['restrained highlights'], source: ['natural', 'studio'], atmosphere: ['believable and grounded'], ...options,
});
const image = (medium: StyleImageryDNA['medium'], options: Partial<StyleImageryDNA> = {}): StyleImageryDNA => ({
  medium, realism: 'high', cameraFeel: ['premium editorial'], subjectPlacement: ['clear single focal subject'], depthOfField: ['natural separation'],
  background: ['purposeful low-detail negative space'], cropping: ['intentional crop'], perspective: ['eye-level or slight three-quarter'], detail: 'balanced',
  productPresentation: ['recognisable, undistorted, physically believable'], ...options,
});
const layout = (behaviour: RecipeLayoutBehaviour[], options: Partial<StyleLayoutDNA> = {}): StyleLayoutDNA => ({
  grid: ['modular grid'], alignment: ['optical alignment'], symmetry: 'mixed', whitespace: 'controlled', density: 'balanced', margins: 'standard',
  textImageRelationship: ['copy and image share one hierarchy'], focalPoint: ['one dominant focal point'], balance: ['optically balanced'], layoutBehaviour: behaviour, ...options,
});
const render = (typographyFamily: RecipeTypographyFamily[], options: Partial<StyleDNA['renderer']> = {}): StyleDNA['renderer'] => ({
  typographyFamily, logoTreatment: ['corner', 'footer'], spacing: ['generous'], footer: ['none', 'hairline'], border: ['none'],
  shapeLanguage: ['none', 'editorial-rules'], imageTreatment: ['full-bleed', 'inset'], ...options,
});
const imperfect = (level: RecipeImperfection, allowed: string[] = []): StyleImperfectionDNA => ({ level, allowed, forbidden: GLOBAL_FAILURES });

export const STYLE_DNA_LIBRARY: StyleDNA[] = [
  define({ id: 'minimalist', name: 'Minimalist', description: 'Quiet, spacious design with one unmistakable focal point.', aliases: ['minimal', 'minimalism', 'clean minimalist', 'less is more'], artDirectionFamilies: ['MINIMAL_ART', 'PRODUCT_STUDIO'], visualCharacter: ['restrained', 'precise', 'airy'], mood: ['calm', 'confident'], typography: type(['quiet', 'modern', 'precise'], ['sans-serif'], { hierarchy: 'restrained', preferredWeights: [400, 500, 600], lineHeight: 'open', textDensity: 'low' }), color: color([['warm white', 'charcoal'], ['stone', 'black']], { saturation: 'muted', brightness: 'bright', usageRatios: { primary: 80, secondary: 15, accent: 5 } }), lighting: light({ contrast: 'low', quality: ['soft'], shadows: ['very subtle contact shadows'] }), composition: ['isolated subject', 'large negative space'], layout: layout(['centered', 'asymmetric'], { whitespace: 'generous', density: 'minimal', margins: 'wide' }), imagery: image(['photography', 'illustration'], { detail: 'restrained', background: ['plain tonal field', 'quiet real surface'] }), texture: ['none'], graphicElements: ['single hairline when useful'], imperfection: imperfect('none'), renderer: render(['sans-modern'], { spacing: ['airy'], footer: ['none'], imageTreatment: ['inset', 'full-bleed'] }) }),
  define({ id: 'editorial', name: 'Editorial', description: 'Magazine-led composition, sophisticated type and controlled whitespace.', aliases: ['magazine', 'magazine style', 'editorial design', 'fashion editorial'], artDirectionFamilies: ['EDITORIAL_PHOTOGRAPHY', 'CULTURAL_EDITORIAL'], visualCharacter: ['sophisticated', 'structured', 'print-inspired'], mood: ['considered', 'premium'], typography: type(['sophisticated', 'elegant', 'editorial'], ['serif', 'sans-serif'], { preferredWeights: [400, 600, 700], lineHeight: 'open' }), color: color([['ink', 'paper', 'oxblood'], ['navy', 'cream', 'gold']], { saturation: 'muted', temperature: 'warm' }), lighting: light({ direction: ['window-side', 'soft frontal'], shadows: ['natural editorial shadow'] }), composition: ['magazine crop', 'clear column rhythm'], layout: layout(['grid', 'asymmetric'], { grid: ['editorial column grid'], whitespace: 'generous', margins: 'wide' }), imagery: image(['photography'], { cameraFeel: ['fashion editorial', 'documentary editorial'], cropping: ['decisive magazine crop'] }), texture: ['none', 'paper-grain'], graphicElements: ['hairline rules', 'folio-like metadata'], imperfection: imperfect('subtle', ['subtle print grain']), renderer: render(['serif-editorial'], { border: ['none', 'hairline'], footer: ['hairline', 'none'] }) }),
  define({ id: 'y2k', name: 'Y2K', description: 'Optimistic 2000s futurism with glossy geometry and energetic type.', aliases: ['y2k aesthetic', '2000s futuristic', 'millennium', 'cyber y2k'], artDirectionFamilies: ['INTERACTIVE_GRAPHIC', 'SURREAL_EDITORIAL'], visualCharacter: ['futuristic', 'glossy', 'playful-tech'], mood: ['energetic', 'optimistic'], typography: type(['futuristic', 'geometric', 'bold'], ['display', 'sans-serif'], { preferredWeights: [600, 700, 800], tracking: 'tight', hierarchy: 'dramatic', accentAllowed: true }), color: color([['chrome', 'ice blue', 'black'], ['silver', 'hot pink', 'violet']], { saturation: 'vibrant', brightness: 'bright', temperature: 'cool', relationships: ['iridescent cool base with one candy accent'] }), lighting: light({ quality: ['hard', 'mixed'], temperature: ['cool'], contrast: 'high', highlights: ['glossy specular highlights'], source: ['studio'], atmosphere: ['clean retro-future studio'] }), composition: ['dynamic geometry', 'layered depth'], layout: layout(['diagonal', 'asymmetric'], { density: 'dense', margins: 'tight' }), imagery: image(['3d', 'mixed'], { realism: 'medium', cameraFeel: ['wide-angle product fantasy'], perspective: ['wide-angle', 'low angle'], detail: 'rich' }), texture: ['noise', 'none'], graphicElements: ['chrome bubbles', 'pixel grids', 'orbital lines'], imperfection: imperfect('subtle', ['subtle digital noise']), renderer: render(['geometric-sans', 'condensed-display'], { spacing: ['tight'], shapeLanguage: ['geometric'], border: ['inset-frame', 'none'] }) }),
  define({ id: 'desi-maximalism', name: 'Desi Maximalism', description: 'Layered South Asian colour, ornament and expressive editorial energy.', aliases: ['desi maximalist', 'indian maximalism', 'south asian maximalism'], artDirectionFamilies: ['CULTURAL_EDITORIAL', 'COLLAGE', 'SURREAL_EDITORIAL'], visualCharacter: ['ornate', 'layered', 'celebratory'], mood: ['joyful', 'dramatic'], typography: type(['expressive', 'decorative', 'elegant'], ['serif', 'display'], { hierarchy: 'dramatic', accentAllowed: true, textDensity: 'high' }), color: color([['marigold', 'rani pink', 'deep green'], ['saffron', 'indigo', 'cream']], { saturation: 'vibrant', temperature: 'warm', relationships: ['jewel-tone complements with warm metallic accent'], usageRatios: { primary: 50, secondary: 35, accent: 15 } }), lighting: light({ temperature: ['warm'], contrast: 'high', highlights: ['warm ceremonial highlights'] }), composition: ['layered ornamental framing', 'central or offset hero'], layout: layout(['grid', 'asymmetric'], { density: 'dense', whitespace: 'tight', margins: 'tight' }), imagery: image(['photography', 'illustration', 'mixed'], { detail: 'rich', background: ['textile, architecture or ornament with controlled quiet zones'] }), texture: ['paper-grain', 'film-grain'], graphicElements: ['arches', 'floral motifs', 'decorative borders', 'cut-paper shapes'], imperfection: imperfect('subtle', ['print grain', 'slightly irregular decorative lines']), renderer: render(['serif-editorial', 'mixed'], { spacing: ['tight'], footer: ['solid-band', 'torn-paper'], border: ['inset-frame'], shapeLanguage: ['organic'] }) }),
  define({ id: 'neo-brutalism', name: 'Neo Brutalism', description: 'Hard-edged blocks, oversized type and deliberate asymmetry.', aliases: ['neo brutalist', 'brutalism', 'brutalist', 'neo-brutalism'], artDirectionFamilies: ['TYPOGRAPHY_LED', 'INTERACTIVE_GRAPHIC'], visualCharacter: ['raw', 'bold', 'unapologetic'], mood: ['urgent', 'confident'], typography: type(['bold', 'industrial', 'impactful'], ['display', 'sans-serif'], { hierarchy: 'dramatic', preferredWeights: [700, 800], tracking: 'tight', lineHeight: 'compact', textDensity: 'high' }), color: color([['black', 'white', 'acid yellow'], ['black', 'red', 'electric blue']], { contrast: 'high', saturation: 'vibrant', relationships: ['hard complementary blocks'], usageRatios: { primary: 55, secondary: 30, accent: 15 } }), lighting: light({ quality: ['hard'], contrast: 'high', shadows: ['hard graphic shadows'] }), composition: ['deliberate imbalance', 'oversized blocks'], layout: layout(['asymmetric', 'grid'], { grid: ['coarse modular grid'], symmetry: 'asymmetric', whitespace: 'tight', density: 'dense', margins: 'tight' }), imagery: image(['photography', 'illustration'], { cameraFeel: ['direct flash', 'graphic crop'], cropping: ['aggressive crop'] }), texture: ['noise', 'none'], graphicElements: ['thick rules', 'boxed labels', 'hard drop shadows'], imperfection: imperfect('subtle', ['deliberate optical asymmetry']), renderer: render(['condensed-display'], { spacing: ['tight'], border: ['thick'], footer: ['solid-band'], shapeLanguage: ['geometric'], imageTreatment: ['framed', 'inset'] }) }),
  define({ id: 'minimal-doodles', name: 'Minimal Doodles', description: 'Clean layouts softened by sparse hand-drawn annotations.', aliases: ['minimal doodle', 'doodle style', 'simple doodles'], artDirectionFamilies: ['MINIMAL_ART', 'ILLUSTRATIVE'], visualCharacter: ['friendly', 'light', 'human'], mood: ['warm', 'approachable'], typography: type(['friendly', 'clean'], ['sans-serif', 'handwritten'], { accentPersonality: ['handwritten', 'imperfect'], accentAllowed: true, hierarchy: 'restrained', textDensity: 'low' }), color: color([['cream', 'charcoal', 'sage'], ['white', 'navy', 'coral']], { saturation: 'muted', brightness: 'bright', usageRatios: { primary: 75, secondary: 20, accent: 5 } }), lighting: light({ contrast: 'low' }), composition: ['single subject with annotation breathing room'], layout: layout(['asymmetric', 'centered'], { whitespace: 'generous', density: 'minimal', margins: 'wide' }), imagery: image(['photography', 'illustration', 'mixed'], { detail: 'restrained' }), texture: ['none', 'paper-grain'], graphicElements: ['hand-drawn arrows', 'imperfect circles', 'short underline'], imperfection: imperfect('subtle', ['irregular doodle stroke', 'imperfect circles']), renderer: render(['sans-modern', 'mixed'], { spacing: ['airy'], shapeLanguage: ['organic'], border: ['none'] }) }),
  define({ id: 'imperfect-handmade', name: 'Imperfect / Handmade', description: 'Tactile materials and controlled human irregularity without broken design.', aliases: ['handmade', 'hand-drawn', 'imperfect', 'craft', 'tactile'], artDirectionFamilies: ['HANDCRAFTED', 'COLLAGE', 'ILLUSTRATIVE'], visualCharacter: ['tactile', 'human', 'crafted'], mood: ['warm', 'honest'], typography: type(['humanist', 'handwritten', 'warm'], ['handwritten', 'sans-serif'], { accentPersonality: ['handwritten', 'casual'], accentAllowed: true, lineHeight: 'open' }), color: color([['kraft', 'ink', 'rust'], ['cream', 'forest', 'ochre']], { saturation: 'muted', temperature: 'warm' }), lighting: light({ quality: ['soft'], temperature: ['warm'], contrast: 'low', shadows: ['subtle material shadows'], source: ['natural'] }), composition: ['cut-paper layering', 'slight optical asymmetry'], layout: layout(['asymmetric', 'stacked'], { symmetry: 'asymmetric', whitespace: 'controlled' }), imagery: image(['illustration', 'mixed', 'photography'], { cameraFeel: ['tabletop craft documentation'], background: ['paper, fabric or natural surface'] }), texture: ['paper-grain', 'noise'], graphicElements: ['torn edges', 'pencil marks', 'stitched rules'], imperfection: imperfect('strong', ['irregular hand-drawn lines', 'torn edges', 'natural grain', 'slight asymmetry']), renderer: render(['mixed'], { footer: ['torn-paper'], shapeLanguage: ['organic'], imageTreatment: ['inset', 'framed'] }) }),
  define({ id: 'bold-typography', name: 'Bold Typography', description: 'Type is the main visual device, supported by restrained imagery.', aliases: ['bold type', 'typography led', 'typographic poster', 'big typography'], artDirectionFamilies: ['TYPOGRAPHY_LED'], visualCharacter: ['graphic', 'direct', 'high-impact'], mood: ['confident', 'urgent'], typography: type(['impactful', 'condensed', 'bold'], ['display', 'sans-serif'], { preferredWeights: [700, 800], hierarchy: 'dramatic', tracking: 'tight', lineHeight: 'compact', textDensity: 'high' }), color: color([['black', 'white', 'red'], ['navy', 'cream', 'orange']], { contrast: 'high', saturation: 'balanced' }), lighting: light({ contrast: 'high' }), composition: ['oversized headline dominates', 'image supports type'], layout: layout(['stacked', 'asymmetric'], { density: 'dense', margins: 'tight', whitespace: 'tight' }), imagery: image(['photography', 'illustration'], { detail: 'restrained', cropping: ['aggressive supportive crop'] }), texture: ['none', 'halftone'], graphicElements: ['rules', 'underlines', 'type blocks'], imperfection: imperfect('none'), renderer: render(['condensed-display'], { spacing: ['tight'], footer: ['solid-band', 'none'], border: ['none', 'thick'] }) }),
  define({ id: 'cinematic-drama', name: 'Cinematic / Drama', description: 'Directional light, deep shadows and film-like visual storytelling.', aliases: ['cinematic', 'dramatic', 'movie still', 'film look', 'cinematic drama'], artDirectionFamilies: ['CINEMATIC', 'SURREAL_EDITORIAL'], visualCharacter: ['dramatic', 'immersive', 'film-like'], mood: ['moody', 'tense', 'premium'], typography: type(['dramatic', 'elegant'], ['serif', 'sans-serif'], { hierarchy: 'dramatic', tracking: 'wide', textDensity: 'low' }), color: color([['deep teal', 'amber', 'black'], ['burgundy', 'gold', 'charcoal']], { brightness: 'dark', contrast: 'high', saturation: 'muted', temperature: 'mixed' }), lighting: light({ direction: ['strong side light', 'backlight'], quality: ['hard', 'mixed'], temperature: ['mixed'], contrast: 'high', shadows: ['deep shaped shadows'], highlights: ['controlled rim highlights'], source: ['studio', 'practical'], atmosphere: ['cinematic haze without fantasy particles'] }), composition: ['narrative frame', 'deep foreground-background separation'], layout: layout(['asymmetric', 'centered'], { whitespace: 'controlled', density: 'balanced' }), imagery: image(['photography'], { cameraFeel: ['35mm film still', 'anamorphic restraint'], depthOfField: ['shallow cinematic focus'], perspective: ['low angle', 'observational eye-level'], detail: 'rich' }), texture: ['film-grain'], graphicElements: ['letterbox-like spatial rhythm', 'fine title rule'], imperfection: imperfect('subtle', ['natural film grain']), renderer: render(['serif-editorial', 'sans-modern'], { spacing: ['generous'], imageTreatment: ['full-bleed'], border: ['none'] }) }),
  define({ id: 'creator-ugc', name: 'Creator / UGC', description: 'Candid, platform-native visuals with clear, conversational overlays.', aliases: ['ugc', 'creator style', 'influencer', 'social native', 'phone camera'], artDirectionFamilies: ['DOCUMENTARY', 'PLAYFUL_GRAPHIC'], visualCharacter: ['authentic', 'spontaneous', 'relatable'], mood: ['casual', 'friendly'], typography: type(['friendly', 'modern'], ['sans-serif', 'handwritten'], { accentAllowed: true, preferredWeights: [500, 600, 700] }), color: color([['natural skin tones', 'white', 'black'], ['warm neutral', 'brand accent']], { saturation: 'balanced', temperature: 'warm' }), lighting: light({ direction: ['available window light', 'phone flash'], quality: ['soft', 'hard'], source: ['natural', 'practical'], shadows: ['natural uncorrected shadows'] }), composition: ['candid subject', 'platform-native framing'], layout: layout(['stacked', 'asymmetric'], { margins: 'standard', whitespace: 'controlled' }), imagery: image(['photography'], { cameraFeel: ['phone camera', 'handheld'], cropping: ['close social crop'], perspective: ['eye-level selfie', 'handheld observation'] }), texture: ['none', 'noise'], graphicElements: ['caption card', 'small sticker-like accent'], imperfection: imperfect('subtle', ['natural handheld framing', 'slight non-critical asymmetry']), renderer: render(['sans-modern', 'mixed'], { footer: ['solid-band', 'none'], shapeLanguage: ['organic', 'geometric'] }) }),
  define({ id: 'vibrant-color-blocking', name: 'Vibrant Color Blocking', description: 'Clean commercial layouts built from energetic blocks of color.', aliases: ['color blocking', 'colour blocking', 'vibrant blocks', 'colourful geometric'], artDirectionFamilies: ['INFORMATIONAL', 'PRODUCT_STUDIO', 'PLAYFUL_GRAPHIC'], visualCharacter: ['clean', 'energetic', 'commercial'], mood: ['optimistic', 'confident'], typography: type(['geometric', 'confident'], ['sans-serif'], { preferredWeights: [600, 700, 800] }), color: color([['cobalt', 'coral', 'cream'], ['violet', 'lime', 'navy']], { saturation: 'vibrant', brightness: 'bright', contrast: 'high', relationships: ['adjacent large fields with one complementary accent'], usageRatios: { primary: 55, secondary: 30, accent: 15 } }), lighting: light({ contrast: 'medium', source: ['studio'] }), composition: ['product intersects large color fields'], layout: layout(['grid', 'asymmetric'], { grid: ['large modular blocks'], density: 'balanced' }), imagery: image(['photography', 'illustration', 'mixed'], { background: ['flat color fields', 'clean studio sweep'] }), texture: ['none'], graphicElements: ['rectangles', 'circles', 'clean geometric dividers'], imperfection: imperfect('none'), renderer: render(['geometric-sans'], { footer: ['solid-band', 'none'], shapeLanguage: ['geometric'], imageTreatment: ['inset', 'framed'] }) }),
  define({ id: 'luxury', name: 'Luxury', description: 'Refined restraint, tactile materials and quiet high-value cues.', aliases: ['luxurious', 'premium luxury', 'high end', 'quiet luxury', 'elegant premium'], artDirectionFamilies: ['EDITORIAL_PHOTOGRAPHY', 'PRODUCT_STUDIO', 'CINEMATIC'], visualCharacter: ['refined', 'exclusive', 'tactile'], mood: ['serene', 'aspirational'], typography: type(['elegant', 'refined', 'high-contrast'], ['serif', 'sans-serif'], { hierarchy: 'strong', tracking: 'wide', lineHeight: 'open', textDensity: 'low', preferredWeights: [400, 500, 600] }), color: color([['ivory', 'black', 'champagne gold'], ['deep forest', 'cream', 'brass']], { saturation: 'muted', temperature: 'warm', relationships: ['tonal neutrals with a restrained metallic accent'], usageRatios: { primary: 75, secondary: 20, accent: 5 } }), lighting: light({ direction: ['soft side light'], quality: ['soft'], temperature: ['warm', 'neutral'], contrast: 'medium', shadows: ['long soft sculpting shadows'], highlights: ['precise material highlights'], source: ['studio', 'natural'] }), composition: ['hero object with breathing room', 'material detail'], layout: layout(['centered', 'grid'], { whitespace: 'generous', margins: 'wide', density: 'minimal' }), imagery: image(['photography'], { cameraFeel: ['medium-format product editorial'], depthOfField: ['selective shallow focus'], detail: 'rich', productPresentation: ['pristine, tactile, sculptural'] }), texture: ['none', 'film-grain'], graphicElements: ['fine rules', 'small restrained seal'], imperfection: imperfect('none'), renderer: render(['serif-editorial'], { spacing: ['airy'], border: ['hairline', 'none'], footer: ['hairline', 'none'] }) }),
  define({ id: 'retro-nostalgic', name: 'Retro / Nostalgic', description: 'Period-inspired color, print texture and familiar analog warmth.', aliases: ['retro', 'nostalgic', 'vintage', '70s', '80s', 'old school'], artDirectionFamilies: ['COLLAGE', 'EDITORIAL_PHOTOGRAPHY', 'ILLUSTRATIVE'], visualCharacter: ['analog', 'familiar', 'print-worn'], mood: ['warm', 'playful'], typography: type(['poster', 'warm', 'classic'], ['display', 'serif'], { accentAllowed: true, preferredWeights: [500, 600, 700] }), color: color([['mustard', 'rust', 'cream'], ['avocado', 'orange', 'brown']], { saturation: 'muted', temperature: 'warm', brightness: 'balanced', relationships: ['period triad with faded contrast'] }), lighting: light({ temperature: ['warm'], contrast: 'low', source: ['natural', 'practical'], highlights: ['soft halation'] }), composition: ['period-ad crop', 'layered print framing'], layout: layout(['grid', 'stacked'], { density: 'balanced' }), imagery: image(['photography', 'illustration', 'mixed'], { cameraFeel: ['35mm snapshot', 'vintage catalog'], realism: 'medium' }), texture: ['film-grain', 'halftone', 'paper-grain'], graphicElements: ['sunbursts', 'print dots', 'rounded period shapes'], imperfection: imperfect('subtle', ['faded print grain', 'slight registration feel without text distortion']), renderer: render(['serif-editorial', 'condensed-display'], { footer: ['solid-band'], border: ['hairline', 'inset-frame'], shapeLanguage: ['organic'] }) }),
  define({ id: 'collage', name: 'Collage', description: 'Layered cutouts, material contrast and energetic editorial assembly.', aliases: ['cutout collage', 'paper collage', 'mixed media collage'], artDirectionFamilies: ['COLLAGE', 'HANDCRAFTED'], visualCharacter: ['layered', 'expressive', 'mixed-media'], mood: ['inventive', 'energetic'], typography: type(['editorial', 'bold', 'handmade'], ['serif', 'display', 'handwritten'], { accentAllowed: true, hierarchy: 'dramatic' }), color: color([['paper neutral', 'black', 'red'], ['cyan', 'magenta', 'yellow']], { saturation: 'balanced', relationships: ['contrasting cut-paper fields'] }), lighting: light({ quality: ['soft'], shadows: ['subtle paper-edge shadows'], source: ['studio'] }), composition: ['overlapping cutouts with one clear hero'], layout: layout(['asymmetric', 'diagonal'], { symmetry: 'asymmetric', density: 'dense', whitespace: 'tight' }), imagery: image(['mixed', 'photography', 'illustration'], { detail: 'rich', background: ['paper field or editorial spread'] }), texture: ['paper-grain', 'halftone'], graphicElements: ['torn paper', 'cutouts', 'tape', 'scribble accents'], imperfection: imperfect('strong', ['torn edges', 'irregular cutouts', 'handmade annotations']), renderer: render(['mixed'], { spacing: ['tight'], footer: ['torn-paper', 'none'], shapeLanguage: ['organic'], imageTreatment: ['inset', 'framed'] }) }),
  define({ id: '3d-futuristic', name: '3D / Futuristic', description: 'Dimensional materials, precise perspective and polished future-facing form.', aliases: ['3d futuristic', 'futuristic 3d', 'cgi', '3d render', 'future tech'], artDirectionFamilies: ['PRODUCT_STUDIO', 'SURREAL_EDITORIAL', 'INTERACTIVE_GRAPHIC'], visualCharacter: ['dimensional', 'polished', 'technical'], mood: ['innovative', 'aspirational'], typography: type(['futuristic', 'technical', 'geometric'], ['sans-serif', 'display'], { preferredWeights: [500, 600, 700], tracking: 'tight' }), color: color([['graphite', 'ice blue', 'violet'], ['white', 'silver', 'electric cyan']], { temperature: 'cool', saturation: 'balanced', contrast: 'high' }), lighting: light({ direction: ['rim light', 'three-point studio'], quality: ['hard', 'mixed'], temperature: ['cool'], contrast: 'high', shadows: ['clean contact shadows'], highlights: ['controlled reflective highlights'], source: ['studio'] }), composition: ['precise perspective', 'hero form in dimensional space'], layout: layout(['centered', 'grid'], { whitespace: 'controlled' }), imagery: image(['3d'], { realism: 'high', cameraFeel: ['polished product CGI'], perspective: ['isometric', 'low three-quarter'], detail: 'rich' }), texture: ['none', 'noise'], graphicElements: ['translucent planes', 'precise grids', 'dimensional rings'], imperfection: imperfect('none'), renderer: render(['geometric-sans'], { shapeLanguage: ['geometric'], imageTreatment: ['full-bleed', 'inset'], border: ['none', 'inset-frame'] }) }),
];

const BY_ID = new Map(STYLE_DNA_LIBRARY.map((style) => [style.id, style]));

export function getStyleDNA(id?: string | null): StyleDNA | undefined {
  return id ? BY_ID.get(id as StyleDnaId) : undefined;
}

export const STYLE_DNA_VERSION = 'style-dna-v1';
export interface ResolvedStyleDNA { style: StyleDNA; source: 'explicit' | 'prompt' | 'history'; variant: number }

/** Deterministic today, replaceable by an AI classifier later without changing callers. */
export function resolveStyleDNA(input: { styleId?: string; prompt: string; variationKey?: string; preferredStyleId?: string }): ResolvedStyleDNA | undefined {
  const explicit = getStyleDNA(input.styleId);
  const lower = input.prompt.toLowerCase();
  const matched = STYLE_DNA_LIBRARY
    .map((style) => ({ style, score: style.aliases.reduce((n, alias) => n + (lower.includes(alias) ? alias.length : 0), lower.includes(style.name.toLowerCase()) ? style.name.length : 0) }))
    .sort((a, b) => b.score - a.score)[0];
  const promptStyle = matched && matched.score > 0 ? matched.style : undefined;
  const historical = getStyleDNA(input.preferredStyleId);
  // An explicit picker selection is a deliberate product requirement — the
  // member chose this style on purpose, so it must never be silently swapped
  // out because the free-text brief happens to contain another style's name
  // or alias (e.g. picking Y2K but writing "make it feel minimal somewhere").
  // Only when nothing was explicitly picked does prompt text get to name the
  // style, with history as the last, weakest signal.
  const style = explicit ?? promptStyle ?? historical;
  if (!style) return undefined;
  const seed = `${input.variationKey ?? ''}|${input.prompt}|${style.id}`;
  const variant = [...seed].reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) >>> 0, 7);
  return { style, source: explicit ? 'explicit' : promptStyle ? 'prompt' : 'history', variant };
}

const choose = <T>(values: T[], variant: number, offset: number): T => values[(variant + offset) % values.length];

export function styleDnaToRecipe(style: StyleDNA, variant: number): ReferenceDesignRecipe {
  return {
    photographyStyle: style.imagery.medium.includes('photography') ? `${choose(style.imagery.cameraFeel, variant, 1)}, ${choose(style.lighting.atmosphere, variant, 2)}` : '',
    illustrationStyle: style.imagery.medium.some((m) => m === 'illustration' || m === 'mixed' || m === '3d') ? style.visualCharacter.join(', ') : '',
    headlineCharacter: `${style.typography.displayPersonality.join(', ')}; ${style.typography.hierarchy} hierarchy`,
    supportingTypography: `${style.typography.bodyPersonality.join(', ')}; ${style.typography.lineHeight} leading`,
    compositionBehaviour: choose(style.composition, variant, 3), textHierarchy: `${style.typography.hierarchy} hierarchy, ${style.typography.textDensity} text density`,
    typographyFamily: choose(style.renderer.typographyFamily, variant, 4), colorPalette: [],
    layoutBehaviour: choose(style.layout.layoutBehaviour, variant, 5), logoTreatment: choose(style.renderer.logoTreatment, variant, 6),
    spacingBehaviour: choose(style.renderer.spacing, variant, 7), texture: choose(style.texture, variant, 8),
    graphicElements: style.graphicElements.slice(0, 4), footerStyle: choose(style.renderer.footer, variant, 9), borderStyle: choose(style.renderer.border, variant, 10),
    shapeLanguage: choose(style.renderer.shapeLanguage, variant, 11), visualDensity: style.layout.density,
    imperfectionLevel: style.imperfection.level, imageTreatment: choose(style.renderer.imageTreatment, variant, 12),
  };
}

export function renderStyleDnaInstructions(resolved?: ResolvedStyleDNA): string | null {
  if (!resolved) return null;
  const { style, variant } = resolved;
  return [
    `## FlowPost Style DNA — ${style.name}`,
    `Visual character: ${style.visualCharacter.join(', ')}. Mood: ${style.mood.join(', ')}.`,
    `Color behavior: ${choose(style.color.relationships, variant, 1)}; ${style.color.contrast} contrast; ${style.color.saturation} saturation; ${style.color.temperature} tendency; approximate usage ${style.color.usageRatios.primary}/${style.color.usageRatios.secondary}/${style.color.usageRatios.accent}. Vary within ${choose(style.color.paletteFamilies, variant, 2).join(', ')} — do not copy fixed swatches mechanically.`,
    `Lighting: ${choose(style.lighting.direction, variant, 3)}, ${choose(style.lighting.quality, variant, 4)}, ${choose(style.lighting.temperature, variant, 5)}, ${style.lighting.contrast} contrast; ${choose(style.lighting.shadows, variant, 6)}; ${choose(style.lighting.highlights, variant, 7)}.`,
    `Imagery: ${choose(style.imagery.medium, variant, 8)}, ${style.imagery.realism} realism, ${choose(style.imagery.cameraFeel, variant, 9)}, ${choose(style.imagery.subjectPlacement, variant, 10)}, ${choose(style.imagery.perspective, variant, 11)}, ${choose(style.imagery.background, variant, 12)}.`,
    `Composition: ${choose(style.composition, variant, 13)}; ${choose(style.layout.grid, variant, 14)}; ${style.layout.symmetry}; ${style.layout.whitespace} whitespace; ${style.layout.margins} margins; ${style.layout.density} density.`,
    `Texture and graphic language: ${choose(style.texture, variant, 15)}; ${style.graphicElements.join(', ')}.`,
    `Creative imperfection allowed: ${style.imperfection.allowed.join(', ') || 'none'}. Never imitate imperfection through ${style.imperfection.forbidden.join(', ')}.`,
  ].join('\n');
}

export function publicStyleLibrary() {
  return STYLE_DNA_LIBRARY.map(({ id, name, description, visualCharacter }) => ({ id, name, description, visualCharacter }));
}

export function validateStyleDNA(value: unknown): string[] {
  if (!value || typeof value !== 'object') return ['style must be an object'];
  const style = value as Partial<StyleDNA>;
  const errors: string[] = [];
  if (!style.id || !getStyleDNA(style.id)) errors.push('unknown style id');
  if (!style.name?.trim()) errors.push('name is required');
  if (!style.typography?.displayPersonality?.length) errors.push('display typography personality is required');
  if (!style.color?.relationships?.length) errors.push('color relationships are required');
  if (style.color && Object.values(style.color.usageRatios).reduce((a, b) => a + b, 0) !== 100) errors.push('color usage ratios must total 100');
  if (!style.lighting?.direction?.length) errors.push('lighting direction is required');
  if (!style.layout?.layoutBehaviour?.length) errors.push('layout behavior is required');
  if (!style.imagery?.medium?.length) errors.push('imagery medium is required');
  if (!style.qualityConstraints?.length) errors.push('quality constraints are required');
  return errors;
}
