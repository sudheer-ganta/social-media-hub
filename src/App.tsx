import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { lazyRoute } from "@/lib/lazyRoute";
import { showsPrerenderedLanding } from "@/lib/prerender";
import { AppProviders } from "@/app/providers";
import { AppLayout } from "@/app/AppLayout";
import { useAuth } from "@/app/AuthProvider";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { RouteLoader } from "@/components/shared/RouteLoader";

const Landing = lazyRoute(() => import("@/pages/Landing"));
const Login = lazy(() => import("@/pages/auth/Login"));
const Register = lazy(() => import("@/pages/auth/Register"));
const ForgotPassword = lazy(() => import("@/pages/auth/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/auth/ResetPassword"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Posts = lazy(() => import("@/pages/Posts"));
const CreatePost = lazy(() => import("@/pages/CreatePost"));
const Calendar = lazy(() => import("@/pages/Calendar"));
const Scheduled = lazy(() => import("@/pages/Scheduled"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const Integrations = lazy(() => import("@/pages/Integrations"));
const Settings = lazy(() => import("@/pages/Settings"));
const StudioPreview = lazy(() => import("@/pages/dev/StudioPreview"));
const AnalyticsPreview = lazy(() => import("@/pages/dev/AnalyticsPreview"));
const BillingPreview = lazy(() => import("@/pages/dev/BillingPreview"));
const Privacy = lazyRoute(() => import("@/pages/Privacy"));
const Terms = lazyRoute(() => import("@/pages/Terms"));
const DataDeletion = lazyRoute(() => import("@/pages/DataDeletion"));
const CreativeHistory = lazy(() => import("@/pages/CreativeHistory"));
const Billing = lazy(() => import("@/pages/Billing"));
const Pricing = lazy(() => import("@/pages/Pricing"));

/** Routes that are prerendered at build time (scripts/prerender.mjs). */
const PRERENDERED_ROUTES: Record<string, { preload: () => Promise<unknown> }> = {
  "/": Landing,
  "/privacy": Privacy,
  "/terms": Terms,
  "/data-deletion": DataDeletion,
};

/** Load the current page's chunk so hydration can reuse the static HTML. */
export function preloadPrerenderedRoute(pathname: string): Promise<unknown> {
  const route = PRERENDERED_ROUTES[pathname.replace(/\/+$/, "") || "/"];
  return route ? route.preload() : Promise.resolve();
}

/**
 * "/" is both the signed-in Dashboard and the public homepage. Signed-out
 * visitors on exactly "/" get the landing page; everything else stays behind login.
 */
function AppShellGate() {
  const { session, loading } = useAuth();
  const { pathname } = useLocation();

  // While auth is still resolving, the prerendered homepage must be matched
  // exactly (hydration), so signed-out-looking first renders show the landing page.
  if (!session && pathname === "/" && (!loading || showsPrerenderedLanding())) {
    return <Landing />;
  }

  return (
    <ProtectedRoute>
      <AppLayout />
    </ProtectedRoute>
  );
}

/** Route tree, shared by the browser (App) and the build-time prerender. */
export function AppRoutes() {
  return (
    <Suspense fallback={<RouteLoader />}>
        <Routes>
          {/* Public auth & legal routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/data-deletion" element={<DataDeletion />} />
          <Route path="/data-deletion-instructions" element={<Navigate to="/data-deletion" replace />} />
          <Route path="/privacy/data-deletion" element={<Navigate to="/data-deletion" replace />} />

          {/* Protected app routes */}
          <Route path="onboarding" element={<Navigate to="/settings?tab=brands" replace />} />
          <Route element={<AppShellGate />}>
            <Route index element={<Dashboard />} />
            <Route path="posts" element={<Posts />} />
            <Route path="posts/new" element={<CreatePost />} />
            <Route path="posts/:id/edit" element={<CreatePost />} />
            <Route path="calendar" element={<Calendar />} />
            <Route path="scheduled" element={<Scheduled />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="creatives" element={<CreativeHistory />} />
            <Route path="integrations" element={<Integrations />} />
            <Route path="billing" element={<Billing />} />
            <Route path="settings" element={<Settings />} />
            {/* AI Studio is now a mode inside Create Post. Kept so bookmarks
                and the old "Open in AI Studio" links still land somewhere. */}
            <Route
              path="ai-studio"
              element={<Navigate to="/posts/new" replace />}
            />
          </Route>

          {/* Dev-only: mock-data preview of the studio output panels.
              Stripped from production builds by the DEV guard. */}
          {import.meta.env.DEV && (
            <Route path="/dev/studio-preview" element={<StudioPreview />} />
          )}
          {import.meta.env.DEV && (
            <Route path="/dev/analytics-preview" element={<AnalyticsPreview />} />
          )}
          {import.meta.env.DEV && (
            <Route path="/dev/billing-preview" element={<BillingPreview />} />
          )}

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <AppProviders>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppProviders>
  );
}
