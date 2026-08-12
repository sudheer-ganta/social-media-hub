/**
 * A publish failure with a message written for a member.
 *
 * Its own module rather than a member of `publish.service.ts` because the
 * modules that raise it — the content-type resolver, the media rules — are
 * imported *by* the publish service. Leaving the class there would make the
 * import cycle, and the cycle would be resolved at runtime by whichever module
 * happened to load first.
 *
 * `publish.service.ts` re-exports it, so every existing importer is unchanged.
 */
export class PublishError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    /** Set when the post should be left as-is rather than marked FAILED. */
    readonly leavesPostUnchanged = false,
  ) {
    super(message);
    this.name = 'PublishError';
  }
}
