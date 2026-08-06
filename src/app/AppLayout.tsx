import { useCallback, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";

const COLLAPSE_KEY = "sch-sidebar-collapsed";

export function AppLayout() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSE_KEY) === "1",
  );

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  return (
    <div className="flex min-h-screen">
      <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapse} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1">
          <AnimatePresence mode="wait">
            <Outlet key={location.pathname} />
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
