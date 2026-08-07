import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { getSupabase } from "./lib/supabase";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

(async () => {
  try {
    const supabase = getSupabase();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    
    const token = session?.access_token;
    
    const res = await fetch("http://localhost:5000/me", {
      headers: token ? {
        Authorization: `Bearer ${token}`,
      } : {},
    });
    
    console.log(`Status: ${res.status}`);
    console.log(await res.json());
  } catch (err) {
    console.error("CORS or fetch error:", err);
  }
})();
