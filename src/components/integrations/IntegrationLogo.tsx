import { PlatformIcon } from "@/components/shared/PlatformIcon";
import type { IntegrationId } from "@/constants/integrations";
import type { Platform } from "@/types";
import { cn } from "@/lib/utils";

interface IntegrationLogoProps {
  id: IntegrationId;
  className?: string;
}

/** Networks whose glyph {@link PlatformIcon} already draws. */
const SHARED_WITH_PLATFORM_ICON = new Set<string>([
  "linkedin",
  "instagram",
  "facebook",
  "x",
]);

/**
 * Brand glyph for a provider card. Falls through to {@link PlatformIcon} for
 * the networks the composer already draws, so there is one source of truth for
 * those paths; only the video networks — which aren't publishing targets yet —
 * are drawn here.
 */
export function IntegrationLogo({ id, className }: IntegrationLogoProps) {
  const cls = cn("h-4 w-4 fill-current", className);

  if (SHARED_WITH_PLATFORM_ICON.has(id)) {
    return <PlatformIcon platform={id as Platform} className={className} />;
  }

  switch (id) {
    case "youtube":
      return (
        <svg viewBox="0 0 24 24" className={cls} aria-hidden="true">
          <path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19C0 8.08 0 12 0 12s0 3.92.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14C24 15.92 24 12 24 12s0-3.92-.5-5.81zM9.55 15.57V8.43L15.82 12l-6.27 3.57z" />
        </svg>
      );
    default:
      /**
       * A network the backend catalogues but this file has no glyph for.
       *
       * The brand mark is the one per-provider thing that cannot travel over
       * JSON, so it is also the one thing that can lag behind the catalogue. A
       * neutral badge — the network's initial on its brand-coloured tile — means
       * a new provider renders correctly on day one and only loses a little
       * polish until its path is added.
       */
      return (
        <svg viewBox="0 0 24 24" className={cls} aria-hidden="true">
          <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2.2a7.8 7.8 0 1 1 0 15.6 7.8 7.8 0 0 1 0-15.6zm0 3.1a4.7 4.7 0 1 0 0 9.4 4.7 4.7 0 0 0 0-9.4z" />
        </svg>
      );
  }
}
