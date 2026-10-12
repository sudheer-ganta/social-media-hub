import { StaticRouter } from "react-router-dom";
import { prerender } from "react-dom/static";
import { AppRoutes } from "@/App";
import { AppProviders } from "@/app/providers";

/**
 * Build-time only (vite build --ssr). Renders a public route to an HTML string.
 * No user, session or API data exists here: auth is never resolved on the
 * server, so only signed-out, public markup can be produced.
 */
export async function render(url: string): Promise<string> {
  const { prelude } = await prerender(
    <AppProviders>
      <StaticRouter location={url}>
        <AppRoutes />
      </StaticRouter>
    </AppProviders>,
  );
  const reader = prelude.getReader();
  const decoder = new TextDecoder();
  let html = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    html += decoder.decode(value, { stream: true });
  }
  return html + decoder.decode();
}
