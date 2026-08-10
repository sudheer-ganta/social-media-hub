import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { MobileHeader } from "@/components/layout/MobileHeader";
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
        <MobileHeader />
        {/* Bottom padding clears mobile navigation bar & iOS Safari address bar. */}
        <main className="flex flex-1 flex-col pb-28 lg:pb-0">
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
