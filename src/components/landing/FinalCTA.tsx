import { useRef } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { photos } from "./data";
import { Magnetic, MaskLines, RallyMark, Reveal, useLandingScroll } from "./primitives";

/**
 * Rally Footer & Final CTA — exact specs
 * - Container: 100% viewport, 1320px max content, 64px desktop / 40px tablet / 24px mobile
 * - Background: #171717 with atmospheric photography overlay
 * - Colors: Text #FBFAF7, Muted #C8C5BE, Accent #FF4D32, Border #716F6A
 * - 12-column grid layout with left-aligned hierarchy
 */
export function FinalCTA() {
  const scrollRef = useLandingScroll();
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    container: scrollRef,
    target: ref,
    offset: ["start end", "end end"],
  });
  const imageY = useTransform(scrollYProgress, [0, 1], [reduce ? 0 : -40, 0]);

  return (
    <footer ref={ref} className="relative w-full overflow-hidden bg-[#171717] text-[#FBFAF7]">
      {/* Background photography with parallax & gradient overlay for crystal clear contrast */}
      <motion.img
        src={photos.living}
        alt="Rally mood"
        loading="lazy"
        style={{ y: imageY }}
        className="absolute inset-0 h-[125%] w-full object-cover object-center opacity-70 pointer-events-none select-none"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-[#171717] via-[#171717]/80 to-[#171717]/35 pointer-events-none" />

      {/* Main Content Area */}
      <div className="relative z-10 mx-auto w-full max-w-[1320px] px-6 sm:px-10 lg:px-16 py-16 sm:py-20 lg:py-[80px]">
        <div className="grid grid-cols-1 items-end gap-8 sm:gap-10 lg:grid-cols-12 lg:gap-12 min-h-[160px]">
          
          {/* LEFT 7 columns: Eyebrow + Main heading */}
          <div className="lg:col-span-7 flex flex-col justify-end">
            {/* Eyebrow: 11px / 600 / 0.18em uppercase #C8C5BE with 6px #FF4D32 dot */}
            <div className="flex items-center gap-2 mb-5">
              <span className="h-[6px] w-[6px] rounded-full bg-[#FF4D32] shrink-0" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#C8C5BE] font-sans">
                GET STARTED
              </span>
            </div>

            {/* Main heading: clamp(48px, 5vw, 72px) / 700 / 0.92 line-height / -0.065em letter spacing */}
            <h2 className="text-[48px] sm:text-[clamp(48px,5vw,72px)] font-bold leading-[0.92] tracking-[-0.065em] text-[#FBFAF7] font-sans">
              <MaskLines
                inView
                lines={[
                  { text: "Make something" },
                  { text: "worth posting.", accent: true }
                ]}
              />
            </h2>
          </div>

          {/* RIGHT 5 columns: Supporting text + Buttons */}
          <Reveal delay={0.12} className="lg:col-span-5 flex flex-col justify-end">
            {/* Supporting text: 16px / 400 / 1.5 line-height / #C8C5BE / max-width 420px */}
            <p className="text-[16px] font-normal leading-[1.5] text-[#C8C5BE] max-w-[420px] mb-6 font-sans">
              Rally gives your brand a place to go.
            </p>

            {/* Buttons: 48px height / 10px radius / 12px gap */}
            <div className="flex flex-wrap items-center gap-3">
              <Magnetic>
                <Link
                  to="/register"
                  className="group inline-flex h-[48px] items-center gap-2 rounded-[10px] bg-[#FF4D32] hover:bg-[#e04027] px-5 text-[14px] font-semibold text-[#FBFAF7] transition-all duration-200 active:scale-95 shadow-md shadow-[#FF4D32]/20"
                >
                  Get started
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                </Link>
              </Magnetic>

              <Link
                to="/login"
                className="inline-flex h-[48px] items-center justify-center rounded-[10px] border border-[#716F6A] hover:border-[#FBFAF7] bg-transparent px-6 text-[14px] font-semibold text-[#FBFAF7] transition-all duration-200 active:scale-95"
              >
                Login
              </Link>
            </div>
          </Reveal>

        </div>
      </div>

      {/* Sub-footer Legal / Copyright Bar */}
      <div className="relative z-10 border-t border-white/10">
        <div className="mx-auto flex w-full max-w-[1320px] flex-col items-center justify-between gap-4 px-6 sm:px-10 lg:px-16 py-6 text-xs sm:text-sm text-[#C8C5BE] sm:flex-row">
          <div className="flex items-center gap-2 text-[#FBFAF7]">
            <RallyMark className="h-5 w-5" />
            <span className="font-semibold tracking-tight text-sm">Rally</span>
          </div>

          <nav aria-label="Legal" className="flex items-center gap-6">
            <Link to="/privacy" className="transition-colors hover:text-[#FBFAF7]">
              Privacy
            </Link>
            <Link to="/terms" className="transition-colors hover:text-[#FBFAF7]">
              Terms
            </Link>
            <Link to="/data-deletion" className="transition-colors hover:text-[#FBFAF7]">
              Data deletion
            </Link>
          </nav>

          <p className="text-[#C8C5BE]">&copy; 2026 Rally</p>
        </div>
      </div>
    </footer>
  );
}


