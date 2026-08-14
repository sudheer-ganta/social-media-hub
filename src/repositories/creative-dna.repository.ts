import { getSupabase } from "@/lib/supabase";
import { DEFAULT_CREATIVE_DNA } from "@/ai/types";
import type {
  CreativeDnaProfile,
  CreativeDnaProfileInsert,
  CreativeDnaProfileUpdate,
} from "@/types";

const TABLE = "creative_dna";

/** Older rows may predate a field added to CreativeDna — fill the gaps. */
function mapRow(row: Record<string, unknown>): CreativeDnaProfile {
  const profile = row as unknown as CreativeDnaProfile;
  return { ...profile, dna: { ...DEFAULT_CREATIVE_DNA, ...profile.dna } };
}

/**
 * Data-access layer for the `creative_dna` table. Pure Supabase queries —
 * RLS scopes every query to the signed-in user. Mirrors
 * `brand-voices.repository.ts` exactly; this is its visual sibling.
 */
export const creativeDnaRepository = {
  async listAll(): Promise<CreativeDnaProfile[]> {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapRow);
  },

  async insert(input: CreativeDnaProfileInsert): Promise<CreativeDnaProfile> {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .insert(input)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return mapRow(data);
  },

  async update(
    id: string,
    input: CreativeDnaProfileUpdate,
  ): Promise<CreativeDnaProfile> {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .update(input)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return mapRow(data);
  },

  /** Insert, or overwrite the existing profile with the same name. */
  async upsertByName(input: CreativeDnaProfileInsert): Promise<CreativeDnaProfile> {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .upsert(input, { onConflict: "created_by,name" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return mapRow(data);
  },

  async remove(id: string): Promise<void> {
    const { error } = await getSupabase().from(TABLE).delete().eq("id", id);
    if (error) throw new Error(error.message);
  },

  async clearDefaults(): Promise<void> {
    const { error } = await getSupabase()
      .from(TABLE)
      .update({ is_default: false })
      .eq("is_default", true);
    if (error) throw new Error(error.message);
  },
};
