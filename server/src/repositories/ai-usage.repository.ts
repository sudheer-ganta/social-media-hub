import { prisma } from '../config/prisma';

export async function recordAiUsage(input: {
  ownerId: string; action: string; provider: string; model: string; contextType?: string;
  brandId?: string; requestId?: string; inputTokens?: number; outputTokens?: number;
  imageCalls?: number; retryCount?: number; cacheHit?: boolean; success: boolean;
  durationMs: number; errorCode?: string;
}) {
  if (!(prisma as any).aiUsageEvent?.create) return null;
  try { return await prisma.aiUsageEvent.create({ data: input }); }
  catch (error) { console.warn('[ai-usage] telemetry write failed', error); return null; }
}

export const aiUsageRepository = { recordAiUsage };
