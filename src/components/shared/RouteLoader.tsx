import { Loader2 } from "lucide-react";

export function RouteLoader() {
  return (
    <div className="flex min-h-[400px] w-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary/80" />
        <p className="text-sm font-medium text-muted-foreground animate-pulse">
          Preparing your workspace...
        </p>
      </div>
    </div>
  );
}
