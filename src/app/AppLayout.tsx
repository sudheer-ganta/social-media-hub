import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Masthead } from "@/components/layout/Masthead";
import { FlowRail } from "@/components/layout/FlowRail";
import { MobileNav } from "@/components/layout/MobileNav";
import { Footer } from "@/components/layout/Footer";

export function AppLayout() {
  const location = useLocation();

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden">
      {/* Desktop + mobile top navigation */}
      <Masthead />

      {/* Pipeline strip — sticky below masthead on all viewports */}
      <FlowRail />

      {/* Scrollable content area */}
      <div
        className="flex flex-1 flex-col overflow-y-auto scrollbar-thin"
        style={{ minWidth: 0 }}
      >
        <main className="flex flex-1 flex-col pb-20 lg:pb-4">
          <AnimatePresence mode="wait">
            <Outlet key={location.pathname} />
          </AnimatePresence>
          {location.pathname !== "/calendar" && <Footer />}
        </main>

        {/* Mobile bottom navigation — fixed, only visible on small screens */}
        <MobileNav />
      </div>
    </div>
  );
}
