import * as React from "react";
import { User, Building2, ChevronDown, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBrands } from "@/hooks/useBrands";
import { PERSONAL_CONTEXT, brandContext, type AccountContext } from "@/constants/integrations";
import type { Brand } from "@/types";

interface ContextSwitcherProps {
  currentContext: AccountContext;
  brands: Brand[];
  onSelect: (context: AccountContext) => void;
  disabled?: boolean;
}

export function ContextSwitcher({
  currentContext,
  brands,
  onSelect,
  disabled = false,
}: ContextSwitcherProps) {
  const { createBrand, isCreating } = useBrands();
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [newBrandName, setNewBrandName] = React.useState("");

  const isBrand = currentContext.contextType === "brand";
  const activeBrand = isBrand ? brands.find((b) => b.id === currentContext.brandId) : null;

  const handleCreateBrandSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newBrandName.trim();
    if (!name) return;

    try {
      const created = await createBrand({
        name,
        description: "",
        website: "",
      });
      if (created) {
        onSelect(brandContext(created.id));
        setNewBrandName("");
        setIsDialogOpen(false);
      }
    } catch (err) {
      // toast is already handled by hook
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            className="flex items-center gap-2 px-3 py-1.5 h-9 font-medium border-border/80 hover:bg-accent text-foreground transition-all"
          >
            {isBrand && activeBrand ? (
              <>
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="max-w-[120px] truncate">{activeBrand.name}</span>
              </>
            ) : (
              <>
                <User className="h-4 w-4 text-muted-foreground" />
                <span>Personal</span>
              </>
            )}
            {!disabled && <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/80" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            onClick={() => onSelect(PERSONAL_CONTEXT)}
            className="flex items-center gap-2 cursor-pointer"
          >
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1 font-medium">Personal</span>
            {!isBrand && (
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            )}
          </DropdownMenuItem>

          {brands.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/85">
                Brands
              </div>
              {brands.map((b) => {
                const selected = isBrand && currentContext.brandId === b.id;
                return (
                  <DropdownMenuItem
                    key={b.id}
                    onClick={() => onSelect(brandContext(b.id))}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 truncate">{b.name}</span>
                    {selected && (
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    )}
                  </DropdownMenuItem>
                );
              })}
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setIsDialogOpen(true)}
            className="flex items-center gap-2 cursor-pointer text-primary focus:text-primary"
          >
            <Plus className="h-4 w-4" />
            <span>Create Brand</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <form onSubmit={handleCreateBrandSubmit}>
            <DialogHeader>
              <DialogTitle>Create Brand</DialogTitle>
              <DialogDescription>
                Add a new brand to manage its custom social profiles and strategies.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="brand-name">Brand Name</Label>
                <Input
                  id="brand-name"
                  placeholder="e.g. Acme Corp"
                  value={newBrandName}
                  onChange={(e) => setNewBrandName(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsDialogOpen(false)}
                disabled={isCreating}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!newBrandName.trim() || isCreating} loading={isCreating}>
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
