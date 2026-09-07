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
  const userId = session?.user?.id;
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(() => {
    if (!userId) return null;
    const cached = sessionStorage.getItem(`onboarding_complete_${userId}`);
    return cached !== null ? cached === "true" : null;
  });

  useEffect(() => {
    if (!userId) {
      setOnboardingComplete(null);
      return;
    }

    let active = true;
    creationProfileRepository.get()
      .then((profile) => {
        if (!active) return;
        const complete = profile?.onboarding_complete ?? false;
        setOnboardingComplete(complete);
        sessionStorage.setItem(`onboarding_complete_${userId}`, String(complete));
      })
      .catch(() => {
        if (!active) return;
        setOnboardingComplete(false);
      });

    return () => {
      active = false;
    };
  }, [userId]);

  if (loading) return <SplashScreen />;

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (onboardingComplete === null) return <SplashScreen />;
  if (!onboardingComplete && location.pathname !== "/onboarding") return <Navigate to="/onboarding" replace />;
  if (onboardingComplete && location.pathname === "/onboarding") return <Navigate to="/" replace />;

  return <>{children}</>;
}
