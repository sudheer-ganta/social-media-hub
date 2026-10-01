import type { Request, Response, NextFunction } from 'express';

/**
 * Operator-only routes (SMTP diagnostics and the like).
 *
 * "Logged in" is not "trusted": anyone can register. Admins are named in the
 * environment — `ADMIN_USER_IDS`, comma-delimited Supabase user ids — and
 * **an empty list means no admins**, so a deployment that forgot to set it fails
 * closed rather than open. Ids rather than emails because an id cannot be
 * claimed by registering an address first. Must run after `requireAuth`.
 */
function adminIds(): Set<string> {
  return new Set(
    (process.env.ADMIN_USER_IDS ?? '')
      .split(',')
      .map((id) => id.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdmin(user: { id?: unknown } | undefined): boolean {
  const id = typeof user?.id === 'string' ? user.id.trim().toLowerCase() : '';
  return Boolean(id) && adminIds().has(id);
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!isAdmin(req.user)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}
