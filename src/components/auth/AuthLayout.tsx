import { motion } from "framer-motion";
import { CalendarClock, ImageUp, Send, Sparkles } from "lucide-react";
import { SupabaseNotice } from "@/components/shared/SupabaseNotice";
import { isSupabaseConfigured } from "@/lib/supabase";
import { Footer } from "@/components/layout/Footer";

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

const HIGHLIGHTS = [
  { icon: CalendarClock, text: "Plan a month of content in one sitting" },
  { icon: ImageUp, text: "Drag, drop and reuse media everywhere" },
  { icon: Send, text: "Publish to five platforms from one place" },
];

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-primary lg:block">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-accent-foreground/80" />
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.25) 0, transparent 40%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.18) 0, transparent 45%)",
          }}
        />
        <div className="relative flex h-full flex-col justify-between p-10 text-primary-foreground">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
              <Sparkles className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold">Flow Post</span>
          </div>

          <div className="space-y-6">
            <motion.h2
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="max-w-md text-3xl font-bold leading-tight"
            >
              Every platform. One calm workspace.
            </motion.h2>
            <div className="space-y-3">
              {HIGHLIGHTS.map(({ icon: Icon, text }, index) => (
                <motion.div
                  key={text}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + index * 0.1 }}
                  className="flex items-center gap-3 text-sm text-primary-foreground/90"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
                    <Icon className="h-4 w-4" />
                  </span>
                  {text}
                </motion.div>
              ))}
            </div>
          </div>

          <p className="text-xs text-primary-foreground/70">
            © {new Date().getFullYear()} Flow Post
          </p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-4 py-10 sm:px-8 relative">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-md"
        >
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary shadow-glow">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-bold">Flow Post</span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>

          <div className="mt-8">
            {isSupabaseConfigured() ? children : <SupabaseNotice />}
          </div>
        </motion.div>
        <div className="absolute bottom-4 w-full">
          <Footer />
        </div>
      </div>
    </div>
  );
}
