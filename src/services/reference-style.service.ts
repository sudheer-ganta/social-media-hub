import { referenceStyleRepository } from "@/repositories/reference-style.repository";
import type { ReferenceStyleProfile, SavedReferenceStyleProfile } from "@/types/creative";

export const referenceStyleService = {
  async listAll(): Promise<SavedReferenceStyleProfile[]> {
    return referenceStyleRepository.listAll();
  },

  async getDefault(): Promise<SavedReferenceStyleProfile | null> {
    const all = await referenceStyleRepository.listAll();
    return all.find((p) => p.is_default) ?? all[0] ?? null;
  },

  async save(name: string, profile: ReferenceStyleProfile): Promise<SavedReferenceStyleProfile> {
    return referenceStyleRepository.upsertByName({ name, profile });
  },

  async setDefault(id: string): Promise<SavedReferenceStyleProfile> {
    await referenceStyleRepository.clearDefaults();
    return referenceStyleRepository.update(id, { is_default: true });
  },

  async remove(id: string): Promise<void> {
    await referenceStyleRepository.remove(id);
  },
};
