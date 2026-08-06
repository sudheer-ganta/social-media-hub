import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ImageUp, PenSquare, Sparkles, type LucideIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface QuickAction {
  label: string;
  description: string;
  icon: LucideIcon;
  to?: string;
  onClick?: () => void;
  accent: string;
}

const ACTIONS: QuickAction[] = [
  {
    label: "Create Post",
    description: "Start from a blank canvas",
    icon: PenSquare,
    to: "/posts/new",
    accent: "bg-primary/10 text-primary",
  },
  {
    label: "Generate AI",
    description: "Let AI write captions & hashtags",
    icon: Sparkles,
    to: "/posts/new",
    accent: "bg-warning/10 text-warning",
  },
  {
    label: "Upload Images",
    description: "Add media to a new post",
    icon: ImageUp,
    to: "/posts/new",
    accent: "bg-success/10 text-success",
  },
];

export function QuickActions() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
        <CardDescription>Jump straight into the work</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {ACTIONS.map((action, index) => {
          const Icon = action.icon;
          const inner = (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="flex w-full items-center gap-3 rounded-md border p-3 text-left transition-all hover:-translate-y-0.5 hover:bg-accent/50 hover:shadow-soft"
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${action.accent}`}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{action.label}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {action.description}
                </span>
              </span>
            </motion.div>
          );

          return action.to ? (
            <Link key={action.label} to={action.to}>
              {inner}
            </Link>
          ) : (
            <button key={action.label} type="button" onClick={action.onClick}>
              {inner}
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
