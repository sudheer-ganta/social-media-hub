import { prisma } from '../config/prisma';
import type { StyleProfile } from '../ai/style/types';

/**
 * The only module that reads or writes `style_profiles`.
 *
 * The table is backend-only — RLS enabled with no policies, so PostgREST cannot
 * see it at all — for the reason in the migration: nothing in the UI shows a
 * style profile, and a member's inferred writing style is not something another
 * member should be able to query.
 */

export interface StyleProfileScope {
  userId: string;
  contextType: string;
  brandId?: string | null;
}

export interface StoredStyleProfile {
  profile: StyleProfile;
  sampleCount: number;
  sourcePostIds: string[];
  builtAt: Date;
}

/**
 * The stored profile for one scope, or null.
 *
 * Null is a normal answer, not an error: it is what a member gets before they
 * have posted enough to have a style, and the caller renders the cold-start
 * block rather than treating it as a failure.
 */
export async function find(scope: StyleProfileScope): Promise<StoredStyleProfile | null> {
  const row = await prisma.styleProfile.findFirst({
    where: {
      userId: scope.userId,
      contextType: scope.contextType,
      brandId: scope.contextType === 'brand' ? (scope.brandId ?? null) : null,
    },
  });

  if (!row) return null;

  return {
    profile: row.profile as unknown as StyleProfile,
    sampleCount: row.sampleCount,
    sourcePostIds: row.sourcePostIds,
    builtAt: row.builtAt,
  };
}

/**
 * Writes the profile for one scope, replacing whatever was there.
 *
 * An upsert against the COALESCE-based unique index rather than a
 * read-then-write: two generations for the same member can finish at once, and
 * the loser of that race should overwrite rather than fail. Prisma cannot
 * express the COALESCE index as a compound `where`, so this is an updateMany
 * followed by a create when nothing matched — the same shape
 * `social-account.repository` uses against its own COALESCE index.
 */
export async function save(
  scope: StyleProfileScope,
  data: { profile: StyleProfile; sampleCount: number; sourcePostIds: string[] },
): Promise<void> {
  const brandId = scope.contextType === 'brand' ? (scope.brandId ?? null) : null;

  const { count } = await prisma.styleProfile.updateMany({
    where: { userId: scope.userId, contextType: scope.contextType, brandId },
    data: {
      profile: data.profile as unknown as object,
      sampleCount: data.sampleCount,
      sourcePostIds: data.sourcePostIds,
      builtAt: new Date(),
    },
  });

  if (count > 0) return;

  try {
    await prisma.styleProfile.create({
      data: {
        userId: scope.userId,
        contextType: scope.contextType,
        brandId,
        profile: data.profile as unknown as object,
        sampleCount: data.sampleCount,
        sourcePostIds: data.sourcePostIds,
      },
    });
  } catch (error) {
    // The other side of the race got there between the updateMany and the
    // create. Their profile is as good as ours — both were built from the same
    // history seconds apart — so losing is not a failure worth reporting.
    console.warn('[ai] style profile already written by a concurrent build', {
      userId: scope.userId,
      contextType: scope.contextType,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
