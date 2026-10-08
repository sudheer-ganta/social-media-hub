import type { ReactNode } from "react";
import "@fontsource-variable/geist";
import "@/components/dashboard/dashboard.css";
import { Footer } from "@/components/layout/Footer";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { cn } from "@/lib/utils";

interface PublicPageProps {
  title: string;
  intro?: string;
  children: ReactNode;
  /** Reading width. Legal text stays narrow; pages with boxes can go wider. */
  width?: "narrow" | "wide";
}

/**
 * Shared shell for signed-out document pages (Privacy, Terms, Data Deletion):
 * the same paper, type and header as the rest of Rally, so a visitor who clicks
 * a footer link has not left the product.
 */
export function PublicPage({ title, intro, children, width = "narrow" }: PublicPageProps) {
  return (
    <div className="rd rd-app flex min-h-[100dvh] flex-col bg-rl-bg text-foreground">
      <PublicHeader />
      <main
        className={cn(
          "mx-auto w-full flex-1 px-4 pb-20 pt-10 sm:px-8 sm:pt-14",
          width === "narrow" ? "max-w-[820px]" : "max-w-[960px]",
        )}
      >
        <h1 className="text-[clamp(36px,5vw,60px)] font-extrabold leading-[1.02] tracking-[-0.05em]">
          {title}
          <span className="text-rl-accent">.</span>
        </h1>
        {intro && (
          <p className="mt-4 max-w-[62ch] text-[17px] leading-relaxed text-muted-foreground">{intro}</p>
        )}
        <div className="mt-10">{children}</div>
      </main>
      <Footer />
    </div>
  );
}

/** One numbered clause of a legal document. */
export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="border-t border-border py-7 first:border-t-0 first:pt-0">
      <h2 className="text-xl font-bold tracking-tight">{heading}</h2>
      <p className="mt-3 max-w-[68ch] leading-relaxed text-muted-foreground">{children}</p>
    </section>
  );
}
