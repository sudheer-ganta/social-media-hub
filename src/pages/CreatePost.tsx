import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { Building2 } from "lucide-react";
import { toast } from "sonner";
import { RallyPage } from "@/components/layout/RallyPage";
import { CreatePostForm } from "@/components/posts/CreatePostForm";
import { ContextSwitcher } from "@/components/posts/ContextSwitcher";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePost } from "@/hooks/usePosts";
import { useBrands } from "@/hooks/useBrands";
import {
  PERSONAL_CONTEXT,
  brandContext,
  type AccountContext,
} from "@/constants/integrations";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { Brand } from "@/types";

/**
 * Content Studio. Personal and Brand are two separate publishing contexts —
 * different connected accounts, different fields, different analytics.
 * The active publishing context is shown as a switcher dropdown in the header,
 * defaulting to the last used context or falling back to Personal context.
 * Edit mode locks the context of the loaded post.
 */
export default function CreatePost() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { data: post, isLoading: postLoading } = usePost(id);
  const { brands, isLoading: brandsLoading } = useBrands();

  const editing = Boolean(id);
  const isLoading = (editing && postLoading) || (!editing && brandsLoading);

  // 1. Resolve context based on editing state or fallback rules
  const resolvedContext = useMemo<AccountContext>(() => {
    if (editing) {
      if (post) {
        return post.context_type === "brand" && post.brand_id
          ? brandContext(post.brand_id)
          : brands.length > 0
            ? brandContext(brands[0].id)
            : PERSONAL_CONTEXT;
      }
      return brands.length > 0 ? brandContext(brands[0].id) : PERSONAL_CONTEXT;
    }

    // 1. Explicit URL context
    const urlBrand = searchParams.get("brand");

    if (urlBrand) {
      const exists = brands.some((b) => b.id === urlBrand);
      if (exists) {
        return brandContext(urlBrand);
      }
    }

    // 2. Last-used context from localStorage
    try {
      const raw = localStorage.getItem("flowpost_last_context");
      if (raw) {
        const last: AccountContext = JSON.parse(raw);
        if (last.contextType === "brand" && last.brandId) {
          const exists = brands.some((b) => b.id === last.brandId);
          if (exists) {
            return brandContext(last.brandId);
          }
        }
      }
    } catch (e) {
      // ignore
    }

    // 3. Fallback to first Brand
    if (brands.length > 0) {
      return brandContext(brands[0].id);
    }

    return PERSONAL_CONTEXT;
  }, [editing, post, searchParams, brands]);

  // Keep URL parameters in sync with the resolved context for new posts
  useEffect(() => {
    if (!editing && !brandsLoading && brands.length > 0) {
      const currentUrlContext = searchParams.get("context");
      const currentUrlBrand = searchParams.get("brand");

      const expectedBrandId = resolvedContext.brandId ?? brands[0]?.id;

      if (currentUrlContext !== "brand" || currentUrlBrand !== expectedBrandId) {
        setSearchParams(
          { context: "brand", brand: expectedBrandId },
          { replace: true }
        );
      }
    }
  }, [editing, brandsLoading, brands, resolvedContext, searchParams, setSearchParams]);

  // Save the resolved context to localStorage as the last-used context
  useEffect(() => {
    if (!brandsLoading && resolvedContext.brandId) {
      localStorage.setItem("flowpost_last_context", JSON.stringify(resolvedContext));
    }
  }, [resolvedContext, brandsLoading]);

  // Form dirty state & save triggers from the CreatePostForm child
  const [isFormDirty, setIsFormDirty] = useState(false);
  const saveDraftRef = useRef<(() => Promise<any>) | null>(null);

  const [pendingContext, setPendingContext] = useState<AccountContext | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleContextSelect = (nextContext: AccountContext) => {
    if (
      nextContext.contextType === resolvedContext.contextType &&
      nextContext.brandId === resolvedContext.brandId
    ) {
      return;
    }

    if (isFormDirty) {
      setPendingContext(nextContext);
      setIsConfirmOpen(true);
    } else {
      performSwitch(nextContext);
    }
  };

  const performSwitch = (nextContext: AccountContext) => {
    setSearchParams(
      nextContext.contextType === "brand" && nextContext.brandId
        ? { context: "brand", brand: nextContext.brandId }
        : { context: "personal" },
      { replace: true }
    );
  };

  const handleSaveAndSwitch = async () => {
    if (saveDraftRef.current) {
      setIsSaving(true);
      try {
        await saveDraftRef.current();
        toast.success("Draft saved");
        if (pendingContext) {
          performSwitch(pendingContext);
        }
      } catch (err) {
        console.error("Save & Switch failed", err);
      } finally {
        setIsSaving(false);
        setIsConfirmOpen(false);
        setPendingContext(null);
      }
    }
  };

  if (isLoading) {
    return (
      <RallyPage title={editing ? "Edit post" : "New post"}>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-96 w-full rounded-[18px]" />
          <Skeleton className="h-96 w-full rounded-[18px]" />
        </div>
      </RallyPage>
    );
  }

  if (!editing && brands.length === 0) {
    return (
      <RallyPage
        title="New post"
        onBack={() => navigate("/posts")}
        description="Set up your brand profile to start creating tailored content."
      >
        <div className="rd-panel mx-auto mt-4 max-w-lg p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rd-tile">
            <Building2 className="h-7 w-7" />
          </div>
          <h2 className="text-2xl font-semibold tracking-[-0.04em] text-foreground">Create your Brand Profile first</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Rally uses your brand identity, tone of voice, and guidelines to generate tailored, high-converting social media posts.
          </p>
          <Button onClick={() => navigate("/settings?tab=brands")} className="mt-6 gap-2">
            <Building2 className="h-4 w-4" />
            <span>Set Up Brand Profile</span>
          </Button>
        </div>
      </RallyPage>
    );
  }

  const brand: Brand | null = resolvedContext.brandId
    ? (brands.find((b) => b.id === resolvedContext.brandId) ?? null)
    : null;

  const description = editing
    ? "Refine your post and reschedule if needed."
    : resolvedContext.contextType === "brand"
      ? `Create content for ${brand?.name ?? "your brand"}.`
      : "Create content for your personal audience.";

  return (
    <>
      <RallyPage
        title={editing ? "Edit post" : "New post"}
        onBack={editing ? undefined : () => navigate("/posts")}
        description={description}
        className="pb-0 sm:pb-0 lg:pb-0"
        actions={
          <ContextSwitcher
            currentContext={resolvedContext}
            brands={brands}
            onSelect={handleContextSelect}
            disabled={editing}
          />
        }
      >
        <CreatePostForm
          key={`${post?.id ?? "new"}:${resolvedContext.contextType}:${resolvedContext.brandId ?? ""}`}
          post={post}
          context={resolvedContext}
          brand={brand}
          onDirtyChange={setIsFormDirty}
          saveDraftRef={saveDraftRef}
        />
      </RallyPage>

      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Switch context?</DialogTitle>
            <DialogDescription>
              Your current changes will be saved as a draft.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setIsConfirmOpen(false);
                setPendingContext(null);
              }}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSaveAndSwitch} loading={isSaving}>
              Save & Switch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
