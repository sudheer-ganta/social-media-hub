import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

/** Only rendered when something failed to publish. Peach, so it reads as a flag and not a panel. */
export function AttentionCard({ failed }: { failed: number }) {
  if (failed <= 0) return null;
  return (
    <Link
      to="/posts"
      className="group flex items-center justify-between gap-4 rounded-[18px] bg-rl-soft p-6 transition-transform duration-300 hover:-translate-y-0.5"
    >
      <span>
        <span className="rd-numeral block text-[40px] text-rl-accent-strong">{failed}</span>
        <span className="mt-1.5 block text-[15px] font-semibold tracking-[-0.02em]">
          {failed === 1 ? "post failed to publish" : "posts failed to publish"}
        </span>
        <span className="mt-0.5 block text-[13px] text-rl-ink/65">Open the library to retry them.</span>
      </span>
      <ArrowRight className="h-5 w-5 shrink-0 text-rl-accent-strong transition-transform duration-300 group-hover:translate-x-1" />
    </Link>
  );
}
