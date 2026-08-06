import { getSupabase } from "@/lib/supabase";
import { DEFAULT_BRAND_VOICE } from "@/ai/types";
import type {
  BrandVoiceProfile,
  BrandVoiceProfileInsert,
  BrandVoiceProfileUpdate,
} from "@/types";

const TABLE = "brand_voices";

/** Older rows may predate a field added to BrandVoice — fill the gaps. */
function mapRow(row: Record<string, unknown>): BrandVoiceProfile {
  const profile = row as unknown as BrandVoiceProfile;
  return { ...profile, voice: { ...DEFAULT_BRAND_VOICE, ...profile.voice } };
}

/**
 * Data-access layer for the `brand_voices` table. Pure Supabase queries —
 * RLS scopes every query to the signed-in user.
 */
export const brandVoicesRepository = {
  async listAll(): Promise<BrandVoiceProfile[]> {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapRow);
  },

  async insert(input: BrandVoiceProfileInsert): Promise<BrandVoiceProfile> {
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
    input: BrandVoiceProfileUpdate,
  ): Promise<BrandVoiceProfile> {
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
  async upsertByName(input: BrandVoiceProfileInsert): Promise<BrandVoiceProfile> {
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

  /**
   * Clear every default flag for the current user. The partial unique index
   * allows only one default per owner, so this has to run before setting a
   * new one.
   */
  async clearDefaults(): Promise<void> {
    const { error } = await getSupabase()
      .from(TABLE)
      .update({ is_default: false })
      .eq("is_default", true);
    if (error) throw new Error(error.message);
  },
};
