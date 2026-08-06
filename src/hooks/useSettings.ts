import { useCallback, useState } from "react";
import { settingsService } from "@/services";
import type { UserSettings } from "@/types";

export function useSettings() {
  const [settings, setSettings] = useState<UserSettings>(() =>
    settingsService.get(),
  );

  const saveSettings = useCallback((next: UserSettings) => {
    setSettings(settingsService.save(next));
  }, []);

  return { settings, saveSettings };
}
