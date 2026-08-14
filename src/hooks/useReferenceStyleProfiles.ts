import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { referenceStyleService } from "@/services/reference-style.service";
import type { ReferenceStyleProfile, SavedReferenceStyleProfile } from "@/types/creative";

export const referenceStyleKeys = {
  all: ["reference_style_profiles"] as const,
};

/** "Style Memory" (spec §9) — a saved ReferenceStyleProfile a member reuses across future generations without re-uploading references. Mirrors useCreativeDna exactly. */
export function useReferenceStyleProfiles() {
  const queryClient = useQueryClient();

  const { data: profiles = [], isLoading } = useQuery<SavedReferenceStyleProfile[]>({
    queryKey: referenceStyleKeys.all,
    queryFn: () => referenceStyleService.listAll(),
  });

  const defaultProfile = profiles.find((p) => p.is_default) ?? profiles[0] ?? null;

  const saveMutation = useMutation({
    mutationFn: ({ name, profile }: { name: string; profile: ReferenceStyleProfile }) =>
      referenceStyleService.save(name, profile),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: referenceStyleKeys.all });
      toast.success("Creative style saved");
    },
    onError: (err: Error) => {
      toast.error("Failed to save creative style", { description: err.message });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => referenceStyleService.setDefault(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: referenceStyleKeys.all });
      toast.success("Default creative style updated");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => referenceStyleService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: referenceStyleKeys.all });
      toast.success("Creative style deleted");
    },
  });

  return {
    profiles,
    defaultProfile,
    isLoading,
    saveProfile: saveMutation.mutateAsync,
    setDefault: setDefaultMutation.mutate,
    deleteProfile: deleteMutation.mutate,
  };
}
