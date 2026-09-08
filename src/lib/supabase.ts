import { createClient } from "@supabase/supabase-js";

// Server-side only client. MVP has no agent auth yet, so RLS on this
// project is intentionally open (see supabase migrations) — never import
// this in a Client Component or route that ships to the browser bundle.
export function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_ANON_KEY in environment."
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

export const STORAGE_BUCKET =
  process.env.SUPABASE_STORAGE_BUCKET ?? "property-media";
