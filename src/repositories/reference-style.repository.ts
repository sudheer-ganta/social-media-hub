import { getSupabase } from "@/lib/supabase";
import { DEFAULT_REFERENCE_STYLE_PROFILE } from "@/types/creative";
import type {
  SavedReferenceStyleProfile,
  SavedReferenceStyleProfileInsert,
  SavedReferenceStyleProfileUpdate,
} from "@/types/creative";

const TABLE = "reference_style_profiles";

/** Older rows may predate a field added to ReferenceStyleProfile — fill the gaps. */
function mapRow(row: Record<string, unknown>): SavedReferenceStyleProfile {
  const saved = row as unknown as SavedReferenceStyleProfile;
  return { ...saved, profile: { ...DEFAULT_REFERENCE_STYLE_PROFILE, ...saved.profile } };
}

/**
 * Data-access layer for the `reference_style_profiles` table — "Style
 * Memory" (spec §9). Pure Supabase queries, RLS scopes every query to the
 * signed-in user. Mirrors `creative-dna.repository.ts` exactly; this is its
 * reference-led sibling.
 */
export const referenceStyleRepository = {
  async listAll(): Promise<SavedReferenceStyleProfile[]> {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapRow);
  },

  async insert(input: SavedReferenceStyleProfileInsert): Promise<SavedReferenceStyleProfile> {
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
    input: SavedReferenceStyleProfileUpdate,
  ): Promise<SavedReferenceStyleProfile> {
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
  async upsertByName(input: SavedReferenceStyleProfileInsert): Promise<SavedReferenceStyleProfile> {
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
