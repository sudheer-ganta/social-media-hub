import { getSupabase } from "@/lib/supabase";
import type { Brand, BrandInsert } from "@/types";

const TABLE = "brands";

/**
 * Data-access layer for the `brands` table. Pure Supabase queries — RLS
 * scopes every query to the signed-in user. Deleting a brand CASCADEs to its
 * connected accounts and posts (DB-level), which is what the confirm dialog
 * warns about.
 */
export const brandsRepository = {
  async listAll(): Promise<Brand[]> {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as Brand[];
  },

  async insert(input: BrandInsert): Promise<Brand> {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .insert(input)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Brand;
  },

  async update(id: string, input: Partial<BrandInsert>): Promise<Brand> {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .update(input)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Brand;
  },

  async remove(id: string): Promise<void> {
    const { error } = await getSupabase().from(TABLE).delete().eq("id", id);
    if (error) throw new Error(error.message);
  },
};
