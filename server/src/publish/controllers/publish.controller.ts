import type { Request, Response } from 'express';
import { publishService, PublishError } from '../services/publish.service';

/**
 * HTTP for the publish API, and nothing else.
 *
 * These handlers read the request, call the service and serialize the answer.
 * Every decision — ownership, duplicate detection, what a member is told when
 * LinkedIn says no — lives in `publish.service.ts`. If a rule ever needs to
 * apply to a scheduled publish as well as a manual one, it is already in the
 * right place.
 */

/**
 * The network a post is published to.
 *
 * Sprint 4.2 publishes to LinkedIn only, but the route is provider-shaped from
 * the start: `?provider=` overrides, and the service rejects anything that
 * isn't in the catalogue or has no publisher. Adding Instagram is a provider
 * implementation, not a new route.
 */
const DEFAULT_PROVIDER = 'linkedin';

/** `POST /api/posts/:postId/publish` */
export async function publish(req: Request, res: Response): Promise<void> {
  const postId = String(req.params.postId ?? '');
  if (!postId) {
    throw new PublishError('A post id is required.', 400, true);
  }

  const provider = readProvider(req);
  const result = await publishService.publishPost(req.user.id, postId, provider, {
    // What the composer currently shows, which is newer than anything stored.
    // Absent — an older client, or a request that never named one — takes the
    // count-based resolution, which is what this endpoint has always done.
    ...(readContentType(req) && { contentType: readContentType(req) }),
  });

  res.json(result);
}

/**
 * The content type the member chose, if the request named one.
 *
 * Returns null for anything that is not a plain non-empty string. It is *not*
 * validated against the vocabulary here — the resolver does that, and it is the
 * one place that knows which formats this network publishes. Doing it twice
 * would mean two lists of six words.
 */
function readContentType(req: Request): string | null {
  const fromBody = (req.body as { contentType?: unknown } | undefined)
    ?.contentType;
  if (typeof fromBody === 'string' && fromBody.trim()) return fromBody.trim();
  return null;
}

/** `GET /api/posts/:postId/publish` — where this post stands on each network. */
export async function status(req: Request, res: Response): Promise<void> {
  const postId = String(req.params.postId ?? '');
  if (!postId) {
    throw new PublishError('A post id is required.', 400, true);
  }

  res.json(await publishService.getPublishState(req.user.id, postId));
}

/**
 * Reads the target network from the body or the query string.
 *
 * Anything that isn't a plain non-empty string falls back to the default
 * rather than being coerced — a repeated `?provider=a&provider=b` arrives as an
 * array, and passing that on would put an unvalidated shape into a repository
 * query. The service validates the value against the catalogue regardless.
 */
function readProvider(req: Request): string {
  const fromBody = (req.body as { provider?: unknown } | undefined)?.provider;
  if (typeof fromBody === 'string' && fromBody.trim()) return fromBody.trim();

  const fromQuery = req.query.provider;
  if (typeof fromQuery === 'string' && fromQuery.trim()) return fromQuery.trim();

  return DEFAULT_PROVIDER;
}

export const publishController = { publish, status };
