/**
 * An error whose message is written for the person using the app and is safe to
 * send to the browser as-is.
 *
 * Route handlers turn *only* these (and the other typed errors named in the
 * routers) into a response body. Anything else — a Prisma error quoting a table
 * and column, a provider response, a connection string — is logged and answered
 * with a generic message, because a bare `Error.message` is not something anyone
 * wrote for a user and can disclose internals to an attacker probing the API.
 */
export class UserFacingError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = 'UserFacingError';
  }
}
