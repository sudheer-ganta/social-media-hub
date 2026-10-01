import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Star } from "lucide-react";
import { EASE, Magnetic, MaskLines } from "../primitives";
import { ComposerDemo } from "./ComposerDemo";

const AVATARS = [
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&auto=format&fit=crop&q=80",
];

/**
 * Hero Section — Left-side typography system & interactive right-side composer demo.
 * Background: #F4F1EA
 * Left-side: Typographically strong, quiet, editorial, exact spacing hierarchy.
 */
export function HeroSection() {
  const reduce = useReducedMotion();
  const rise = (delay: number) => ({
    initial: reduce ? (false as const) : { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.7, delay, ease: EASE },
  });

  return (
    <section className="relative w-full bg-[#F4F1EA]" aria-labelledby="hero-title">
      <div className="mx-auto w-full max-w-[1320px] px-6 sm:px-10 lg:px-16 pt-8 pb-20 lg:pt-14 lg:pb-28">
        <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-12 lg:gap-8">
          
          {/* LEFT: Typography System (520–620px) */}
          <div className="lg:col-span-6 w-full max-w-[620px] flex flex-col items-start text-left lg:pt-2">
            
            {/* Eyebrow: 11px / 600 / 0.18em / #716F6A / with #FF4D32 6px dot / mb: 24px */}
            <motion.div {...rise(0)} className="flex items-center gap-2 mb-6">
              <span className="h-[6px] w-[6px] rounded-full bg-[#FF4D32] shrink-0" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] leading-none text-[#716F6A] font-sans">
                YOUR BRAND. AMPLIFIED.
              </span>
            </motion.div>

            {/* Main headline: clamp(64px, 7vw, 104px) / 800 / 0.90 / -0.075em / max-w: 650px */}
            <h1
              id="hero-title"
              className="text-[clamp(64px,7vw,104px)] font-[800] leading-[0.90] tracking-[-0.075em] text-[#171717] font-sans max-w-[650px]"
            >
              <MaskLines
                lines={[
                  { text: "Present" },
                  { text: "your brand." },
                  { text: "Not just", accent: true },
                  { text: "your posts.", accent: true },
                ]}
              />
            </h1>

            {/* Supporting text: 17px / 400 / 1.5 / -0.01em / #716F6A / max-w: 500px / mt: 28px */}
            <motion.p
              {...rise(0.35)}
              className="mt-7 text-[17px] font-normal leading-[1.5] tracking-[-0.01em] text-[#716F6A] max-w-[500px] font-sans"
            >
              Rally turns your brand identity into social content that looks, sounds and
              feels like you — across every platform, with the power of AI.
            </motion.p>

            {/* CTA Buttons: mt: 28px / gap: 12px / height: 48px / radius: 10px */}
            <motion.div {...rise(0.45)} className="mt-7 flex flex-wrap items-center gap-3">
              <Magnetic>
                <Link
                  to="/register"
                  className="group inline-flex h-[48px] items-center gap-2 rounded-[10px] bg-[#171717] hover:bg-[#2b2b2b] px-5 text-[14px] font-semibold text-[#FBFAF7] transition-all duration-200 active:scale-95 shadow-md shadow-[#171717]/10"
                >
                  Get started with Rally
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                </Link>
              </Magnetic>

              <Link
                to="/login"
                className="inline-flex h-[48px] items-center justify-center rounded-[10px] border border-[#D9D5CC] hover:border-[#171717] bg-transparent px-6 text-[14px] font-semibold text-[#171717] transition-all duration-200 active:scale-95"
              >
                Login
              </Link>
            </motion.div>

            {/* Social Proof: Avatars + Loved by creators + 5 stars + 4.9/5 */}
            <motion.div {...rise(0.55)} className="mt-5 flex flex-wrap items-center gap-3">
              {/* Overlapping Avatars */}
              <div className="flex -space-x-2">
                {AVATARS.map((src, i) => (
                  <img
                    key={i}
                    src={src}
                    alt="Community member"
                    className="h-7 w-7 rounded-full border-2 border-[#F4F1EA] object-cover"
                  />
                ))}
              </div>

              {/* Text */}
              <span className="text-[13px] sm:text-[14px] text-[#716F6A] font-normal">
                Loved by creators, brands and teams
              </span>

              {/* 5 Stars + Rating */}
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-0.5 text-[#FF4D32]">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-[#FF4D32] stroke-none" />
                  ))}
                </div>
                <span className="text-[13px] sm:text-[14px] font-medium text-[#171717]">
                  4.9/5
                </span>
              </div>
            </motion.div>

          </div>

          {/* RIGHT: Creative System & Composer Demo */}
          <motion.div
            className="lg:col-span-6 w-full"
            initial={reduce ? false : { opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.3, ease: EASE }}
          >
            <ComposerDemo />
          </motion.div>

        </div>
      </div>
    </section>
  );
}


