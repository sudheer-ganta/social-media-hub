import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppProviders } from "@/app/providers";
import { AppLayout } from "@/app/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Login from "@/pages/auth/Login";
import Register from "@/pages/auth/Register";
import ForgotPassword from "@/pages/auth/ForgotPassword";
import ResetPassword from "@/pages/auth/ResetPassword";
import Dashboard from "@/pages/Dashboard";
import Posts from "@/pages/Posts";
import CreatePost from "@/pages/CreatePost";
import Calendar from "@/pages/Calendar";
import Analytics from "@/pages/Analytics";
import Integrations from "@/pages/Integrations";
import Settings from "@/pages/Settings";
import StudioPreview from "@/pages/dev/StudioPreview";
import Privacy from "@/pages/Privacy";
import Terms from "@/pages/Terms";
import DataDeletion from "@/pages/DataDeletion";

export default function App() {
  return (
    <AppProviders>
      <BrowserRouter>
        <Routes>
          {/* Public auth & legal routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/data-deletion" element={<DataDeletion />} />
          <Route path="/data-deletion-instructions" element={<Navigate to="/data-deletion" replace />} />
          <Route path="/privacy/data-deletion" element={<Navigate to="/data-deletion" replace />} />

          {/* Protected app routes */}
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="posts" element={<Posts />} />
            <Route path="posts/new" element={<CreatePost />} />
            <Route path="posts/:id/edit" element={<CreatePost />} />
            <Route path="calendar" element={<Calendar />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="integrations" element={<Integrations />} />
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

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppProviders>
  );
}
