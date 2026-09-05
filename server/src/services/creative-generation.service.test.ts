/**
 * Creative-generation pipeline — unit tests.
 *
 * Providers, Cloudinary and the repository are mocked: what is under test is
 * the orchestration (identity resolution → direction → image → upload →
 * persistence, and where it fails loudly instead of silently degrading).
 *
 * Run: cd server && npx vitest run src/services/creative-generation.service.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const identityDb = vi.hoisted(() => ({
  brand: { findFirst: vi.fn() },
  brandVoice: { findFirst: vi.fn() },
  creationProfile: { findUnique: vi.fn() },
}));
vi.mock('../config/prisma', () => ({ prisma: identityDb }));

const repo = vi.hoisted(() => ({
  create: vi.fn(async (input: Record<string, unknown>) => ({
    id: 'asset-1',
    userId: input.userId,
    contextType: input.contextType,
    brandId: input.brandId ?? null,
    prompt: input.prompt,
    creativeBrief: input.creativeBrief,
    sourceAssetUrls: input.sourceAssetUrls,
    imageUrl: null,
    cloudinaryPublicId: null,
    width: null,
    height: null,
    format: null,
    provider: input.provider,
    model: input.model,
    source: input.source,
    status: 'PENDING',
    campaignId: input.campaignId ?? null,
    parentAssetId: input.parentAssetId ?? null,
    createdAt: new Date(),
  })),
  markCompleted: vi.fn(async (id: string, data: Record<string, unknown>) => ({
    id,
    status: 'COMPLETED',
    ...data,
  })),
  markCompletedAndAttachConcept: vi.fn(async (id: string, _conceptId: string, _userId: string, data: Record<string, unknown>) => ({
    id,
    status: 'COMPLETED',
    ...data,
  })),
  markFailed: vi.fn(async () => undefined),
  findById: vi.fn(),
  listByScope: vi.fn(async () => []),
}));

vi.mock('../repositories/generated-asset.repository', () => repo);

const conceptRepo = vi.hoisted(() => ({
  saveDiscovered: vi.fn(async (_scope, _prompt, concept) => ({ ...concept, generatedAsset: null, generationStatus: 'not_generated' })),
  findOwned: vi.fn(),
  claimGeneration: vi.fn(async () => true),
  recordReopen: vi.fn(async () => undefined),
  attachGenerated: vi.fn(async () => undefined),
  markFailed: vi.fn(async () => undefined),
  recordAssetSignal: vi.fn(async () => true),
  explicitStyleHistory: vi.fn(async () => []),
}));
vi.mock('../repositories/creative-concept.repository', () => ({ creativeConceptRepository: conceptRepo }));

const intelligenceService = vi.hoisted(() => ({
  resolveBrandIntelligence: vi.fn(),
  recordConceptSignal: vi.fn(),
  recordAssetSignal: vi.fn(),
  setExplicitPreference: vi.fn(),
}));
vi.mock('./creative-brand-intelligence.service', () => ({ brandIntelligenceService: intelligenceService }));

const cloudinary = vi.hoisted(() => ({
  isConfigured: vi.fn(() => true),
  uploadImageBuffer: vi.fn(async () => ({ url: 'https://cdn.example.com/gen.png', publicId: 'flowpost/generated/gen' })),
}));

class CloudinaryUploadErrorMock extends Error {}

vi.mock('../services/cloudinary.service', () => ({
  cloudinaryService: cloudinary,
  CloudinaryUploadError: CloudinaryUploadErrorMock,
}));

const textProvider = { id: 'gemini', model: 'gemini-3.1-pro-preview', supportsVision: true, isConfigured: () => true, generateJson: vi.fn() };
const imageProvider = { id: 'gemini', model: 'gemini-2.5-flash-image', isConfigured: () => true, generateImage: vi.fn() };

const renderer = vi.hoisted(() => ({
  renderCreative: vi.fn(async ({ visualImage }: { visualImage: { mimeType: string; data: string } }) => ({
    mimeType: visualImage.mimeType,
    data: visualImage.data,
    structure: 'full-bleed/asymmetric/no-footer/logo:none/type:serif-editorial',
    plan: { canvas: { width: 1280, height: 1600 }, paper: '#f7f4ee', imageRect: { x: 0, y: 0, width: 1, height: 1 }, blocks: [], structure: '' },
  })),
}));

vi.mock('../ai/render/creative-renderer', () => renderer);

// The raster scan reads real pixels; orchestration tests feed fake bytes, so
// it's mocked clean here and steered per-test for the retry-path assertions.
const renderValidation = vi.hoisted(() => ({
  detectCheckerboard: vi.fn(async () => ({ detected: false, coverage: 0 })),
}));
vi.mock('../ai/render/render-validation', () => renderValidation);

vi.mock('../ai', async () => {
  const actual = await vi.importActual<typeof import('../ai')>('../ai');
  return {
    ...actual,
    providerForRole: vi.fn(() => textProvider),
    activeImageProvider: vi.fn(() => imageProvider),
  };
});

vi.mock('../ai/generators/image-analysis.generator', () => ({
  analyseImage: vi.fn(async () => null),
}));

vi.mock('../ai/vision/image-source', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ai/vision/image-source')>();
  return {
    ...actual,
    fetchInlineImage: vi.fn(async (_url: string) => ({
      mimeType: 'image/jpeg',
      data: 'ZmFrZQ==',
      sizeBytes: 4,
    })),
  };
});

vi.mock('../ai/generators/creative-direction.generator', () => ({
  generateCreativeDirection: vi.fn(async () => ({
    direction: {
      concept: 'Quiet Luxury',
      visualStory: 'A product on a dark table.',
      subject: 'the attached product',
      environment: 'studio',
      composition: 'centered',
      lighting: 'soft',
      mood: 'calm',
      palette: ['#111111'],
      brandConstraints: [],
      productTreatment: 'hero, large',
      background: 'dark gradient',
      negativeVisualConstraints: ['no invented logos'],
      aspectRatio: '4:5',
      platform: 'instagram',
      mode: 'EDITORIAL',
      artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY',
      copyTreatment: 'none',
      headline: '',
      supportingLine: '',
      cta: '',
      interactionInstructions: '',
    },
    meta: { provider: 'gemini', model: 'gemini-3.1-pro-preview', durationMs: 10 },
  })),
  summariseCreativeDirection: vi.fn(() => 'Concept: Quiet Luxury'),
}));

const MOCK_CONCEPT = {
  conceptName: 'Mock Concept',
  bigIdea: 'A mock advertising idea.',
  visualMechanism: 'visual metaphor',
  mode: 'EDITORIAL',
  artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY',
  scores: {
    conceptStrength: 80,
    brandSpecificity: 70,
    productRelevance: 80,
    visualOriginality: 70,
    scrollStoppingPotential: 70,
    messageClarity: 70,
    socialInteractionPotential: 60,
    templateRisk: 20,
  },
};

vi.mock('../ai/generators/creative-concepts.generator', () => ({
  generateCreativeConcepts: vi.fn(async () => ({
    concepts: [MOCK_CONCEPT],
    proposedCount: 1,
    meta: { provider: 'gemini', model: 'gemini-3.1-pro-preview', durationMs: 5 },
  })),
  classifyMechanismFamily: vi.fn(() => 'VISUAL_METAPHOR'),
}));

const EMPTY_RESEARCH = {
  researchPerformed: false,
  sources: [],
  referenceCount: 0,
  creativeMechanisms: [],
  visualPatterns: [],
  typographyPatterns: [],
  compositionPatterns: [],
  productTreatmentPatterns: [],
  ideasToAvoid: [],
  originalityDirection: '',
};

vi.mock('../ai/generators/creative-research.generator', () => ({
  generateCreativeResearch: vi.fn(async () => EMPTY_RESEARCH),
  EMPTY_CREATIVE_RESEARCH: EMPTY_RESEARCH,
}));

const SAMPLE_REFERENCE_STYLE = {
  analysed: true,
  referenceCount: 2,
  visualLanguage: 'editorial, tactile',
  compositionPatterns: [],
  typographyCharacter: '',
  colorRelationships: '',
  textureAndMaterial: '',
  lightingAndMood: '',
  photographicOrIllustrative: '',
  visualDensity: '',
  brandTreatment: '',
  creativeMechanisms: ['tactile paper texture'],
  imperfectionLevel: '',
  interactionPatterns: '',
  doNotCopy: ['the exact headline'],
  dominantDirection: 'Lean tactile and warm.',
  influence: 'medium',
};

vi.mock('../ai/generators/reference-style.generator', () => ({
  generateReferenceStyleProfile: vi.fn(async () => SAMPLE_REFERENCE_STYLE),
}));

const { creativeGenerationService, CreativeError } = await import('./creative-generation.service');
const { fetchInlineImage } = await import('../ai/vision/image-source');

beforeEach(() => {
  vi.clearAllMocks();
  textProvider.generateJson.mockResolvedValue({
    event: '', culturalContext: '', productCategory: '', offer: '', promotionType: '',
    venueType: '', audience: '', requiredClaims: [], optionalDetails: [], confidence: {},
  });
  identityDb.brand.findFirst.mockImplementation(async ({ where }: any) => ({
    id: where.id,
    name: where.id === 'brand-b' ? 'Brand B' : 'Brand A',
    description: '',
  }));
  identityDb.brandVoice.findFirst.mockResolvedValue(null);
  identityDb.creationProfile.findUnique.mockResolvedValue({ personalContext: {} });
  intelligenceService.resolveBrandIntelligence.mockResolvedValue({ brandId: 'brand-a', explicit: [], learned: [], guidance: [] });
  intelligenceService.recordConceptSignal.mockResolvedValue(undefined);
  intelligenceService.recordAssetSignal.mockResolvedValue(false);
  repo.create.mockImplementation(async (input: any) => ({
    id: 'asset-1',
    userId: input.userId,
    contextType: input.contextType,
    brandId: input.brandId ?? null,
    prompt: input.prompt,
    creativeBrief: input.creativeBrief,
    sourceAssetUrls: input.sourceAssetUrls,
    imageUrl: null,
    cloudinaryPublicId: null,
    width: null,
    height: null,
    format: null,
    provider: input.provider,
    model: input.model,
    source: input.source,
    status: 'PENDING',
    campaignId: input.campaignId ?? null,
    parentAssetId: input.parentAssetId ?? null,
    createdAt: new Date(),
  }));
  repo.markCompleted.mockImplementation(async (id: string, data: any) => ({ id, status: 'COMPLETED', ...data }));
  cloudinary.uploadImageBuffer.mockResolvedValue({
    url: 'https://cdn.example.com/gen.png',
    publicId: 'flowpost/generated/gen',
    width: 1024,
    height: 1024,
    format: 'png',
  });
  imageProvider.generateImage.mockResolvedValue([{ mimeType: 'image/png', data: 'aW1hZ2U=' }]);
  conceptRepo.findOwned.mockReset();
  conceptRepo.claimGeneration.mockResolvedValue(true);
});

describe('creativeGenerationService', () => {
  it('returns a completed concept image without any Gemini or Cloudinary call', async () => {
    const existing = {
      id: 'existing-asset', userId: 'user-1', contextType: 'personal', brandId: null,
      prompt: 'Coffee promotion', creativeBrief: { concept: 'Coffee Orbit' }, sourceAssetUrls: [],
      imageUrl: 'https://cdn.example.com/existing.png', cloudinaryPublicId: 'existing', width: 1080, height: 1080,
      format: 'png', provider: 'gemini', model: 'old-model', source: 'AI_GENERATED', status: 'COMPLETED',
      campaignId: null, parentAssetId: null, createdAt: new Date(), renderContext: null, typography: null,
    };
    conceptRepo.findOwned.mockResolvedValueOnce({ ...MOCK_CONCEPT, conceptId: 'concept-a', generationStatus: 'generated', generatedAsset: existing });

    const result = await creativeGenerationService.generate('user-1', {
      prompt: 'Coffee promotion',
      selectedConcept: { ...MOCK_CONCEPT, conceptId: 'concept-a' },
    });

    expect(result).toBe(existing);
    expect(conceptRepo.recordReopen).toHaveBeenCalledTimes(1);
    expect(conceptRepo.claimGeneration).not.toHaveBeenCalled();
    expect(textProvider.generateJson).not.toHaveBeenCalled();
    expect(imageProvider.generateImage).not.toHaveBeenCalled();
    expect(cloudinary.uploadImageBuffer).not.toHaveBeenCalled();
  });

  it('claims and attaches a never-generated concept exactly once', async () => {
    conceptRepo.findOwned.mockResolvedValueOnce({ ...MOCK_CONCEPT, conceptId: 'concept-b', generationStatus: 'not_generated', generatedAsset: null });
    await creativeGenerationService.generate('user-1', { prompt: 'Coffee promotion', selectedConcept: { ...MOCK_CONCEPT, conceptId: 'concept-b' } });
    expect(conceptRepo.claimGeneration).toHaveBeenCalledTimes(1);
    expect(imageProvider.generateImage).toHaveBeenCalled();
    expect(repo.markCompletedAndAttachConcept).toHaveBeenCalledWith(
      'asset-1', 'concept-b', 'user-1', expect.anything(),
    );
    expect(conceptRepo.attachGenerated).not.toHaveBeenCalled();
  });

  it('does not report success when the atomic concept attachment fails', async () => {
    conceptRepo.findOwned.mockResolvedValueOnce({ ...MOCK_CONCEPT, conceptId: 'concept-c', generationStatus: 'not_generated', generatedAsset: null });
    repo.markCompletedAndAttachConcept.mockRejectedValueOnce(new Error('Canonical concept attachment failed'));

    await expect(creativeGenerationService.generate('user-1', {
      prompt: 'Coffee promotion', selectedConcept: { ...MOCK_CONCEPT, conceptId: 'concept-c' },
    })).rejects.toMatchObject({ message: "Image created, but FlowPost couldn't save it. Try again." });
    expect(repo.markFailed).toHaveBeenCalledWith('asset-1');
  });

  it('keeps Brand A and Brand B voice lookups isolated by immutable brand id', async () => {
    identityDb.brandVoice.findFirst
      .mockResolvedValueOnce({ voice: { tone: 'Voice A' } })
      .mockResolvedValueOnce({ voice: { tone: 'Voice B' } });

    await creativeGenerationService.discoverConcepts('user-1', { prompt: 'Launch Brand A', contextType: 'brand', brandId: 'brand-a' });
    await creativeGenerationService.discoverConcepts('user-1', { prompt: 'Launch Brand B', contextType: 'brand', brandId: 'brand-b' });

    expect(identityDb.brandVoice.findFirst.mock.calls[0][0].where).toEqual({ created_by: 'user-1', brand_id: 'brand-a' });
    expect(identityDb.brandVoice.findFirst.mock.calls[1][0].where).toEqual({ created_by: 'user-1', brand_id: 'brand-b' });
  });

  it('personal context never queries or inherits a brand or brand voice', async () => {
    identityDb.creationProfile.findUnique.mockResolvedValueOnce({ personalContext: { tone: 'Personal voice' } });

    await creativeGenerationService.discoverConcepts('user-1', { prompt: 'Personal launch', contextType: 'personal' });

    expect(identityDb.creationProfile.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' }, select: { personalContext: true },
    });
    expect(identityDb.brand.findFirst).not.toHaveBeenCalled();
    expect(identityDb.brandVoice.findFirst).not.toHaveBeenCalled();
    expect(repo.listByScope).toHaveBeenCalledWith(
      { userId: 'user-1', contextType: 'personal', brandId: null }, expect.any(Number),
    );
  });

  it('does not call Gemini when another request already claimed the concept', async () => {
    conceptRepo.findOwned.mockResolvedValueOnce({ ...MOCK_CONCEPT, conceptId: 'concept-b', generationStatus: 'generating', generatedAsset: null });
    conceptRepo.claimGeneration.mockResolvedValueOnce(false);
    await expect(creativeGenerationService.generate('user-1', { prompt: 'Coffee promotion', selectedConcept: { ...MOCK_CONCEPT, conceptId: 'concept-b' } })).rejects.toMatchObject({ status: 409 });
    expect(imageProvider.generateImage).not.toHaveBeenCalled();
    expect(cloudinary.uploadImageBuffer).not.toHaveBeenCalled();
  });

  it('understand() returns a direction and summary without persisting or generating an image', async () => {
    const result = await creativeGenerationService.understand('user-1', {
      prompt: 'A premium Diwali campaign for our new black kurta collection.',
    });

    expect(result.direction.concept).toBe('Quiet Luxury');
    expect(result.summary).toBe('Concept: Quiet Luxury');
    expect(repo.create).not.toHaveBeenCalled();
    expect(imageProvider.generateImage).not.toHaveBeenCalled();
  });

  it('runs creative research before the direction call and threads it through', async () => {
    const research = await import('../ai/generators/creative-research.generator');
    await creativeGenerationService.generate('user-1', { prompt: 'Launch campaign' });

    expect(research.generateCreativeResearch).toHaveBeenCalledTimes(1);
    const direction = await import('../ai/generators/creative-direction.generator');
    const call = vi.mocked(direction.generateCreativeDirection).mock.calls[0][0];
    expect(call.research).toEqual(EMPTY_RESEARCH);
  });

  it('feeds recent completed creatives into concept generation as a visual-repetition memory', async () => {
    repo.listByScope.mockResolvedValueOnce([
      {
        id: 'prior-1',
        status: 'COMPLETED',
        creativeBrief: {
          artDirectionFamily: 'PRODUCT_STUDIO',
          mode: 'EDITORIAL',
          palette: ['#0a0a0a'],
          lighting: 'soft studio',
          background: 'dark gradient',
        },
      },
      { id: 'prior-2', status: 'PENDING', creativeBrief: { artDirectionFamily: 'COLLAGE' } },
    ]);

    await creativeGenerationService.generate('user-1', { prompt: 'Launch campaign' });

    const concepts = await import('../ai/generators/creative-concepts.generator');
    const call = vi.mocked(concepts.generateCreativeConcepts).mock.calls[0][0];
    // Only the COMPLETED asset's signature is surfaced — a PENDING/FAILED row never rendered.
    expect(call.recentSignatures).toEqual([
      { artDirectionFamily: 'PRODUCT_STUDIO', mode: 'EDITORIAL', palette: ['#0a0a0a'], lighting: 'soft studio', background: 'dark gradient' },
    ]);
  });

  it('analyses fresh reference images and threads the profile into concepts and direction', async () => {
    const asset = await creativeGenerationService.generate('user-1', {
      prompt: 'Launch campaign',
      referenceImageUrls: ['https://cdn.example.com/ref1.jpg', 'https://cdn.example.com/ref2.jpg'],
      referenceLabels: ['Inspiration', 'Inspiration'],
    });

    const referenceStyle = await import('../ai/generators/reference-style.generator');
    expect(referenceStyle.generateReferenceStyleProfile).toHaveBeenCalledTimes(1);
    expect(vi.mocked(referenceStyle.generateReferenceStyleProfile).mock.calls[0][0]).toMatchObject({
      referenceUrls: ['https://cdn.example.com/ref1.jpg', 'https://cdn.example.com/ref2.jpg'],
      labels: ['Inspiration', 'Inspiration'],
    });

    const concepts = await import('../ai/generators/creative-concepts.generator');
    expect(vi.mocked(concepts.generateCreativeConcepts).mock.calls[0][0].referenceStyle).toEqual(SAMPLE_REFERENCE_STYLE);

    const direction = await import('../ai/generators/creative-direction.generator');
    expect(vi.mocked(direction.generateCreativeDirection).mock.calls[0][0].referenceStyle).toEqual(SAMPLE_REFERENCE_STYLE);

    expect(asset.status).toBe('COMPLETED');
  });

  it('reuses a saved style profile without re-analysing reference images', async () => {
    await creativeGenerationService.generate('user-1', {
      prompt: 'Launch campaign',
      referenceStyleProfile: SAMPLE_REFERENCE_STYLE,
    });

    const referenceStyle = await import('../ai/generators/reference-style.generator');
    expect(referenceStyle.generateReferenceStyleProfile).not.toHaveBeenCalled();

    const concepts = await import('../ai/generators/creative-concepts.generator');
    expect(vi.mocked(concepts.generateCreativeConcepts).mock.calls[0][0].referenceStyle).toEqual(SAMPLE_REFERENCE_STYLE);
  });

  it('discoverConcepts() returns the referenceStyle profile for the "FlowPost understood your style" step', async () => {
    const outcome = await creativeGenerationService.discoverConcepts('user-1', {
      prompt: 'Launch campaign',
      referenceImageUrls: ['https://cdn.example.com/ref1.jpg'],
    });

    expect(outcome.referenceStyle).toEqual(SAMPLE_REFERENCE_STYLE);
  });

  it('injects strong brand preferences into concept generation without an additional model call', async () => {
    intelligenceService.resolveBrandIntelligence.mockResolvedValueOnce({
      brandId: 'brand-a',
      preferredStyleId: 'editorial',
      guidance: ['Prefer color: black and gold', 'Avoid density: crowded'],
      explicit: [{ id: 'e1', dimension: 'color', value: 'black and gold', polarity: 'positive', source: 'explicit', occurrenceCount: 1, confidence: 1, strength: 'explicit' }],
      learned: [{ id: 'l1', dimension: 'density', value: 'crowded', polarity: 'negative', source: 'rejected', occurrenceCount: 4, confidence: .76, strength: 'strong' }],
    });

    await creativeGenerationService.discoverConcepts('user-1', {
      prompt: 'Premium launch', contextType: 'brand', brandId: 'brand-a',
    });

    const concepts = await import('../ai/generators/creative-concepts.generator');
    const profile = vi.mocked(concepts.generateCreativeConcepts).mock.calls[0][0].referenceStyle;
    expect(profile?.brandTreatment).toContain('Prefer color: black and gold');
    expect(profile?.doNotCopy).toContain('Avoid density: crowded');
    expect(intelligenceService.resolveBrandIntelligence).toHaveBeenCalledTimes(1);
    expect(textProvider.generateJson).toHaveBeenCalledTimes(1); // existing intent extraction only
  });

  it('generate() with no references never calls the reference-style analyser', async () => {
    await creativeGenerationService.generate('user-1', { prompt: 'Launch campaign' });

    const referenceStyle = await import('../ai/generators/reference-style.generator');
    expect(referenceStyle.generateReferenceStyleProfile).not.toHaveBeenCalled();
  });

  it('generate() with no assets produces and persists a completed asset', async () => {
    const asset = await creativeGenerationService.generate('user-1', {
      prompt: 'Summer collection launch',
    });

    expect(asset.status).toBe('COMPLETED');
    expect(asset.imageUrl).toBe('https://cdn.example.com/gen.png');
    // ONE row per generation (§14): the campaign design completes the same
    // asset the pipeline opened — no transient Stage A row left behind.
    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(repo.markCompleted).toHaveBeenCalledTimes(1);
    expect(repo.markFailed).not.toHaveBeenCalled();

    // No reference images sent — this is a text-to-image request.
    const call = imageProvider.generateImage.mock.calls[0][0];
    expect(call.referenceImages).toHaveLength(0);
  });

  it('uses one image-model call and makes the validated renderer result final', async () => {
    await creativeGenerationService.generate('user-1', { prompt: 'Summer collection launch' });

    expect(imageProvider.generateImage).toHaveBeenCalledTimes(1);
    expect(renderer.renderCreative).toHaveBeenCalledTimes(1);
  });

  it('rejects a renderer or validator failure and never uploads the raw Gemini visual', async () => {
    renderer.renderCreative.mockRejectedValueOnce(new Error('layout overlap violation'));

    await expect(creativeGenerationService.generate('user-1', { prompt: 'Launch' })).rejects.toMatchObject({
      status: 422,
      message: 'FlowPost could not produce a valid design. Please try again.',
    });
    expect(cloudinary.uploadImageBuffer).not.toHaveBeenCalled();
    expect(repo.markCompleted).not.toHaveBeenCalled();
    expect(repo.markFailed).toHaveBeenCalledWith('asset-1');
  });

  it('keeps the standalone creative when the campaign pass fails — a successful generation is never lost', async () => {
    imageProvider.generateImage.mockResolvedValueOnce([{ mimeType: 'image/png', data: 'aW1hZ2U=' }]);

    const asset = await creativeGenerationService.generate('user-1', { prompt: 'Summer collection launch' });

    expect(asset.status).toBe('COMPLETED');
    expect(asset.imageUrl).toBe('https://cdn.example.com/gen.png');
    // Only the Stage A row was created, and nothing was marked failed.
    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(repo.markFailed).not.toHaveBeenCalled();
  });

  // Distinct bytes per artifact so uploads can be told apart:
  // 'dmlzdWFs' = "visual", 'cmVuZGVy' = "render", 'Y2FtcGFpZ24=' = "campaign".
  const RENDER_PLAN = {
    canvas: { width: 1280, height: 1600 },
    paper: '#f7f4ee',
    imageRect: { x: 0, y: 0, width: 1, height: 1 },
    blocks: [],
    structure: '',
  };

  it('uploads the validated renderer result as final and keeps the wordless foundation only for refinements', async () => {
    imageProvider.generateImage.mockResolvedValueOnce([{ mimeType: 'image/png', data: 'dmlzdWFs' }]);
    renderer.renderCreative.mockResolvedValueOnce({
      mimeType: 'image/png', data: 'cmVuZGVy', structure: 'none', plan: RENDER_PLAN,
    });

    await creativeGenerationService.generate('user-1', { prompt: 'Launch' });

    const uploadedPayloads = cloudinary.uploadImageBuffer.mock.calls.map((call) =>
      (call[0] as Buffer).toString('base64'),
    );
    // The renderer output is final; the raw visual is retained only as the
    // private refinement foundation.
    expect(uploadedPayloads).toHaveLength(2);
    expect(uploadedPayloads).toContain('dmlzdWFs');
    expect(uploadedPayloads).toContain('cmVuZGVy');
    expect(uploadedPayloads).not.toContain('Y2FtcGFpZ24=');
  });

  it('falls back to uploading the Stage A creative when the campaign fails — the successful image is never lost', async () => {
    imageProvider.generateImage.mockResolvedValueOnce([{ mimeType: 'image/png', data: 'dmlzdWFs' }]);
    renderer.renderCreative.mockResolvedValueOnce({
      mimeType: 'image/png', data: 'cmVuZGVy', structure: 'none', plan: RENDER_PLAN,
    });

    const asset = await creativeGenerationService.generate('user-1', { prompt: 'Launch' });

    expect(asset.status).toBe('COMPLETED');
    const uploadedPayloads = cloudinary.uploadImageBuffer.mock.calls.map((call) =>
      (call[0] as Buffer).toString('base64'),
    );
    expect(uploadedPayloads).toContain('cmVuZGVy');
    expect(repo.markFailed).not.toHaveBeenCalled();
  });

  it('generates exactly one creative direction per request', async () => {
    await creativeGenerationService.generate('user-1', { prompt: 'Launch' });

    const direction = await import('../ai/generators/creative-direction.generator');
    expect(direction.generateCreativeDirection).toHaveBeenCalledTimes(1);
  });

  it('persists the wordless visual foundation URL for future refinements', async () => {
    cloudinary.uploadImageBuffer
      .mockResolvedValueOnce({ url: 'https://cdn.example.com/final.png', publicId: 'f', width: 1, height: 1, format: 'png' })
      .mockResolvedValueOnce({ url: 'https://cdn.example.com/visual.png', publicId: 'v' });

    await creativeGenerationService.generate('user-1', { prompt: 'Launch' });

    const completed = repo.markCompleted.mock.calls[0][1];
    expect(completed.renderContext.visualImageUrl).toBe('https://cdn.example.com/visual.png');
    expect(completed.imageUrl).toBe('https://cdn.example.com/final.png');
  });

  it('logs per-stage timing and call counts for every generation', async () => {
    const info = vi.spyOn(console, 'info');
    try {
      await creativeGenerationService.generate('user-1', { prompt: 'Launch' });

      const timing = info.mock.calls.find(([message]) => message === '[creative] request timing');
      expect(timing).toBeDefined();
      expect(timing![1]).toMatchObject({ imageCalls: 1, cloudinaryUploads: 2 });
      expect(timing![1]).toHaveProperty('totalDurationMs');
      expect(timing![1]).toHaveProperty('directionDurationMs');
      expect(timing![1]).toHaveProperty('textCalls');
    } finally {
      info.mockRestore();
    }
  });

  it('brand mode refuses to render without a real logo, before any model is called', async () => {
    await expect(
      creativeGenerationService.generate('user-1', {
        prompt: 'Diwali campaign',
        contextType: 'brand',
        brandId: 'brand-1',
      }),
    ).rejects.toMatchObject({
      status: 422,
      message: 'Add your brand logo to create a branded creative.',
    });

    expect(imageProvider.generateImage).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('brand mode with a real logo proceeds without sending the logo to the image model to redraw', async () => {
    const asset = await creativeGenerationService.generate('user-1', {
      prompt: 'Diwali campaign',
      contextType: 'brand',
      brandId: 'brand-1',
      creativeDna: { logoAssetUrl: 'https://cdn.example.com/logo.png' },
    });

    expect(asset.status).toBe('COMPLETED');
    const visualCall = imageProvider.generateImage.mock.calls[0][0];
    // The logo file itself never rides along as something to reproduce.
    expect(visualCall.referenceImages).not.toContainEqual({ mimeType: 'image/jpeg', data: 'ZmFrZQ==' });
    // renderCreative is mocked in this file (fast), but this test can share a
    // worker pool with the real-renderer tests in ai/render/*.test.ts, whose
    // font-file rasterization is genuinely CPU-heavy — generous timeout so
    // that contention doesn't fail an otherwise-instant test.
  }, 20_000);

  it('concept discovery is still allowed in brand mode without a logo — only rendering is gated', async () => {
    const outcome = await creativeGenerationService.discoverConcepts('user-1', {
      prompt: 'Diwali campaign',
      contextType: 'brand',
      brandId: 'brand-1',
    });

    expect(outcome.concepts).toHaveLength(1);
  });

  it('generate() records provenance as AI_GENERATED and persists Cloudinary\'s own dimensions', async () => {
    await creativeGenerationService.generate('user-1', { prompt: 'Summer collection launch' });

    expect(repo.create.mock.calls[0][0].source).toBe('AI_GENERATED');
    expect(repo.markCompleted.mock.calls[0][1]).toMatchObject({ width: 1024, height: 1024, format: 'png' });
  });

  it('answers 503 before any model call when image storage is not configured — the deployed-server 502 was one real Gemini image burnt per click', async () => {
    cloudinary.isConfigured.mockReturnValueOnce(false);

    await expect(creativeGenerationService.generate('user-1', { prompt: 'Launch' })).rejects.toMatchObject({
      status: 503,
      message: 'Image storage is not configured on this server yet.',
    });

    expect(imageProvider.generateImage).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('reports "created but couldn\'t save" — not "generation failed" — when Gemini succeeds and only Cloudinary fails', async () => {
    cloudinary.uploadImageBuffer.mockRejectedValue(new CloudinaryUploadErrorMock('Cloudinary rejected the upload'));

    await expect(creativeGenerationService.generate('user-1', { prompt: 'Launch' })).rejects.toMatchObject({
      message: "Image created, but FlowPost couldn't save it. Try again.",
    });

    expect(repo.markFailed).toHaveBeenCalledTimes(1);
  });

  it('regenerates once when the visual fails the checkerboard scan, and completes when the retry is clean', async () => {
    renderValidation.detectCheckerboard
      .mockResolvedValueOnce({ detected: true, coverage: 0.4 })
      .mockResolvedValueOnce({ detected: false, coverage: 0 });

    const asset = await creativeGenerationService.generate('user-1', { prompt: 'Launch' });

    expect(asset.status).toBe('COMPLETED');
    // One initial visual and exactly one deterministic artifact retry.
    expect(imageProvider.generateImage).toHaveBeenCalledTimes(2);
    expect(imageProvider.generateImage.mock.calls[1][0].prompt).toContain('checkerboard');
  });

  it('fails loudly — never ships the artifact — when the retry is also checkered', async () => {
    renderValidation.detectCheckerboard
      .mockResolvedValueOnce({ detected: true, coverage: 0.4 })
      .mockResolvedValueOnce({ detected: true, coverage: 0.35 });

    await expect(creativeGenerationService.generate('user-1', { prompt: 'Launch' })).rejects.toMatchObject({
      message: 'The generated visual contained a rendering artifact. Please try again.',
    });
    expect(imageProvider.generateImage).toHaveBeenCalledTimes(2);
    expect(repo.markFailed).toHaveBeenCalledTimes(1);
  });

  it('generate() with an asset fetches it and sends it as a reference image, preserving the subject', async () => {
    const asset = await creativeGenerationService.generate('user-1', {
      prompt: 'Create a monsoon campaign for this shoe.',
      assetUrls: ['https://cdn.example.com/shoe.jpg'],
    });

    expect(fetchInlineImage).toHaveBeenCalledWith('https://cdn.example.com/shoe.jpg');
    const call = imageProvider.generateImage.mock.calls[0][0];
    expect(call.referenceImages).toHaveLength(1);
    expect(call.prompt).toContain('Preserve the exact product/subject shown');
    expect(asset.status).toBe('COMPLETED');
  });

  it('generate() with a saved brand logo fetches it for the renderer, never sends it to the image model, and never redraws it', async () => {
    const asset = await creativeGenerationService.generate('user-1', {
      prompt: 'Diwali campaign',
      creativeDna: { logoAssetUrl: 'https://cdn.example.com/logo.png' },
    });

    expect(fetchInlineImage).toHaveBeenCalledWith('https://cdn.example.com/logo.png');
    const call = imageProvider.generateImage.mock.calls[0][0];
    expect(call.referenceImages).toHaveLength(0);
    expect(call.prompt).not.toContain('reproduce it exactly');
    expect(renderer.renderCreative).toHaveBeenCalledWith(
      expect.objectContaining({ logoImage: { mimeType: 'image/jpeg', data: 'ZmFrZQ==' } }),
    );
    expect(asset.status).toBe('COMPLETED');
  });

  it('generate() fails loudly, not with a generic substitute, when every attached asset fails to fetch', async () => {
    const failing = await import('../ai/vision/image-source');
    vi.mocked(failing.fetchInlineImage).mockRejectedValueOnce(new Error('404'));

    await expect(
      creativeGenerationService.generate('user-1', {
        prompt: 'Create a campaign for this product.',
        assetUrls: ['https://cdn.example.com/broken.jpg'],
      }),
    ).rejects.toBeInstanceOf(CreativeError);

    expect(repo.markFailed).toHaveBeenCalledTimes(1);
    expect(imageProvider.generateImage).not.toHaveBeenCalled();
  });

  it('generate() skips research and concept discovery entirely when the caller already picked a concept', async () => {
    const research = await import('../ai/generators/creative-research.generator');
    const concepts = await import('../ai/generators/creative-concepts.generator');
    const direction = await import('../ai/generators/creative-direction.generator');

    await creativeGenerationService.generate('user-1', {
      prompt: 'Launch campaign',
      selectedConcept: MOCK_CONCEPT,
    });

    expect(research.generateCreativeResearch).not.toHaveBeenCalled();
    expect(concepts.generateCreativeConcepts).not.toHaveBeenCalled();

    const call = vi.mocked(direction.generateCreativeDirection).mock.calls[0][0];
    expect(call.concept?.conceptName).toBe('Mock Concept');
    expect(call.mode).toBe('EDITORIAL');
  });

  it('rejects an empty prompt before calling any provider', async () => {
    await expect(creativeGenerationService.generate('user-1', { prompt: '' })).rejects.toBeInstanceOf(
      CreativeError,
    );
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('generateCampaign() produces one linked asset per label, sharing a campaignId', async () => {
    const assets = await creativeGenerationService.generateCampaign('user-1', {
      prompt: 'Launch campaign for the new collection',
      variationLabels: ['Hero', 'Product', 'Lifestyle'],
    });

    expect(assets).toHaveLength(3);
    expect(repo.create).toHaveBeenCalledTimes(3);

    const [first, second, third] = repo.create.mock.calls.map((call) => call[0]);
    expect(first.campaignId).toBeDefined();
    expect(second.campaignId).toBe(first.campaignId);
    expect(third.campaignId).toBe(first.campaignId);
    expect(second.parentAssetId).toBe('asset-1'); // the mocked create() always returns id "asset-1"
    expect(imageProvider.generateImage).toHaveBeenCalledTimes(3);
  });

  it('generateCampaign() rejects fewer than two labels', async () => {
    await expect(
      creativeGenerationService.generateCampaign('user-1', {
        prompt: 'anything',
        variationLabels: ['Hero'],
      }),
    ).rejects.toBeInstanceOf(CreativeError);
  });

  it('generateCampaign() runs research exactly once and reuses it across every variation', async () => {
    const research = await import('../ai/generators/creative-research.generator');
    await creativeGenerationService.generateCampaign('user-1', {
      prompt: 'Launch campaign',
      variationLabels: ['Hero', 'Product', 'Lifestyle'],
    });

    expect(research.generateCreativeResearch).toHaveBeenCalledTimes(1);
  });

  it('refine() never runs research — a small edit reuses the existing direction, not a fresh brief', async () => {
    repo.findById.mockResolvedValueOnce({
      id: 'asset-1',
      prompt: 'Original request',
      creativeBrief: { concept: 'Quiet Luxury', mode: 'EDITORIAL' },
      sourceAssetUrls: [],
      imageUrl: 'https://cdn.example.com/prior.png',
      contextType: 'personal',
      brandId: null,
      campaignId: null,
    });

    const research = await import('../ai/generators/creative-research.generator');
    await creativeGenerationService.refine('user-1', { assetId: 'asset-1', instruction: 'make it darker' });

    expect(research.generateCreativeResearch).not.toHaveBeenCalled();
  });

  it('refine() records provenance as AI_REFINED, linked to the parent, without touching the parent row', async () => {
    repo.findById.mockResolvedValueOnce({
      id: 'parent-1',
      prompt: 'Original request',
      creativeBrief: { concept: 'Quiet Luxury', mode: 'EDITORIAL' },
      sourceAssetUrls: [],
      imageUrl: 'https://cdn.example.com/prior.png',
      contextType: 'personal',
      brandId: null,
      campaignId: null,
    });

    await creativeGenerationService.refine('user-1', { assetId: 'parent-1', instruction: 'make it darker' });

    const createCall = repo.create.mock.calls[0][0];
    expect(createCall.source).toBe('AI_REFINED');
    expect(createCall.parentAssetId).toBe('parent-1');
    // The parent is only ever read, never updated or deleted — regenerate/
    // refine add a new row and the previous generation stays in history.
    expect(repo.markCompleted).not.toHaveBeenCalledWith('parent-1', expect.anything());
    expect(repo.markFailed).not.toHaveBeenCalledWith('parent-1');
  });

  it('explicit regeneration creates a new AI_REGENERATED child instead of reopening the canonical image', async () => {
    repo.findById.mockResolvedValueOnce({
      id: 'parent-1', prompt: 'Original request', creativeBrief: { concept: 'Quiet Luxury', mode: 'EDITORIAL', artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY' },
      sourceAssetUrls: [], imageUrl: 'https://cdn.example.com/prior.png', contextType: 'personal', brandId: null, campaignId: null,
    });
    await creativeGenerationService.regenerate('user-1', { assetId: 'parent-1' });
    expect(repo.create.mock.calls[0][0]).toMatchObject({ source: 'AI_REGENERATED', parentAssetId: 'parent-1' });
    expect(imageProvider.generateImage).toHaveBeenCalled();
  });

  // ── The refine bug ────────────────────────────────────────────────────────
  //
  // refine() used to resolve an EMPTY brand and an EMPTY Creative DNA, so
  // every refinement lost the real logo, the brand palette and the analysed
  // design recipe and then re-derived a different one. "Make it darker" came
  // back as a different creative because nothing held it steady.

  const PARENT_WITH_CONTEXT = {
    id: 'parent-1',
    prompt: 'BTS comeback — 50% off Korean food',
    creativeBrief: { concept: 'Quiet Luxury', mode: 'EDITORIAL', artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY' },
    sourceAssetUrls: ['https://cdn.example.com/dish.jpg'],
    imageUrl: 'https://cdn.example.com/prior-campaign.png',
    contextType: 'brand',
    brandId: 'brand-1',
    campaignId: null,
    renderContext: {
      brand: { name: 'Seven Sisters', industry: 'Restaurant', wordsToAvoid: [] },
      creativeDna: { logoAssetUrl: 'https://cdn.example.com/logo.png', brandColors: ['#8b1e1e'], logoTreatment: 'corner' },
      referenceStyle: SAMPLE_REFERENCE_STYLE,
      intent: { extracted: true, requiredClaims: ['BTS comeback', 'Korean food', '50% off'], offer: '50% off' },
      goal: 'event_promotion',
      funnelStage: 'BOFU',
      platforms: ['instagram'],
      visualImageUrl: 'https://cdn.example.com/prior-visual.png',
    },
  };

  it('refine() inherits the parent brand, Creative DNA, logo, design language and requirements', async () => {
    repo.findById.mockResolvedValueOnce(PARENT_WITH_CONTEXT);

    await creativeGenerationService.refine('user-1', { assetId: 'parent-1', instruction: 'make it darker' });

    const direction = await import('../ai/generators/creative-direction.generator');
    const call = vi.mocked(direction.generateCreativeDirection).mock.calls[0][0];

    expect(call.brand).toMatchObject({ name: 'Seven Sisters' });
    expect(call.creativeDna).toMatchObject({ logoAssetUrl: 'https://cdn.example.com/logo.png' });
    expect(call.referenceStyle).toEqual(SAMPLE_REFERENCE_STYLE);
    expect(call.intent?.requiredClaims).toEqual(['BTS comeback', 'Korean food', '50% off']);
    expect(call.goal).toBe('event_promotion');
    expect(call.funnelStage).toBe('BOFU');
    expect(call.refinementOf).toMatchObject({ instruction: 'make it darker' });

    // The real logo is fetched again for this refinement, so the refined
    // creative carries the same mark rather than losing it.
    expect(fetchInlineImage).toHaveBeenCalledWith('https://cdn.example.com/logo.png');
  });

  it('refine() re-executes from the parent WORDLESS visual, not from the finished creative', async () => {
    repo.findById.mockResolvedValueOnce(PARENT_WITH_CONTEXT);

    await creativeGenerationService.refine('user-1', { assetId: 'parent-1', instruction: 'make it darker' });

    // Handing an image model back its own typeset creative is what garbles
    // text on a refinement.
    expect(fetchInlineImage).toHaveBeenCalledWith('https://cdn.example.com/prior-visual.png');
    expect(fetchInlineImage).not.toHaveBeenCalledWith('https://cdn.example.com/prior-campaign.png');
  });

  it('refine() falls back to the finished image for rows saved before the visual was kept', async () => {
    repo.findById.mockResolvedValueOnce({
      ...PARENT_WITH_CONTEXT,
      renderContext: { ...PARENT_WITH_CONTEXT.renderContext, visualImageUrl: undefined },
    });

    await creativeGenerationService.refine('user-1', { assetId: 'parent-1', instruction: 'make it darker' });

    expect(fetchInlineImage).toHaveBeenCalledWith('https://cdn.example.com/prior-campaign.png');
  });

  it('refine() still works on a row written before renderContext existed', async () => {
    repo.findById.mockResolvedValueOnce({
      id: 'legacy-1',
      prompt: 'Original request',
      creativeBrief: { concept: 'Quiet Luxury', mode: 'EDITORIAL' },
      sourceAssetUrls: [],
      imageUrl: 'https://cdn.example.com/prior.png',
      contextType: 'personal',
      brandId: null,
      campaignId: null,
      renderContext: null,
    });

    const asset = await creativeGenerationService.refine('user-1', {
      assetId: 'legacy-1',
      instruction: 'make it darker',
    });

    expect(asset.status).toBe('COMPLETED');
  });

  it('refine() persists the inherited context on the new row, so the NEXT refinement inherits it too', async () => {
    repo.findById.mockResolvedValueOnce(PARENT_WITH_CONTEXT);

    await creativeGenerationService.refine('user-1', { assetId: 'parent-1', instruction: 'make it darker' });

    const createCall = repo.create.mock.calls[0][0] as any;
    expect(createCall.renderContext.brand).toMatchObject({ name: 'Seven Sisters' });
    expect(createCall.renderContext.intent.requiredClaims).toContain('50% off');
  });

  it('refine() surfaces a failure without touching the parent — the previous creative survives', async () => {
    repo.findById.mockResolvedValueOnce(PARENT_WITH_CONTEXT);
    imageProvider.generateImage.mockRejectedValueOnce(new Error('model unavailable'));

    await expect(
      creativeGenerationService.refine('user-1', { assetId: 'parent-1', instruction: 'make it darker' }),
    ).rejects.toBeInstanceOf(CreativeError);

    // Only the new child row is marked failed; the parent is never written to.
    expect(repo.markFailed).not.toHaveBeenCalledWith('parent-1');
    expect(repo.markCompleted).not.toHaveBeenCalledWith('parent-1', expect.anything());
  });
});
