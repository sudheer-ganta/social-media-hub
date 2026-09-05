import { Navigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useAuth } from "@/app/AuthProvider";
import { creationProfileRepository } from "@/repositories/creation-profile.repository";

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
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);

  useEffect(() => {
    setOnboardingComplete(null);
    if (!session) return;
    creationProfileRepository.get()
      .then((profile) => setOnboardingComplete(profile?.onboarding_complete ?? false))
      .catch(() => setOnboardingComplete(false));
  }, [session, location.pathname]);

  if (loading) return <SplashScreen />;

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (onboardingComplete === null) return <SplashScreen />;
  if (!onboardingComplete && location.pathname !== "/onboarding") return <Navigate to="/onboarding" replace />;
  if (onboardingComplete && location.pathname === "/onboarding") return <Navigate to="/" replace />;

  return <>{children}</>;
}
