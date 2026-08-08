import { prisma } from '../config/prisma';

/**
 * The backend's window onto `brands`.
 *
 * The table is owned by the browser (created and edited via supabase-js under
 * per-user RLS); the backend only ever needs one question answered — "does
 * this brand belong to this user?" — when a connect or publish claims to act
 * for a brand. The backend connects as the database owner and bypasses RLS,
 * which is why ownership is part of the query and never assumed.
 */
export async function findOwnedBrand(
  brandId: string,
  userId: string,
): Promise<{ id: string; name: string } | null> {
  return prisma.brand.findFirst({
    where: { id: brandId, created_by: userId },
    select: { id: true, name: true },
  });
}

export const brandRepository = { findOwnedBrand };
