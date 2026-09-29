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
    const supabase = getSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return null;

    const { data, error } = await supabase
      .from("creation_profiles")
      .select("*")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      console.warn("Failed to fetch creation profile:", error.message);
    }

    if (data?.onboarding_complete) {
      return data as CreationProfile;
    }

    // Check if user has pre-existing brands or posts
    try {
      const { count: brandCount } = await supabase
        .from("brands")
        .select("*", { count: "exact", head: true });
      const { count: postCount } = await supabase
        .from("posts")
        .select("*", { count: "exact", head: true });

      if ((brandCount && brandCount > 0) || (postCount && postCount > 0)) {
        const defaultProfile: Partial<CreationProfile> = {
          user_id: auth.user.id,
          default_context_type: "personal",
          default_brand_id: null,
          personal_context: {},
          onboarding_complete: true,
        };
        await supabase.from("creation_profiles").upsert(defaultProfile, { onConflict: "user_id" });
        return {
          user_id: auth.user.id,
          default_context_type: "personal",
          default_brand_id: null,
          personal_context: {},
          onboarding_complete: true,
          ...(data || {}),
        } as CreationProfile;
      }
    } catch {
      // Ignore count check errors if tables don't match
    }

    return (data as CreationProfile | null) ?? null;
  },

  async markCompleteForLogin(): Promise<void> {
    const supabase = getSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;

    const { data } = await supabase
      .from("creation_profiles")
      .select("onboarding_complete")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (!data || !data.onboarding_complete) {
      await supabase.from("creation_profiles").upsert(
        {
          user_id: auth.user.id,
          default_context_type: "personal",
          default_brand_id: null,
          personal_context: {},
          onboarding_complete: true,
        },
        { onConflict: "user_id" }
      );
    }
  },

  async complete(context: "personal" | "brand", brandId?: string): Promise<void> {
    const supabase = getSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("You need to be signed in.");

    const { data, error } = await supabase
      .from("creation_profiles")
      .upsert(
        {
          user_id: auth.user.id,
          default_context_type: context,
          default_brand_id: context === "brand" ? brandId : null,
          onboarding_complete: true,
        },
        { onConflict: "user_id" }
      )
      .select("user_id")
      .single();

    if (error) throw new Error(error.message);
    if (!data) throw new Error("Creation context was not persisted.");
  },
};

