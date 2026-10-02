import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { RallyIcon } from "@/components/brand/Logo";
import { useAuth } from "@/app/AuthProvider";

function SplashScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-card border border-border shadow-md">
        <RallyIcon className="h-7 w-7" />
      </div>
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) return <SplashScreen />;

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
