import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  // Helpful console message during local dev if env vars are missing.
  console.warn(
    "Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY " +
    "in a .env file (local) or in Vercel project settings (deployed)."
  );
}

export const supabase = createClient(url || "", key || "");
