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

// Service-role client — bypasses RLS entirely. Only ever import this in
// server actions/pages under src/app/order or src/app/admin, never in a
// Client Component. Orders/order_photos have no anon-key RLS policies at
// all, so this is the only client that can read or write them.
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment."
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

export const ORDER_PHOTOS_BUCKET =
  process.env.SUPABASE_ORDER_PHOTOS_BUCKET ?? "order-photos";
export const ORDER_VIDEOS_BUCKET =
  process.env.SUPABASE_ORDER_VIDEOS_BUCKET ?? "order-videos";
