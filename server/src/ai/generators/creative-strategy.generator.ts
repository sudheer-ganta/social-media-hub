import {
  buildCreativeStrategyPrompt,
  type PreviousStrategySummary,
} from '../prompts/creative-strategy.prompt';
import type { AiTextProvider } from '../providers';
import type {
  BrandProfile,
  CreativeConcept,
  CreativeIntentBrief,
  CreativeResearch,
  CreativeStrategy,
  CreativeStrategyOutcome,
  DomainContext,
  FunnelStage,
  MarketingGoal,
  RawCreativeStrategyPayload,
  RecentCreativeSignature,
  ReferenceStyleProfile,
  ResolvedCreativeDna,
} from '../types';

/**
 * Stage: CREATIVE STRATEGY — runs before the art director, and therefore
 * before any composition exists.
 *
 * There are no defaults in this file that describe a picture. When the model
 * omits a field, the field is absent; nothing here invents a mechanism, a
 * metaphor or a piece of imagery on its own, because a default idea applied
 * across every request IS the template this stage was added to remove. The
 * only fallback is a literal restatement of the member's request, which is
 * honest about knowing nothing rather than quietly supplying a house style.
 */

export interface GenerateCreativeStrategyOptions {
  provider: AiTextProvider;
  request: string;
  goal: MarketingGoal;
  funnelStage: FunnelStage;
  platforms: string[];
  hasAssets: boolean;
  brand: BrandProfile;
  creativeDna: ResolvedCreativeDna;
  /** The chosen advertising idea this strategy sharpens, when one was picked. */
  concept?: CreativeConcept;
  intent?: CreativeIntentBrief;
  research?: CreativeResearch;
  recentSignatures?: RecentCreativeSignature[];
  referenceStyle?: ReferenceStyleProfile;
  /** Set on the redesign pass — the rejected strategy this one must diverge from. */
  previousStrategy?: PreviousStrategySummary;
}

function asString(value: unknown, max = 400): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function asStringArray(value: unknown, maxItems = 8, max = 160): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(value.map((item) => asString(item, max)).filter((item) => item.length > 0)),
  ].slice(0, maxItems);
}

function readDomainContext(raw: RawCreativeStrategyPayload['domainContext']): DomainContext | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const context: DomainContext = {
    occasion: asString(raw.occasion, 120),
    meaning: asString(raw.meaning, 400),
    relevantSymbols: asStringArray(raw.relevantSymbols, 8),
    emotionalAssociations: asStringArray(raw.emotionalAssociations, 6),
    sensitivities: asStringArray(raw.sensitivities, 6),
    visualClichesToAvoid: asStringArray(raw.visualClichesToAvoid, 8),
  };
  const carriesAnything =
    context.occasion ||
    context.meaning ||
    context.relevantSymbols.length ||
    context.emotionalAssociations.length ||
    context.sensitivities.length ||
    context.visualClichesToAvoid.length;
  return carriesAnything ? context : undefined;
}

/**
 * Every mechanism this stage is allowed to reject outright: the ones that name
 * a LAYOUT rather than a device. Kept deliberately tiny and structural — it
 * matches phrasing patterns ("text on the left", "image on the right"), never
 * subject matter, so no event, brand or culture can ever be special-cased here.
 */
const LAYOUT_NOT_MECHANISM =
  /\b(?:left|right|top|bottom|corner|column|quadrant|footer|header)\b.{0,30}\b(?:text|type|copy|headline|image|photo|photograph|logo)\b|\b(?:text|type|copy|headline|image|photo|photograph|logo)\b.{0,30}\b(?:on the (?:left|right|top|bottom)|in the corner|column|quadrant|footer|header)\b/i;

/** True when the "mechanism" the model returned is really a layout description. */
export function describesLayoutNotMechanism(mechanism: string): boolean {
  return LAYOUT_NOT_MECHANISM.test(mechanism);
}

export function normaliseCreativeStrategy(
  raw: RawCreativeStrategyPayload,
  fallback: { request: string; conceptMechanism?: string },
): CreativeStrategy {
  const mechanism = asString(raw.creativeMechanism, 240);

  return {
    communicationIdea: asString(raw.communicationIdea, 400) || fallback.request,
    // A layout masquerading as a mechanism is discarded rather than repaired:
    // the chosen concept's own mechanism is the honest stand-in, and when
    // there is none the field stays empty so downstream stages can see that
    // no mechanism was decided instead of executing a fabricated one.
    creativeMechanism:
      mechanism && !describesLayoutNotMechanism(mechanism) ? mechanism : (fallback.conceptMechanism ?? ''),
    emotionalDirection: asString(raw.emotionalDirection, 240),
    ...(asString(raw.visualMetaphor, 240) && { visualMetaphor: asString(raw.visualMetaphor, 240) }),
    ...(asString(raw.narrativeDevice, 240) && { narrativeDevice: asString(raw.narrativeDevice, 240) }),
    ...(asString(raw.audienceTension, 300) && { audienceTension: asString(raw.audienceTension, 300) }),
    brandConnection: asString(raw.brandConnection, 400),
    visualOpportunity: asString(raw.visualOpportunity, 400),
    prohibitedVisualCliches: asStringArray(raw.prohibitedVisualCliches, 8),
    ...(asString(raw.distinctiveness, 300) && { distinctiveness: asString(raw.distinctiveness, 300) }),
    ...(readDomainContext(raw.domainContext) && { domainContext: readDomainContext(raw.domainContext)! }),
  };
}

/**
 * Merges the domain's own forbidden moves into the strategy's prohibition
 * list, so the art director reads one list rather than two. The domain can
 * only ever SUBTRACT visual options this way — it has no channel through which
 * to require an image, a colour or a symbol.
 */
export function prohibitionsFor(strategy: CreativeStrategy): string[] {
  return [
    ...new Set([...strategy.prohibitedVisualCliches, ...(strategy.domainContext?.visualClichesToAvoid ?? [])]),
  ];
}

export async function generateCreativeStrategy(
  options: GenerateCreativeStrategyOptions,
): Promise<CreativeStrategyOutcome> {
  const { provider } = options;
  const startedAt = Date.now();

  const built = buildCreativeStrategyPrompt(options);

  const raw = (await provider.generateJson({
    systemInstruction: built.systemInstruction,
    prompt: built.prompt,
    responseSchema: built.responseSchema,
    temperature: built.temperature,
  })) as RawCreativeStrategyPayload;

  const strategy = normaliseCreativeStrategy((raw && typeof raw === 'object') ? raw : {}, {
    request: options.request,
    conceptMechanism: options.concept?.visualMechanism,
  });

  console.info('[creative] creative strategy resolved', {
    creativeMechanism: strategy.creativeMechanism,
    communicationIdea: strategy.communicationIdea.slice(0, 120),
    hasMetaphor: Boolean(strategy.visualMetaphor),
    occasion: strategy.domainContext?.occasion || null,
    prohibitedCount: prohibitionsFor(strategy).length,
    durationMs: Date.now() - startedAt,
  });

  return {
    strategy,
    meta: { provider: provider.id, model: provider.model, durationMs: Date.now() - startedAt },
  };
}
