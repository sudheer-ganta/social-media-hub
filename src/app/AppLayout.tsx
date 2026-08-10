import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { MobileHeader } from "@/components/layout/MobileHeader";
import { Footer } from "@/components/layout/Footer";

export function AppLayout() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed(!collapsed)} />
      {/* Inner column fills all remaining width via flex-1 */}
      <div className="flex min-h-screen flex-1 flex-col" style={{ minWidth: 0, maxWidth: "100%" }}>
        <MobileHeader />
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
