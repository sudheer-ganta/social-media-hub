import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { brandsRepository } from "@/repositories/brands.repository";
import type { Brand, BrandInsert } from "@/types";

export const brandKeys = {
  all: ["brands"] as const,
};

/** The user's Brands — the entities behind Brand publishing contexts. */
export function useBrands() {
  const queryClient = useQueryClient();

  const { data: brands = [], isLoading } = useQuery<Brand[]>({
    queryKey: brandKeys.all,
    queryFn: () => brandsRepository.listAll(),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: brandKeys.all });

  const createMutation = useMutation({
    mutationFn: (input: BrandInsert) => brandsRepository.insert(input),
    onSuccess: () => {
      invalidate();
      toast.success("Brand created");
    },
    onError: (err: Error) => {
      toast.error("Failed to create brand", { description: err.message });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<BrandInsert> }) =>
      brandsRepository.update(id, input),
    onSuccess: () => {
      invalidate();
      toast.success("Brand updated");
    },
    onError: (err: Error) => {
      toast.error("Failed to update brand", { description: err.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => brandsRepository.remove(id),
    onSuccess: () => {
      // Brand deletion CASCADEs to its posts and connections, so every
      // context-scoped cache may now be stale.
      queryClient.invalidateQueries();
      toast.success("Brand deleted");
    },
    onError: (err: Error) => {
      toast.error("Failed to delete brand", { description: err.message });
    },
  });

  return {
    brands,
    isLoading,
    createBrand: createMutation.mutateAsync,
    updateBrand: updateMutation.mutateAsync,
    deleteBrand: deleteMutation.mutate,
    isCreating: createMutation.isPending,
  };
}
