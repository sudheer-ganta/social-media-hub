import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { ArrowLeftRight, Building2, Plus, User } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { CreatePostForm } from "@/components/posts/CreatePostForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { usePost } from "@/hooks/usePosts";
import { useBrands } from "@/hooks/useBrands";
import {
  PERSONAL_CONTEXT,
  brandContext,
  type AccountContext,
} from "@/constants/integrations";
import { cn } from "@/lib/utils";
import type { Brand } from "@/types";

/**
 * Content Studio. Personal and Brand are two separate publishing contexts —
 * different connected accounts, different fields, different analytics — so
 * the first thing a new post asks is which one it belongs to. The choice
 * lives in the URL (`?context=brand&brand=…`), which makes it linkable and
 * survives a refresh; an existing post's context comes from its row and is
 * never asked again.
 */
export default function CreatePost() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: post, isLoading } = usePost(id);
  const { brands, isLoading: brandsLoading } = useBrands();

  const editing = Boolean(id);

  // The post row wins in edit mode; the URL decides for a new post.
  const urlContext = searchParams.get("context");
  const urlBrand = searchParams.get("brand");
  const context: AccountContext | null = editing
    ? post
      ? post.context_type === "brand" && post.brand_id
        ? brandContext(post.brand_id)
        : PERSONAL_CONTEXT
      : null
    : urlContext === "personal"
      ? PERSONAL_CONTEXT
      : urlContext === "brand" && urlBrand
        ? brandContext(urlBrand)
        : null;

  const brand: Brand | null = context?.brandId
    ? (brands.find((b) => b.id === context.brandId) ?? null)
    : null;

  // A brand id pointing at nothing (deleted brand, foreign link) falls back
  // to the chooser rather than composing into a context that cannot publish.
  const brandMissing =
    context?.contextType === "brand" && !brandsLoading && !brand;

  if (editing && isLoading) {
    return (
      <PageContainer title="Content Studio">
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-96 w-full rounded-lg" />
          <Skeleton className="h-96 w-full rounded-lg" />
        </div>
      </PageContainer>
    );
  }

  if (!context || (brandMissing && !editing)) {
    return (
      <PageContainer
        title="Content Studio"
        description="Where is this post going?"
      >
        <ContextChooser
          onPick={(next) =>
            setSearchParams(
              next.contextType === "brand" && next.brandId
                ? { context: "brand", brand: next.brandId }
                : { context: "personal" },
              { replace: true },
            )
          }
        />
      </PageContainer>
    );
  }

  const isBrand = context.contextType === "brand";
  const title = editing
    ? "Edit Post"
    : isBrand
      ? `Brand Post${brand ? ` — ${brand.name}` : ""}`
      : "Personal Post";
  const description = editing
    ? "Refine your post and reschedule if needed."
    : isBrand
      ? `Create content for ${brand?.name ?? "your brand"}.`
      : "Create content for your personal audience.";

  return (
    <PageContainer
      title={title}
      description={description}
      actions={
        !editing ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSearchParams({}, { replace: true })}
          >
            <ArrowLeftRight />
            Switch context
          </Button>
        ) : undefined
      }
    >
      <CreatePostForm
        key={`${post?.id ?? "new"}:${context.contextType}:${context.brandId ?? ""}`}
        post={post}
        context={context}
        brand={brand}
      />
    </PageContainer>
  );
}

/** The Personal / Brand fork, plus brand selection and first-brand creation. */
function ContextChooser({
  onPick,
}: {
  onPick: (context: AccountContext) => void;
}) {
  const { brands, isLoading, createBrand, isCreating } = useBrands();
  const [pickingBrand, setPickingBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");

  const handleCreateBrand = async () => {
    const name = newBrandName.trim();
    if (!name) return;
    const created = await createBrand({
      name,
      description: "",
      website: "",
    }).catch(() => null);
    if (created) onPick(brandContext(created.id));
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onPick(PERSONAL_CONTEXT)}
          className="rounded-xl border bg-card p-6 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-elevated"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <User className="h-5 w-5" />
          </span>
          <h3 className="mt-4 text-lg font-semibold">Personal</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create content for your personal audience
          </p>
        </button>

        <button
          type="button"
          onClick={() => setPickingBrand((open) => !open)}
          className={cn(
            "rounded-xl border bg-card p-6 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-elevated",
            pickingBrand && "border-primary/60 ring-1 ring-primary/40",
          )}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Building2 className="h-5 w-5" />
          </span>
          <h3 className="mt-4 text-lg font-semibold">Brand</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create content for your brand
          </p>
        </button>
      </div>

      {pickingBrand && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            {isLoading ? (
              <Skeleton className="h-10 w-full rounded-md" />
            ) : (
              brands.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => onPick(brandContext(b.id))}
                  className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary/60 hover:bg-accent"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-sm font-semibold text-primary">
                    {b.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {b.name}
                    </span>
                    {b.description && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {b.description}
                      </span>
                    )}
                  </span>
                </button>
              ))
            )}

            <div className="flex gap-2 border-t pt-3">
              <Input
                placeholder={
                  brands.length ? "New brand name" : "Name your first brand"
                }
                value={newBrandName}
                onChange={(e) => setNewBrandName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleCreateBrand();
                  }
                }}
              />
              <Button
                type="button"
                loading={isCreating}
                disabled={!newBrandName.trim()}
                onClick={handleCreateBrand}
              >
                <Plus />
                Create
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
