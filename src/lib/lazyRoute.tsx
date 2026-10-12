import { lazy, type ComponentType } from "react";

/**
 * React.lazy that can be resolved ahead of time.
 *
 * Hydrating a prerendered page with a plain lazy component makes React throw the
 * server HTML away and show the Suspense fallback until the chunk arrives. For
 * prerendered routes, main.tsx awaits `preload()` first; after that the page
 * renders synchronously and matches the server markup. Without a preload (the
 * server, client-side navigation) it behaves exactly like React.lazy.
 */
export function lazyRoute<P extends object>(
  factory: () => Promise<{ default: ComponentType<P> }>,
) {
  let loaded: ComponentType<P> | null = null;
  const remember = (mod: { default: ComponentType<P> }) => {
    loaded = mod.default;
    return mod;
  };
  const Lazy = lazy(() => factory().then(remember));

  function Route(props: P) {
    const Loaded = loaded;
    return Loaded ? <Loaded {...props} /> : <Lazy {...(props as P & object)} />;
  }
  Route.preload = () => factory().then(remember);
  return Route;
}
