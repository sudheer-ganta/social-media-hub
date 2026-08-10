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
    <div className="flex h-screen w-full overflow-hidden">
      <BootSequence />
      <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed(!collapsed)} />
      {/* Inner column fills all remaining width via flex-1 and scrolls independently */}
      <div className="flex h-screen flex-1 flex-col overflow-y-auto scrollbar-thin" style={{ minWidth: 0, maxWidth: "100%" }}>
        <MobileHeader />
        <main className="flex flex-1 flex-col pb-28 lg:pb-0">
          <AnimatePresence mode="wait">
            <Outlet key={location.pathname} />
          </AnimatePresence>
        </main>
        {location.pathname !== "/calendar" && <Footer />}
        <MobileNav />
      </div>
    </div>
  );
}
