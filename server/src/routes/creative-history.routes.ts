import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { prisma } from '../config/prisma';
import { creativeAttributionRepository, type CreativeScope } from '../repositories/creative-attribution.repository';
import { creativePerformanceService } from '../services/creative-performance.service';

const router = Router();
const scope = (userId: string, input: Record<string, unknown>): CreativeScope => {
  const contextType = input.contextType === 'brand' ? 'brand' : 'personal';
  const brandId = contextType === 'brand' && typeof input.brandId === 'string' ? input.brandId : null;
  if (contextType === 'brand' && !brandId) throw new Error('Choose a brand.');
  return { userId, contextType, brandId };
};
const where = (s: CreativeScope) => ({ userId: s.userId, contextType: s.contextType, brandId: s.contextType === 'brand' ? (s.brandId ?? null) : null });
const handle = (fn: any) => async (req: any, res: any) => { try { await fn(req, res); } catch (error) { console.error('[creative-history]', error); res.status(400).json({ error: error instanceof Error ? error.message : 'Request failed.' }); } };

router.post('/attribution/sync', requireAuth, handle(async (req: any, res: any) => {
  const body = (req.body ?? {}) as Record<string, any>;
  const s = scope(req.user.id, body);
  const media = Array.isArray(body.media) ? body.media.map((item: any) => ({ id: String(item.id ?? ''), ...(typeof item.generatedAssetId === 'string' && { generatedAssetId: item.generatedAssetId }) })) : [];
  res.json(await creativeAttributionRepository.syncPostAssets(s, String(body.postId ?? ''), media, typeof body.eventId === 'string' ? body.eventId : undefined));
}));

router.get('/history', requireAuth, handle(async (req: any, res: any) => {
  const s = scope(req.user.id, req.query);
  const assets = await prisma.generatedAsset.findMany({ where: where(s), orderBy: { createdAt: 'desc' }, take: 100, include: { canonicalConcept: true, postAttributions: { include: { post: { select: { id: true, title: true, status: true, published_at: true } } } } } });
  res.json({ assets });
}));

router.get('/assets/:assetId', requireAuth, handle(async (req: any, res: any) => {
  const asset = await prisma.generatedAsset.findFirst({ where: { id: String(req.params.assetId), userId: req.user.id }, include: { canonicalConcept: true, parentAsset: true, children: true, postAttributions: { include: { post: { include: { post_platforms: { include: { metricSnapshots: { take: 1, orderBy: { capturedAt: 'desc' } } } } } } } } } });
  if (!asset) return res.status(404).json({ error: 'Creative not found.' }); res.json(asset);
}));

router.get('/assets/:assetId/lineage', requireAuth, handle(async (req: any, res: any) => {
  const asset = await prisma.generatedAsset.findFirst({ where: { id: String(req.params.assetId), userId: req.user.id }, select: { id: true, parentAssetId: true } });
  if (!asset) return res.status(404).json({ error: 'Creative not found.' });
  let rootId = asset.id; let parentId = asset.parentAssetId;
  while (parentId) { const parent = await prisma.generatedAsset.findFirst({ where: { id: parentId, userId: req.user.id }, select: { id: true, parentAssetId: true } }); if (!parent) break; rootId = parent.id; parentId = parent.parentAssetId; }
  const nodes: any[] = []; const queue = [rootId];
  while (queue.length) { const id = queue.shift()!; const node = await prisma.generatedAsset.findFirst({ where: { id, userId: req.user.id }, include: { children: { select: { id: true } } } }); if (!node) continue; nodes.push(node); queue.push(...node.children.map((child) => child.id)); }
  res.json({ rootId, assets: nodes });
}));

router.get('/assets/:assetId/performance', requireAuth, handle(async (req: any, res: any) => {
  const asset = await prisma.generatedAsset.findFirst({ where: { id: String(req.params.assetId), userId: req.user.id } });
  if (!asset) return res.status(404).json({ error: 'Creative not found.' });
  const s: CreativeScope = { userId: req.user.id, contextType: asset.contextType as 'personal' | 'brand', brandId: asset.brandId };
  const evidence = (await creativePerformanceService.performanceEvidence(s)).filter((item) => {
    const text = JSON.stringify([asset.creativeBrief, asset.typography, asset.source]).toLowerCase(); return text.includes(item.value.toLowerCase());
  });
  const publications = await prisma.postCreativeAsset.findMany({ where: { generatedAssetId: asset.id, ownerId: req.user.id }, include: { post: { include: { post_platforms: { where: { status: 'PUBLISHED' }, include: { metricSnapshots: { take: 1, orderBy: { capturedAt: 'desc' } } } } } } } });
  res.json({ assetId: asset.id, evidence, publications });
}));

export default router;
