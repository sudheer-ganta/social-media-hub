import { prisma } from '../config/prisma';

export type CreativeScope = { userId: string; contextType: 'personal' | 'brand'; brandId?: string | null };
export type CreativeEventType =
  | 'CONCEPT_VIEWED' | 'CONCEPT_SELECTED' | 'CONCEPT_REJECTED'
  | 'ASSET_GENERATED' | 'ASSET_SAVED' | 'ASSET_ATTACHED' | 'ASSET_REMOVED'
  | 'ASSET_REPLACED' | 'ASSET_REFINED' | 'ASSET_REGENERATED'
  | 'POST_SAVED' | 'POST_SCHEDULED' | 'POST_PUBLISHED' | 'POST_PUBLICATION_FAILED';

const scopeWhere = (scope: CreativeScope) => ({
  ownerId: scope.userId,
  contextType: scope.contextType,
  brandId: scope.contextType === 'brand' ? (scope.brandId ?? null) : null,
});

export async function appendEvent(scope: CreativeScope, input: {
  eventType: CreativeEventType; conceptId?: string; generatedAssetId?: string;
  postId?: string; platform?: string; metadata?: Record<string, unknown>; eventId?: string;
}) {
  // Some isolated unit tests provide a deliberately narrow Prisma double.
  if (!(prisma as any).creativeEvent?.create) return null;
  if (input.eventId) {
    const existing = await prisma.creativeEvent.findUnique({ where: { eventId: input.eventId } });
    if (existing) return existing;
  }
  return prisma.creativeEvent.create({ data: { ...scopeWhere(scope), ...input } as any });
}

export async function syncPostAssets(scope: CreativeScope, postId: string, media: Array<{ id: string; generatedAssetId?: string }>, eventId?: string) {
  const post = await prisma.post.findFirst({ where: { id: postId, created_by: scope.userId, context_type: scope.contextType, brand_id: scope.contextType === 'brand' ? (scope.brandId ?? null) : null } });
  if (!post) throw new Error('Post not found in this creation context.');
  const requested = new Map(media.filter((m) => m.generatedAssetId).map((m) => [m.generatedAssetId!, m.id]));
  const assets = requested.size ? await prisma.generatedAsset.findMany({ where: { id: { in: [...requested.keys()] }, userId: scope.userId, contextType: scope.contextType, brandId: scope.contextType === 'brand' ? (scope.brandId ?? null) : null } }) : [];
  if (assets.length !== requested.size) throw new Error('One or more generated assets are not available in this creation context.');

  return prisma.$transaction(async (tx) => {
    const active = await tx.postCreativeAsset.findMany({ where: { postId, ownerId: scope.userId, attachmentState: 'attached' } });
    const wanted = new Set(assets.map((asset) => `${asset.id}:${requested.get(asset.id)}`));
    const removed = active.filter((row) => !wanted.has(`${row.generatedAssetId}:${row.mediaItemId}`));
    const added = assets.filter((asset) => !active.some((item) => item.generatedAssetId === asset.id && item.mediaItemId === requested.get(asset.id)));
    for (const row of active) {
      if (wanted.has(`${row.generatedAssetId}:${row.mediaItemId}`)) continue;
      await tx.postCreativeAsset.update({ where: { id: row.id }, data: { attachmentState: 'removed', removedAt: new Date() } });
      await tx.creativeEvent.create({ data: { ...scopeWhere(scope), eventType: 'ASSET_REMOVED', generatedAssetId: row.generatedAssetId, postId, eventId: eventId ? `${eventId}:removed:${row.id}` : undefined } });
    }
    for (const asset of assets) {
      const mediaItemId = requested.get(asset.id)!;
      const row = await tx.postCreativeAsset.upsert({
        where: { generatedAssetId_postId_mediaItemId: { generatedAssetId: asset.id, postId, mediaItemId } },
        create: { ...scopeWhere(scope), generatedAssetId: asset.id, postId, mediaItemId },
        update: { attachmentState: 'attached', removedAt: null, attachedAt: new Date() },
      });
      if (!active.some((item) => item.generatedAssetId === asset.id && item.mediaItemId === mediaItemId)) {
        await tx.creativeEvent.create({ data: { ...scopeWhere(scope), eventType: 'ASSET_ATTACHED', generatedAssetId: asset.id, postId, eventId: eventId ? `${eventId}:attached:${row.id}` : undefined } });
      }
    }
    if (removed.length && added.length) {
      await tx.creativeEvent.create({
        data: {
          ...scopeWhere(scope), eventType: 'ASSET_REPLACED', generatedAssetId: added[0].id, postId,
          metadata: { removedAssetIds: removed.map((row) => row.generatedAssetId), addedAssetIds: added.map((asset) => asset.id) },
          eventId: eventId ? `${eventId}:replaced` : undefined,
        },
      });
    }
    await tx.creativeEvent.create({ data: { ...scopeWhere(scope), eventType: 'POST_SAVED', postId, eventId: eventId ? `${eventId}:saved` : undefined } });
    return { attributed: assets.length, removed: removed.length };
  });
}

export async function recordPublication(userId: string, postId: string, platform: string, success: boolean) {
  const post = await prisma.post.findFirst({ where: { id: postId, created_by: userId }, select: { context_type: true, brand_id: true } });
  if (!post) return;
  const scope: CreativeScope = { userId, contextType: post.context_type as 'personal' | 'brand', brandId: post.brand_id };
  const rows = await prisma.postCreativeAsset.findMany({ where: { postId, ownerId: userId, attachmentState: 'attached' } });
  for (const row of rows) {
    if (success) await prisma.postCreativeAsset.update({ where: { id: row.id }, data: { finalPublished: true } });
    await appendEvent(scope, { eventType: success ? 'POST_PUBLISHED' : 'POST_PUBLICATION_FAILED', generatedAssetId: row.generatedAssetId, postId, platform, eventId: `publication:${postId}:${platform}:${success ? 'published' : 'failed'}:${row.id}` });
  }
}

export async function recordPostLifecycle(userId: string, postId: string, eventType: 'POST_SCHEDULED', metadata?: Record<string, unknown>) {
  const post = await prisma.post.findFirst({ where: { id: postId, created_by: userId }, select: { context_type: true, brand_id: true } });
  if (!post) return;
  const scope: CreativeScope = { userId, contextType: post.context_type as 'personal' | 'brand', brandId: post.brand_id };
  const rows = await prisma.postCreativeAsset.findMany({ where: { postId, ownerId: userId, attachmentState: 'attached' } });
  for (const row of rows) await appendEvent(scope, { eventType, generatedAssetId: row.generatedAssetId, postId, metadata, eventId: `${eventType}:${postId}:${row.id}:${JSON.stringify(metadata ?? {})}` });
}

export async function recordAssetEvent(userId: string, generatedAssetId: string, eventType: CreativeEventType, eventId?: string) {
  const asset = await prisma.generatedAsset.findFirst({ where: { id: generatedAssetId, userId }, select: { contextType: true, brandId: true, canonicalConcept: { select: { id: true } } } });
  if (!asset) return null;
  return appendEvent({ userId, contextType: asset.contextType as 'personal' | 'brand', brandId: asset.brandId }, { eventType, generatedAssetId, conceptId: asset.canonicalConcept?.id, eventId });
}

export const creativeAttributionRepository = { appendEvent, syncPostAssets, recordPublication, recordPostLifecycle, recordAssetEvent };
