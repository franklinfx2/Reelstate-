# Reelstate

A property video order service. There is no automatic video generation —
this is a manual-fulfillment workflow, on purpose:

1. A client uploads their property photos at `/order`, sees a price
   instantly, and gets Mobile Money payment instructions with an order
   they can track at `/track/[id]`.
2. You review new orders at `/admin`, confirm payment once it arrives,
   download the client's photos, and edit the video by hand.
3. You upload the finished video back through `/admin` — the client sees
   it appear on their tracking page and downloads it from there.

Same channel in, same channel out. No AI generation pipeline, no
third-party video API, nothing automatic in between.

## Getting started

1. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from your
     Supabase project (Settings → API). The service-role key is used
     server-side only — see "Data model" below for why.
   - `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` (pick your own; generate
     the secret with `openssl rand -hex 32`) to log into `/admin`.
   - `PAYMENT_MOMO_NUMBER` and `PAYMENT_MOMO_NAME` — shown to clients on
     their tracking page as payment instructions.
2. Apply `supabase/migrations/20260914000000_orders_schema.sql` to your
   Supabase project via the SQL editor or `supabase db push`. It creates
   the `orders`/`order_photos` tables and the `order-photos` (private) /
   `order-videos` (public) storage buckets.
3. `npm install && npm run dev`, then open `/order` to place a test order
   and `/admin` to work it.

## Pricing

Bands live in `src/lib/pricing.ts` — 5–10 photos, 11–18, 19–28, or a
custom quote above that / for bespoke edit requests. Edit that file to
change prices or thresholds.

## Data model

`orders` and `order_photos` have Row Level Security enabled with **no**
policies at all — the anon key can't read or write them under any
circumstance. Every read and write goes through `supabaseAdmin()`
(`src/lib/supabase.ts`), a service-role client used only inside server
actions and server components (`src/app/order`, `src/app/track`,
`src/app/admin`), so client photos, payment status, and order data are
never reachable from the browser.

`/admin` itself is gated by a signed, HMAC-verified session cookie
(`src/lib/admin-auth.ts`), checked on every admin page and server action.
