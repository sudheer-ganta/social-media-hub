import { useRef } from "react";
import "@fontsource-variable/geist";
import "@/components/landing/landing.css";
import { AIAssistance } from "@/components/landing/AIAssistance";
import { BrandIntelligence } from "@/components/landing/BrandIntelligence";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { FlowSection } from "@/components/landing/flow/FlowSection";
import { HeroSection } from "@/components/landing/hero/HeroSection";
import { LandingNav } from "@/components/landing/LandingNav";
import { LandingScrollContext } from "@/components/landing/primitives";

/**
 * Public homepage, shown at "/" to signed-out visitors.
 * Always cream and ink with orange, whatever the OS or app theme is.
 * The app locks html/body to overflow:hidden, so this page owns its scroll container.
 */
export default function Landing() {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <LandingScrollContext.Provider value={scrollRef}>
      <div ref={scrollRef} className="rl fixed inset-0 overflow-y-auto overflow-x-hidden">
        <LandingNav />
        <main>
          <HeroSection />
          <FlowSection />
          <BrandIntelligence />
          <AIAssistance />
        </main>
        <FinalCTA />
      </div>
    </LandingScrollContext.Provider>
  );
}
