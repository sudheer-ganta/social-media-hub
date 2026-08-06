import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { brandVoicesService } from "@/services/brand-voices.service";
import type { BrandVoice, BrandVoiceProfile } from "@/types";

export const brandVoiceKeys = {
  all: ["brand_voices"] as const,
  default: ["brand_voices", "default"] as const,
};

export function useBrandVoices() {
  const queryClient = useQueryClient();

  const { data: profiles = [], isLoading } = useQuery<BrandVoiceProfile[]>({
    queryKey: brandVoiceKeys.all,
    queryFn: () => brandVoicesService.listAll(),
  });

  const defaultProfile = profiles.find((p: BrandVoiceProfile) => p.is_default) ?? profiles[0] ?? null;

  const createMutation = useMutation({
    mutationFn: ({ name, voice }: { name: string; voice: BrandVoice }) =>
      brandVoicesService.save(name, voice),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: brandVoiceKeys.all });
      toast.success("Brand Voice profile created");
    },
    onError: (err: Error) => {
      toast.error("Failed to create profile", { description: err.message });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ name, voice }: { id: string; name: string; voice: BrandVoice }) =>
      brandVoicesService.save(name, voice),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: brandVoiceKeys.all });
      toast.success("Brand Voice profile updated");
    },
    onError: (err: Error) => {
      toast.error("Failed to update profile", { description: err.message });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => brandVoicesService.setDefault(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: brandVoiceKeys.all });
      toast.success("Default Brand Voice updated");
    },
    onError: (err: Error) => {
      toast.error("Failed to set default profile", { description: err.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => brandVoicesService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: brandVoiceKeys.all });
      toast.success("Profile deleted");
    },
    onError: (err: Error) => {
      toast.error("Failed to delete profile", { description: err.message });
    },
  });

  return {
    profiles,
    defaultProfile,
    isLoading,
    createProfile: createMutation.mutateAsync,
    updateProfile: updateMutation.mutateAsync,
    setDefault: setDefaultMutation.mutate,
    deleteProfile: deleteMutation.mutate,
  };
}
