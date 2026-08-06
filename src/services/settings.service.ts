import type { UserSettings } from "@/types";

const STORAGE_KEY = "sch-settings";

export const DEFAULT_SETTINGS: UserSettings = {
  fullName: "Alex Morgan",
  email: "",
  company: "",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  defaultPlatforms: ["linkedin", "x"],
  emailNotifications: true,
  pushNotifications: false,
  weeklyDigest: true,
};

/**
 * Settings persistence. Backed by localStorage for now — replace with a
 * Supabase `profiles` table when auth lands, keeping the same interface.
 */
export const settingsService = {
  get(): UserSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return DEFAULT_SETTINGS;
      return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as UserSettings) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  },

  save(settings: UserSettings): UserSettings {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return settings;
  },
};
