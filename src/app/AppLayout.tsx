import { useState, Suspense } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Sidebar } from "@/components/layout/Sidebar";
import { FlowRail } from "@/components/layout/FlowRail";
import { MobileNav } from "@/components/layout/MobileNav";
import { MobileHeader } from "@/components/layout/MobileHeader";
import { Footer } from "@/components/layout/Footer";
import { RouteLoader } from "@/components/shared/RouteLoader";

export function AppLayout() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Sidebar for desktop navigation */}
      <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed(!collapsed)} />

      {/* Main content wrapper */}
      <div className="flex h-screen flex-1 flex-col overflow-hidden" style={{ minWidth: 0 }}>
        {/* Mobile top header - only visible on small screens */}
        <MobileHeader />

        {/* Pipeline strip — sticky below mobile header or at top of screen on desktop */}
        <FlowRail />

        {/* Scrollable content area */}
        <div
          className="flex-1 overflow-y-auto scrollbar-thin"
          style={{ minWidth: 0 }}
        >
          <main className="flex flex-1 flex-col pb-20 lg:pb-4">
            <AnimatePresence mode="wait">
              <Suspense fallback={<RouteLoader />}>
                <Outlet key={location.pathname} />
              </Suspense>
            </AnimatePresence>
            {location.pathname !== "/calendar" && <Footer />}
          </main>
        </div>

        {/* Mobile bottom navigation — fixed, only visible on small screens */}
        <MobileNav />
      </div>
    </div>
  );
}

