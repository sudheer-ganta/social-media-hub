import { firstQueryValue } from '../providers/oauth-state';
import { brandRepository } from '../repositories/brand.repository';

/**
 * The Personal-vs-Brand publishing context.
 *
 * Every social connection and every post belongs to exactly one context, and
 * the two must never mix: account lists are filtered by context here on the
 * backend (not just hidden in the UI), and the publisher resolves accounts
 * from the post's stored context. This module is the one definition of what a
 * context is and how one arrives in a request.
 */

export type ContextType = 'personal' | 'brand';

export interface AccountContext {
  contextType: ContextType;
  /** Set exactly when contextType is 'brand'. */
  brandId: string | null;
}

export const PERSONAL_CONTEXT: AccountContext = {
  contextType: 'personal',
  brandId: null,
};

/** A context failure a route should turn into a specific HTTP answer. */
export class ContextError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'ContextError';
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reads `?context=personal|brand&brandId=…` off a query string.
 *
 * Absent params mean Personal, which is what keeps every pre-context client
 * (and every pre-context bookmark) working unchanged. A brand context without
 * a plausible brand id is refused rather than defaulted — silently treating a
 * malformed brand request as Personal is exactly the cross-context leak this
 * feature exists to prevent.
 */
export function readContext(query: Record<string, unknown>): AccountContext {
  const raw = firstQueryValue(query.context) ?? 'personal';

  if (raw === 'personal') return PERSONAL_CONTEXT;

  if (raw === 'brand') {
    const brandId = firstQueryValue(query.brandId);
    if (!brandId || !UUID_PATTERN.test(brandId)) {
      throw new ContextError('A brand context needs a valid brandId.');
    }
    return { contextType: 'brand', brandId };
  }

  throw new ContextError(`Unknown context: ${raw}`);
}

/**
 * Proves a brand context is the caller's to use. No-op for Personal.
 *
 * Called wherever a context enters the system from a request — connecting an
 * account, listing integrations — so nothing downstream ever holds a brand id
 * the user does not own.
 */
export async function assertContextOwned(
  userId: string,
  context: AccountContext,
): Promise<void> {
  if (context.contextType !== 'brand' || !context.brandId) return;

  const brand = await brandRepository.findOwnedBrand(context.brandId, userId);
  if (!brand) {
    throw new ContextError('That brand could not be found.', 404);
  }
}
