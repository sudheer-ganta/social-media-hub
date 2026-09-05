import { getSupabase } from "@/lib/supabase";

export interface CreationProfile {
  user_id: string;
  default_context_type: "personal" | "brand";
  default_brand_id: string | null;
  personal_context: Record<string, unknown>;
  onboarding_complete: boolean;
}

export const creationProfileRepository = {
  async get(): Promise<CreationProfile | null> {
    const { data, error } = await getSupabase().from("creation_profiles").select("*").maybeSingle();
    if (error) throw new Error(error.message);
    return data as CreationProfile | null;
  },
  async complete(context: "personal" | "brand", brandId?: string): Promise<void> {
    const { data: auth } = await getSupabase().auth.getUser();
    if (!auth.user) throw new Error("You need to be signed in.");
    const { data, error } = await getSupabase().from("creation_profiles").update({
      default_context_type: context,
      default_brand_id: context === "brand" ? brandId : null,
      onboarding_complete: true,
    }).eq("user_id", auth.user.id).select("user_id").single();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Creation context was not persisted.");
  },
};
