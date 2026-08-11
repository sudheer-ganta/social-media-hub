import { prisma } from '../config/prisma';
import { PostStatus } from '../generated/prisma/enums';
import type { HistoryEvent, HistoryPost } from '../ai/style/signals';

/**
 * Reading a member's own writing back out of the tables that already hold it.
 *
 * No new storage. The corpus is `posts` — what they published is in `caption`,
 * and what the model had offered them is in `ai_studio_output`, written on
 * every save since the studio envelope existed. The two explicit events live in
 * `activity_logs`, which has been append-only and backend-written from the
 * start.
 *
 * This file's whole job is turning those two shapes into the plain
 * {@link HistoryPost} and {@link HistoryEvent} that `ai/style/signals.ts`
 * weighs — which is what keeps the weighting logic testable without a database
 * and keeps `ai/` free of Prisma.
 */

/**
 * How far back to look.
 *
 * Two hundred posts is far more than the profile builder will use and cheap to
 * read. The recency decay in `signals.ts` is what actually decides how much an
 * old caption counts, so the limit is a bound on the query rather than a
 * judgement about relevance.
 */
const HISTORY_LIMIT = 200;
const EVENT_LIMIT = 200;

/** The statuses that mean this caption went out into the world. */
const PUBLISHED_STATUSES: PostStatus[] = [
  PostStatus.PUBLISHED,
  PostStatus.PARTIALLY_PUBLISHED,
];

/**
 * The captions the model offered for one post.
 *
 * Read defensively. `ai_studio_output` is a JSONB column that the browser
 * writes, has been through three schema versions, and is null on most rows —
 * anything unexpected in there yields an empty list rather than an exception,
 * because a malformed envelope on one old post must not be able to stop a
 * member's style profile from building.
 */
function offeredCaptions(output: unknown): string[] {
  if (!output || typeof output !== 'object') return [];

  const variations = (output as { contentVariations?: { variations?: unknown } })
    .contentVariations?.variations;
  if (!Array.isArray(variations)) return [];

  return variations
    .map((entry) =>
      entry && typeof entry === 'object' && typeof (entry as { caption?: unknown }).caption === 'string'
        ? ((entry as { caption: string }).caption).trim()
        : '',
    )
    .filter((caption) => caption.length > 0);
}

/** What Vision saw for one post, when it was stored alongside the generation. */
function visionOf(output: unknown): Pick<HistoryPost, 'subject' | 'themes' | 'setting'> {
  if (!output || typeof output !== 'object') return {};

  const analysis = (output as { imageAnalysis?: Record<string, unknown> }).imageAnalysis;
  if (!analysis || typeof analysis !== 'object') return {};

  const text = (value: unknown) => (typeof value === 'string' ? value : undefined);
  const list = (value: unknown) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : undefined;

  return {
    ...(text(analysis.primarySubject) && { subject: text(analysis.primarySubject) }),
    ...(text(analysis.setting) && { setting: text(analysis.setting) }),
    ...(list(analysis.themes) && { themes: list(analysis.themes) }),
  };
}

/**
 * One member's posts in one publishing context.
 *
 * Scoped by context because the two are different writers. A member's brand
 * posts are not evidence of how they write personally, and mixing them would
 * teach the personal profile to sound like a business.
 */
export async function findHistory(
  userId: string,
  contextType: string,
  brandId?: string | null,
): Promise<HistoryPost[]> {
  const rows = await prisma.post.findMany({
    where: {
      created_by: userId,
      context_type: contextType,
      ...(contextType === 'brand' && brandId ? { brand_id: brandId } : {}),
      // A post with no caption has nothing to say about how they write.
      caption: { not: '' },
    },
    orderBy: { updated_at: 'desc' },
    take: HISTORY_LIMIT,
    select: {
      id: true,
      title: true,
      caption: true,
      status: true,
      published_at: true,
      updated_at: true,
      ai_studio_output: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    caption: row.caption,
    // Either signal counts: a status of PUBLISHED, or a timestamp proving it
    // went out. A partially published post published this caption too.
    published:
      PUBLISHED_STATUSES.includes(row.status) || row.published_at !== null,
    updatedAt: row.updated_at,
    offered: offeredCaptions(row.ai_studio_output),
    ...visionOf(row.ai_studio_output),
  }));
}

/**
 * The two events the post row cannot reconstruct.
 *
 * A selection the member made and then abandoned without saving, and a
 * regenerate — which is the only way this system learns that a whole set of
 * suggestions missed.
 */
export async function findFeedbackEvents(
  userId: string,
  contextType: string,
  brandId?: string | null,
): Promise<HistoryEvent[]> {
  const rows = await prisma.activityLog.findMany({
    where: {
      userId,
      action: { in: ['caption.selected', 'caption.regenerated'] },
    },
    orderBy: { createdAt: 'desc' },
    take: EVENT_LIMIT,
  });

  return rows.flatMap((row) => {
    const details = (row.details ?? {}) as Record<string, unknown>;
    const text = typeof details.captionText === 'string' ? details.captionText : '';
    if (!text.trim()) return [];

    // Context is filtered here rather than in the query: `details` is JSONB and
    // an index-free containment filter over 200 rows is slower than reading
    // them. Rows written before this field existed are simply skipped.
    if (details.contextType !== contextType) return [];
    if (contextType === 'brand' && brandId && details.brandId !== brandId) return [];

    return [
      {
        postId: typeof details.postId === 'string' ? details.postId : null,
        action: row.action as HistoryEvent['action'],
        text,
        createdAt: row.createdAt,
      },
    ];
  });
}
