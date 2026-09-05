import { brandVoicesRepository } from "@/repositories/brand-voices.repository";
import type { BrandVoice } from "@/ai/types";
import type { BrandVoiceProfile } from "@/types";

export const brandVoicesService = {
  async listAll(): Promise<BrandVoiceProfile[]> {
    return brandVoicesRepository.listAll();
  },

  async getDefault(): Promise<BrandVoiceProfile | null> {
    const all = await brandVoicesRepository.listAll();
    return all.find((p) => p.is_default) ?? all[0] ?? null;
  },

  async save(brandId: string, name: string, voice: BrandVoice): Promise<BrandVoiceProfile> {
    return brandVoicesRepository.upsertByBrand({ brand_id: brandId, name, voice });
  },

  async setDefault(id: string): Promise<BrandVoiceProfile> {
    await brandVoicesRepository.clearDefaults();
    return brandVoicesRepository.update(id, { is_default: true });
  },

  async remove(id: string): Promise<void> {
    await brandVoicesRepository.remove(id);
  },

  async importLegacyProfiles(legacy: Record<string, BrandVoice>): Promise<number> {
    void legacy;
    return 0;
  },
};
