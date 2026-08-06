import { Navigate, useLocation } from "react-router-dom";
import { Loader2, Sparkles } from "lucide-react";
import { useAuth } from "@/app/AuthProvider";

function SplashScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary shadow-glow">
        <Sparkles className="h-6 w-6 text-primary-foreground" />
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
