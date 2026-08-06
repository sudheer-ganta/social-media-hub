import { useEffect, type RefObject } from "react";

/** Grow a textarea to fit its content as the user types. */
export function useAutoResize(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  minHeight = 220,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, minHeight)}px`;
  }, [ref, value, minHeight]);
}
