import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fails loudly at build/dev time rather than silently rendering a broken app —
  // easy to hit if .env.local is missing or a GitHub Actions secret isn't wired up.
  throw new Error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Add them to .env.local for local dev, " +
    "or as repo secrets for the GitHub Actions build."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
