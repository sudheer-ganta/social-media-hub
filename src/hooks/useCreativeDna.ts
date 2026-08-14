import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { creativeDnaService } from "@/services/creative-dna.service";
import type { CreativeDna, CreativeDnaProfile } from "@/types";

export const creativeDnaKeys = {
  all: ["creative_dna"] as const,
};

export function useCreativeDna() {
  const queryClient = useQueryClient();

  const { data: profiles = [], isLoading } = useQuery<CreativeDnaProfile[]>({
    queryKey: creativeDnaKeys.all,
    queryFn: () => creativeDnaService.listAll(),
  });

  const defaultProfile = profiles.find((p) => p.is_default) ?? profiles[0] ?? null;

  const saveMutation = useMutation({
    mutationFn: ({ name, dna }: { name: string; dna: CreativeDna }) =>
      creativeDnaService.save(name, dna),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: creativeDnaKeys.all });
      toast.success("Creative DNA saved");
    },
    onError: (err: Error) => {
      toast.error("Failed to save Creative DNA", { description: err.message });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => creativeDnaService.setDefault(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: creativeDnaKeys.all });
      toast.success("Default Creative DNA updated");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => creativeDnaService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: creativeDnaKeys.all });
      toast.success("Creative DNA deleted");
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
