import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { queryClient } from "@/lib/queryClient";
import { AuthProvider } from "@/app/AuthProvider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider delayDuration={200}>
          {children}
          <Toaster position="bottom-right" richColors closeButton />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
