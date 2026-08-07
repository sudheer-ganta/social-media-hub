/**
 * useBrandVoice — named Brand Voice profiles, stored in the `brand_voices`
 * table so they follow the user across devices.
 *
 * Supports:
 *   - Active (working) brand voice state, cached in localStorage
 *   - Saving the current voice as a named profile
 *   - Loading a saved profile
 *   - Deleting a saved profile
 *   - Listing all saved profiles
 *   - One-time import of profiles left behind by the localStorage version
 *
 * The active/working voice deliberately stays client-side: it's scratch state
 * that changes on every keystroke, and only the snapshot taken at generation
 * time (into ai_studio_input) needs to be durable.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { brandVoicesService } from "@/services";
import { DEFAULT_BRAND_VOICE, EMPTY_BRAND_VOICE } from "@/ai/types";
import type { BrandVoice, BrandVoiceProfile } from "@/types";

const ACTIVE_KEY = "ms-active-brand-voice";
/** Written by the pre-Supabase version; read once, then retired. */
const LEGACY_PROFILES_KEY = "ms-brand-voices";

export const brandVoiceKeys = {
  all: ["brand-voices"] as const,
};

function readLegacyProfiles(): Record<string, BrandVoice> {
  try {
    return JSON.parse(localStorage.getItem(LEGACY_PROFILES_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function useBrandVoice() {
  const queryClient = useQueryClient();

  const [brandVoice, setBrandVoiceState] = useState<BrandVoice>(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_KEY);
      return saved
        ? { ...DEFAULT_BRAND_VOICE, ...JSON.parse(saved) }
        : DEFAULT_BRAND_VOICE;
    } catch {
      return DEFAULT_BRAND_VOICE;
    }
  });
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);

  // Persist the active voice whenever it changes
  useEffect(() => {
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(brandVoice));
  }, [brandVoice]);

  const profilesQuery = useQuery({
    queryKey: brandVoiceKeys.all,
    queryFn: () => brandVoicesService.listAll(),
  });

  const profiles = useMemo(
    () => profilesQuery.data ?? [],
    [profilesQuery.data],
  );

  // Auto-select the default profile when loaded if brand voice name is empty
  useEffect(() => {
    if (profiles.length > 0 && !brandVoice.name) {
      const preferred = profiles.find((p) => p.is_default);
      if (preferred) {
        setBrandVoiceState({ ...DEFAULT_BRAND_VOICE, ...preferred.voice });
        setActiveProfileId(preferred.id);
      } else {
        setBrandVoiceState(EMPTY_BRAND_VOICE);
      }
    }
  }, [profiles, brandVoice.name]);

  // One-time migration of localStorage profiles into the table.
  const importedRef = useRef(false);
  useEffect(() => {
    if (importedRef.current || !profilesQuery.isSuccess) return;
    const legacy = readLegacyProfiles();
    if (Object.keys(legacy).length === 0) return;
    importedRef.current = true;

    brandVoicesService
      .importLegacyProfiles(legacy)
      .then((count) => {
        localStorage.removeItem(LEGACY_PROFILES_KEY);
        if (count > 0) {
          queryClient.invalidateQueries({ queryKey: brandVoiceKeys.all });
          toast.success(
            `Moved ${count} brand voice ${count === 1 ? "profile" : "profiles"} to your account`,
          );
        }
      })
      .catch((error: Error) => {
        // Leave the localStorage copy in place so the next load can retry.
        importedRef.current = false;
        toast.error("Could not sync saved brand voices", {
          description: error.message,
        });
      });
  }, [profilesQuery.isSuccess, queryClient]);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: brandVoiceKeys.all });
  }, [queryClient]);

  const setBrandVoice = useCallback(
    (voice: BrandVoice | ((prev: BrandVoice) => BrandVoice)) => {
      setBrandVoiceState(voice);
    },
    [],
  );

  const saveMutation = useMutation({
    mutationFn: (name: string) =>
      brandVoicesService.save(name, { ...brandVoice, name }),
    onSuccess: (profile: BrandVoiceProfile) => {
      setBrandVoiceState((prev) => ({ ...prev, name: profile.name }));
      setActiveProfileId(profile.id);
      invalidate();
      toast.success(`Saved "${profile.name}"`);
    },
    onError: (error: Error) =>
      toast.error("Could not save profile", { description: error.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => brandVoicesService.remove(id),
    onSuccess: (_result, id) => {
      setActiveProfileId((current) => (current === id ? null : current));
      invalidate();
    },
    onError: (error: Error) =>
      toast.error("Could not delete profile", { description: error.message }),
  });

  const saveCurrentProfile = useCallback(
    (name: string) => {
      if (!name.trim()) return;
      saveMutation.mutate(name);
    },
    [saveMutation],
  );

  const loadProfile = useCallback(
    (name: string) => {
      if (name === "None" || name === "None (No Brand Voice)") {
        setBrandVoiceState({
          name: "None",
          description: "",
          mission: "",
          tone: "",
          writingStyle: "",
          wordsToUse: [],
          wordsToAvoid: [],
          emojiStyle: "None" as any,
          ctaStyle: "None" as any,
          targetAudience: "",
          personality: "" as any,
        });
        setActiveProfileId(null);
        return;
      }
      const profile = profiles.find(
        (p) =>
          (p.voice?.name || p.name).toLowerCase() === name.toLowerCase() ||
          p.name.toLowerCase() === name.toLowerCase()
      );
      if (!profile) return;
      setBrandVoiceState({
        ...DEFAULT_BRAND_VOICE,
        ...profile.voice,
        name: profile.voice?.name || profile.name,
      });
      setActiveProfileId(profile.id);
    },
    [profiles],
  );

  const deleteProfile = useCallback(
    (name: string) => {
      const profile = profiles.find(
        (p) =>
          (p.voice?.name || p.name).toLowerCase() === name.toLowerCase() ||
          p.name.toLowerCase() === name.toLowerCase()
      );
      if (profile) deleteMutation.mutate(profile.id);
    },
    [profiles, deleteMutation],
  );

  /** Name-keyed view, kept for the panel's existing shape. */
  const savedProfiles = useMemo(
    () =>
      Object.fromEntries(
        profiles.map((p) => [p.voice?.name || p.name, p.voice])
      ) as Record<string, BrandVoice>,
    [profiles],
  );
  const profileNames = useMemo(
    () =>
      Array.from(
        new Set(profiles.map((p) => p.voice?.name || p.name).filter(Boolean))
      ),
    [profiles],
  );

  return {
    brandVoice,
    setBrandVoice,
    activeProfileId,
    profiles,
    savedProfiles,
    profileNames,
    hasProfiles: profileNames.length > 0,
    isLoadingProfiles: profilesQuery.isLoading,
    isSavingProfile: saveMutation.isPending,
    saveCurrentProfile,
    loadProfile,
    deleteProfile,
    resetToDefault: () => {
      setBrandVoiceState(DEFAULT_BRAND_VOICE);
      setActiveProfileId(null);
    },
  };
}
