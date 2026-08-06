import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export function isSupabaseConfigured(): boolean {
  if (!supabaseUrl || !supabaseAnonKey) return false;
  // Guard against common misconfiguration (e.g. pasting the Postgres
  // connection string) so the app shows setup help instead of crashing.
  try {
    const url = new URL(supabaseUrl);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

let client: SupabaseClient | null = null;

/**
 * Lazily create the Supabase client so the app can render a helpful
 * configuration screen instead of crashing when env vars are missing.
 */
export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.",
    );
  }
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey);
  }
  return client;
}
