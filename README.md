This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

Copy `.env.example` to `.env.local` and fill in your Supabase project's URL
and anon key (Settings -> API in the Supabase dashboard). `ANTHROPIC_API_KEY`
is optional — without it, marketing copy generation falls back to a template.

The schema (`properties`, `media`, `generated_content` tables, RLS policies,
and the `property-media` storage bucket) lives in
`supabase/migrations/20260908000000_initial_schema.sql`. Apply it to a fresh
project via the Supabase CLI (`supabase db push`) or the SQL editor.

Video processing (`src/lib/video.ts`) shells out to `ffmpeg` — install it
separately (`apt-get install ffmpeg` / `brew install ffmpeg`).

> **Note:** the Next.js app above (server actions + `properties`/`media`/
> `generated_content` in Supabase project `vxkgjaoryhymphpvfesd`) is not yet
> wired to the Edge Function backend described below (`uploads`/`captions`
> in a separate Supabase project). They're two independent backends right
> now — see "Edge function backend" for the second one.

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Edge function backend

`supabase/` also contains a second, standalone backend built on Supabase
Edge Functions, targeting a different Supabase project
(`https://hmqnpidncvylrwmsctxm.supabase.co`) with an `uploads`/`captions`
schema:

- `supabase/schema.sql` — tables, RLS, and the `videos`/`photos` storage
  buckets.
- `supabase/functions/upload` — `POST /functions/v1/upload`: stores the
  video + photos and creates a `pending` upload row.
- `supabase/functions/generate` — `POST /functions/v1/generate/:uploadId`:
  calls Kling AI (falls back to a placeholder if `KLING_API_KEY` isn't set)
  and marks the upload `ready`.
- `supabase/functions/listing` — `GET /functions/v1/listing/:uploadId`:
  renders the shareable HTML listing page.
- `supabase/supabaseClient.js` — plain JS client, reads `SUPABASE_URL` /
  `SUPABASE_ANON_KEY` from `supabase/.env` (copy `supabase/.env.example`).

### Deploying

```bash
npm install -g supabase
supabase login
supabase link --project-ref hmqnpidncvylrwmsctxm

# Apply the schema — paste supabase/schema.sql into the SQL editor, or:
supabase db push --include-all

# Deploy the functions
supabase functions deploy upload
supabase functions deploy generate
supabase functions deploy listing

# Optional — enables the real Kling AI call in supabase/functions/generate
supabase secrets set KLING_API_KEY=your-key
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are
injected automatically into deployed Edge Functions by Supabase — nothing
to configure for those. The functions use the service-role key (not the
anon key) for writes, since the schema's RLS only grants the public
read access to listings once `status = 'ready'`.

### Testing

```bash
curl -X POST https://hmqnpidncvylrwmsctxm.supabase.co/functions/v1/upload \
  -H "apikey: sb_publishable_DjcUjyqEhkIXI43GSxbbBw_ZFBLK6FZ" \
  -F "video=@raw.mp4" -F "photos=@photo1.jpg" \
  -F "address=East Legon, Accra" -F "property_type=apartment" \
  -F "price=2500" -F "agent_name=Kwame Mensah" -F "agent_phone=0244123456"

curl -X POST https://hmqnpidncvylrwmsctxm.supabase.co/functions/v1/generate/<uploadId> \
  -H "apikey: sb_publishable_DjcUjyqEhkIXI43GSxbbBw_ZFBLK6FZ"

curl https://hmqnpidncvylrwmsctxm.supabase.co/functions/v1/listing/<uploadId>
```

## Photos-only video generation (Kling AI)

A third, separate flow: agents upload 5+ property photos (no walkthrough
video required) and get back an AI-generated cinematic video. It's additive
— the raw-video pipelines above are untouched — and lives on the same
Supabase project as the Edge function backend (`hmqnpidncvylrwmsctxm`):

- `supabase/reel_schema.sql` — `reel_projects`/`reel_photos`/`reel_clips`
  tables and the `property-photos`/`generated-videos` storage buckets. Apply
  it the same way as `schema.sql` (SQL editor, or `supabase db push`).
- `supabase/functions/reel-upload-url`, `reel-upload` — signed photo uploads
  + project creation, mirroring `upload-url`/`upload`.
- `supabase/functions/reel-generate` — one Claude vision call analyzes every
  photo, selects the best 5 (highest quality, diverse features), and writes
  a Kling prompt + short caption for each; then dispatches the
  `reel-process-video.yml` GitHub Actions workflow.
- `supabase/functions/reel-status` — polling endpoint for the frontend.
- `video-service/kling.js`, `reel-assemble.js`, `music.js`, `reel-run-job.mjs`
  — the workflow's job: generate each clip via Kling AI, color-grade +
  caption-overlay + crossfade them together behind a title card, mix in a
  synthesized ambient music bed (swap in a real licensed track via
  `MUSIC_BED_PATH`), upload the final MP4.
- `src/app/reel/new`, `src/app/reel/[projectId]` — upload form and
  processing/results pages in the Next.js app, talking to the Edge Functions
  above via `NEXT_PUBLIC_REEL_SUPABASE_URL`/`NEXT_PUBLIC_REEL_SUPABASE_ANON_KEY`.

### Required secrets

Supabase project secrets (`supabase secrets set ...`): `ANTHROPIC_API_KEY`,
`GH_PAT`, `GH_OWNER`, `GH_REPO`, `GH_REPO_REF` (same ones `functions/generate`
already needs). GitHub Actions repo secrets: `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `KLING_ACCESS_KEY`, `KLING_SECRET_KEY` (Kling
Open Platform access/secret key pair — not a single API key), and optionally
a `KLING_API_BASE` repo variable.

Note: the Kling client and prompt/duration choices in this flow haven't been
exercised against a live Kling account — there was no API key available to
test with while building it. Verify `video-service/kling.js`'s request/
response shape against your account's Kling API version before relying on it
in production.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
