import { useState } from "react";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { useBrands } from "@/hooks/useBrands";
import type { Brand, BrandInsert } from "@/types";

const EMPTY_FORM: BrandInsert = { name: "", description: "", website: "" };

/**
 * Brand management: the entities behind Brand publishing contexts. A Brand is
 * not a Brand Voice — a voice is an AI writing style, a Brand owns connected
 * accounts and posts. Deleting one deletes its connections and posts too
 * (DB CASCADE), which is what the confirm dialog is for.
 */
export function BrandSettings() {
  const { brands, isLoading, createBrand, updateBrand, deleteBrand } =
    useBrands();

  const [editing, setEditing] = useState<Brand | "new" | null>(null);
  const [form, setForm] = useState<BrandInsert>(EMPTY_FORM);
  const [pendingDelete, setPendingDelete] = useState<Brand | null>(null);
  const [saving, setSaving] = useState(false);

  const openEditor = (brand: Brand | "new") => {
    setEditing(brand);
    setForm(
      brand === "new"
        ? EMPTY_FORM
        : {
            name: brand.name,
            description: brand.description,
            website: brand.website,
          },
    );
  };

  const save = async () => {
    if (!form.name.trim() || !editing) return;
    setSaving(true);
    try {
      if (editing === "new") {
        await createBrand({ ...form, name: form.name.trim() });
      } else {
        await updateBrand({
          id: editing.id,
          input: { ...form, name: form.name.trim() },
        });
      }
      setEditing(null);
    } catch {
      // The mutation already toasted the reason; keep the dialog open.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle>Brands</CardTitle>
          <CardDescription>
            Each brand is its own publishing context, with its own connected
            accounts, posts and analytics.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => openEditor("new")}>
          <Plus />
          New Brand
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? null : brands.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No brands yet"
            description="Create a brand to connect its social accounts and publish as it."
          />
        ) : (
          brands.map((brand) => (
            <div
              key={brand.id}
              className="flex items-center gap-3 rounded-lg border p-3"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-sm font-semibold text-primary">
                {brand.name.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{brand.name}</p>
                {(brand.description || brand.website) && (
                  <p className="truncate text-xs text-muted-foreground">
                    {brand.description || brand.website}
                  </p>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => openEditor(brand)}
                aria-label={`Edit ${brand.name}`}
              >
                <Pencil />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => setPendingDelete(brand)}
                aria-label={`Delete ${brand.name}`}
              >
                <Trash2 />
              </Button>
            </div>
          ))
        )}
      </CardContent>

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing === "new" ? "New Brand" : "Edit Brand"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="brand-name">Name</Label>
              <Input
                id="brand-name"
                placeholder="FlowPost"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand-description">Description</Label>
              <Input
                id="brand-description"
                placeholder="What this brand is about (helps the AI write as it)"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand-website">Website</Label>
              <Input
                id="brand-website"
                placeholder="https://…"
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              loading={saving}
              disabled={!form.name.trim()}
              onClick={save}
            >
              {editing === "new" ? "Create Brand" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {pendingDelete?.name}?</DialogTitle>
            <DialogDescription>
              This permanently deletes the brand, its connected social
              accounts, and every post created for it. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingDelete) deleteBrand(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Delete brand
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
