import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Masthead } from "@/components/layout/Masthead";
import { Sidebar } from "@/components/layout/Sidebar";
import { FlowRail } from "@/components/layout/FlowRail";
import { MobileNav } from "@/components/layout/MobileNav";
import { Footer } from "@/components/layout/Footer";
import { BootSequence } from "@/components/brand/BootSequence";

export function AppLayout() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen">
      <BootSequence />
      <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed(!collapsed)} />
      <div className="flex min-h-screen flex-1 flex-col min-w-0">
        {/* Bottom padding clears the mobile nav. */}
        <main className="flex flex-1 flex-col pb-20 lg:pb-0">
          <AnimatePresence mode="wait">
            <Outlet key={location.pathname} />
          </AnimatePresence>
        </main>
        <Footer />
        <MobileNav />
      </div>
    </div>
  );
}
