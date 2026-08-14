import { prisma } from '../config/prisma';
import type { CreativeDirection } from '../ai/types';

/**
 * The only module that reads or writes `generated_assets`.
 *
 * Backend-only, same reasoning as `style-profile.repository.ts`: RLS enabled
 * with no policies, so PostgREST cannot see it — the frontend only ever sees
 * a row through `creative.routes.ts`, which is the one place that also holds
 * the Gemini/Cloudinary keys that produced it.
 */

export interface GeneratedAssetScope {
  userId: string;
  contextType: string;
  brandId?: string | null;
}

export type GeneratedAssetSource = 'AI_GENERATED' | 'AI_REFINED';

export interface CreateGeneratedAssetInput {
  userId: string;
  contextType: string;
  brandId?: string | null;
  prompt: string;
  creativeBrief: CreativeDirection;
  sourceAssetUrls: string[];
  provider: string;
  model: string;
  /** AI_GENERATED for a fresh generation or campaign variation; AI_REFINED only from `refine()`. */
  source: GeneratedAssetSource;
  campaignId?: string | null;
  parentAssetId?: string | null;
}

export interface StoredGeneratedAsset {
  id: string;
  userId: string;
  contextType: string;
  brandId: string | null;
  prompt: string;
  creativeBrief: CreativeDirection;
  sourceAssetUrls: string[];
  imageUrl: string | null;
  cloudinaryPublicId: string | null;
  /** Cloudinary's own measurement of the completed upload — null until COMPLETED. */
  width: number | null;
  height: number | null;
  format: string | null;
  provider: string;
  model: string;
  source: GeneratedAssetSource;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  campaignId: string | null;
  parentAssetId: string | null;
  createdAt: Date;
}

function mapRow(row: Record<string, unknown>): StoredGeneratedAsset {
  return {
    id: row.id as string,
    userId: row.userId as string,
    contextType: row.contextType as string,
    brandId: row.brandId as string | null,
    prompt: row.prompt as string,
    creativeBrief: row.creativeBrief as CreativeDirection,
    sourceAssetUrls: row.sourceAssetUrls as string[],
    imageUrl: row.imageUrl as string | null,
    cloudinaryPublicId: row.cloudinaryPublicId as string | null,
    width: (row.width as number | null) ?? null,
    height: (row.height as number | null) ?? null,
    format: (row.format as string | null) ?? null,
    provider: row.provider as string,
    model: row.model as string,
    source: row.source as GeneratedAssetSource,
    status: row.status as StoredGeneratedAsset['status'],
    campaignId: row.campaignId as string | null,
    parentAssetId: row.parentAssetId as string | null,
    createdAt: row.createdAt as Date,
  };
}

/** Inserts a PENDING row before the model call, so a crash mid-generation still leaves a record. */
export async function create(input: CreateGeneratedAssetInput): Promise<StoredGeneratedAsset> {
  const row = await prisma.generatedAsset.create({
    data: {
      userId: input.userId,
      contextType: input.contextType,
      brandId: input.contextType === 'brand' ? (input.brandId ?? null) : null,
      prompt: input.prompt,
      creativeBrief: input.creativeBrief as unknown as object,
      sourceAssetUrls: input.sourceAssetUrls,
      provider: input.provider,
      model: input.model,
      source: input.source,
      status: 'PENDING',
      campaignId: input.campaignId ?? null,
      parentAssetId: input.parentAssetId ?? null,
    },
  });
  return mapRow(row);
}

export async function markCompleted(
  id: string,
  data: { imageUrl: string; cloudinaryPublicId: string; width?: number; height?: number; format?: string },
): Promise<StoredGeneratedAsset> {
  const row = await prisma.generatedAsset.update({
    where: { id },
    data: {
      status: 'COMPLETED',
      imageUrl: data.imageUrl,
      cloudinaryPublicId: data.cloudinaryPublicId,
      ...(data.width !== undefined && { width: data.width }),
      ...(data.height !== undefined && { height: data.height }),
      ...(data.format !== undefined && { format: data.format }),
    },
  });
  return mapRow(row);
}

export async function markFailed(id: string): Promise<void> {
  await prisma.generatedAsset.update({ where: { id }, data: { status: 'FAILED' } });
}

/** One asset, scoped to its owner — a foreign id simply matches nothing. */
export async function findById(id: string, userId: string): Promise<StoredGeneratedAsset | null> {
  const row = await prisma.generatedAsset.findFirst({ where: { id, userId } });
  return row ? mapRow(row) : null;
}

/** Generation history for one scope, newest first. */
export async function listByScope(
  scope: GeneratedAssetScope,
  limit = 50,
): Promise<StoredGeneratedAsset[]> {
  const rows = await prisma.generatedAsset.findMany({
    where: {
      userId: scope.userId,
      contextType: scope.contextType,
      brandId: scope.contextType === 'brand' ? (scope.brandId ?? null) : null,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.map(mapRow);
}

/** Every asset sharing one campaign, in generation order. */
export async function listByCampaign(campaignId: string, userId: string): Promise<StoredGeneratedAsset[]> {
  const rows = await prisma.generatedAsset.findMany({
    where: { campaignId, userId },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(mapRow);
}
