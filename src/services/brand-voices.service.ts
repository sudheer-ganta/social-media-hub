import { brandVoicesRepository } from "@/repositories";
import type {
  BrandVoice,
  BrandVoiceProfile,
  BrandVoiceProfileUpdate,
} from "@/types";

/**
 * Business layer for brand voice profiles. Components and hooks talk to this —
 * the repository underneath is a swappable Supabase implementation.
 */
export const brandVoicesService = {
  listAll(): Promise<BrandVoiceProfile[]> {
    return brandVoicesRepository.listAll();
  },

  /** Save under `name`, replacing an existing profile with that name. */
  save(name: string, voice: BrandVoice): Promise<BrandVoiceProfile> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Profile name is required");
    return brandVoicesRepository.upsertByName({
      name: trimmed,
      voice: { ...voice, name: trimmed },
    });
  },

  update(id: string, input: BrandVoiceProfileUpdate): Promise<BrandVoiceProfile> {
    return brandVoicesRepository.update(id, input);
  },

  remove(id: string): Promise<void> {
    return brandVoicesRepository.remove(id);
  },

  /** Make one profile the default, demoting whichever held the flag. */
  async setDefault(id: string): Promise<BrandVoiceProfile> {
    await brandVoicesRepository.clearDefaults();
    return brandVoicesRepository.update(id, { is_default: true });
  },

  /**
   * One-time import of profiles left in localStorage by the pre-Supabase
   * version of the studio. Returns how many were moved across.
   */
  async importLegacyProfiles(
    legacy: Record<string, BrandVoice>,
  ): Promise<number> {
    const entries = Object.entries(legacy);
    if (entries.length === 0) return 0;
    const existing = new Set(
      (await brandVoicesRepository.listAll()).map((p) => p.name),
    );
    const pending = entries.filter(([name]) => !existing.has(name));
    await Promise.all(
      pending.map(([name, voice]) =>
        brandVoicesRepository.insert({ name, voice: { ...voice, name } }),
      ),
    );
    return pending.length;
  },
};
