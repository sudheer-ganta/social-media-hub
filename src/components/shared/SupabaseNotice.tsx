import { DatabaseZap } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase";

/**
 * Shown instead of data-driven UI when the Supabase environment
 * variables are missing, with copy-paste setup instructions.
 */
export function SupabaseNotice() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/10">
        <DatabaseZap className="h-6 w-6 text-warning" />
      </div>
      <h3 className="mt-4 text-sm font-semibold">Connect Supabase to continue</h3>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
        Copy <code className="rounded bg-muted px-1.5 py-0.5 text-xs">.env.example</code> to{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">.env</code>, add your{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">VITE_SUPABASE_URL</code> and{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">VITE_SUPABASE_ANON_KEY</code>,
        run <code className="rounded bg-muted px-1.5 py-0.5 text-xs">npm run db:migrate</code>,
        then restart the dev server. Image uploads also need the{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">VITE_CLOUDINARY_*</code> variables —
        see <code className="rounded bg-muted px-1.5 py-0.5 text-xs">.env.example</code>.
      </p>
    </div>
  );
}

export function useSupabaseReady(): boolean {
  return isSupabaseConfigured();
}
