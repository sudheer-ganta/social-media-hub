import { useCallback, useSyncExternalStore } from "react";

/**
 * useSyncExternalStore so that hydrating prerendered HTML uses the server value
 * (false: the server has no viewport) for the first pass and then switches to the
 * real one, instead of rendering a different tree and forcing React to discard
 * the static markup. Outside hydration it reads the live value immediately.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 1023px)");
}
