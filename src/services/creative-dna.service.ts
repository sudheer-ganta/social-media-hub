import { creativeDnaRepository } from "@/repositories/creative-dna.repository";
import type { CreativeDna } from "@/ai/types";
import type { CreativeDnaProfile } from "@/types";

export const creativeDnaService = {
  async listAll(): Promise<CreativeDnaProfile[]> {
    return creativeDnaRepository.listAll();
  },

  async getDefault(): Promise<CreativeDnaProfile | null> {
    const all = await creativeDnaRepository.listAll();
    return all.find((p) => p.is_default) ?? all[0] ?? null;
  },

  async save(name: string, dna: CreativeDna): Promise<CreativeDnaProfile> {
    return creativeDnaRepository.upsertByName({ name, dna });
  },

  async setDefault(id: string): Promise<CreativeDnaProfile> {
    await creativeDnaRepository.clearDefaults();
    return creativeDnaRepository.update(id, { is_default: true });
  },

  async remove(id: string): Promise<void> {
    await creativeDnaRepository.remove(id);
  },
};
