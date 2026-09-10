# Reelstate video service

Real video-editing pipeline (ffmpeg) that Supabase Edge Functions can't run
directly. Deployed separately (Render) and called by the `generate` Edge
Function in `../supabase/functions/generate`.

## What it does

Takes a raw walkthrough video, produces a vertical marketing video:
cropped to 1080x1920, a rotating pool of short captions faded in/out every
~6 seconds (matching the style of a manually-edited reference video —
centered, white text, drop shadow, no price/location burned in), a
persistent "Reelstate" watermark, and a 2-second blue logo outro card.
Uploads the result to the `videos` bucket in Supabase Storage and returns
its public URL.

## API

`GET /health` — liveness check, no auth.

`POST /process` — requires header `x-service-token: <SERVICE_TOKEN>`.
Body: `{ "uploadId": "...", "videoUrl": "https://.../raw-video.mp4" }`.
Returns: `{ "uploadId", "processedVideoUrl", "duration", "captions" }`.

## Environment variables

- `SERVICE_TOKEN` — shared secret; only callers that know this can hit `/process`.
- `SUPABASE_URL` — the Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY` — service-role key, used to upload the
  processed video to Storage (bypasses RLS, so never expose this to a client).
- `PORT` — optional, defaults to 8080 (Render sets this automatically).

## Local testing

```bash
npm install
SERVICE_TOKEN=test SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm start
curl -X POST http://localhost:8080/process \
  -H "content-type: application/json" -H "x-service-token: test" \
  -d '{"uploadId":"test","videoUrl":"https://.../some-video.mp4"}'
```

Or exercise just the render pipeline without a server/network:
`node test-render.mjs` (renders `/tmp/testassets/test.mp4`).

## Deploying

This lives in a subdirectory of the `Reelstate-` monorepo. `render.yaml`
at the repo root describes it as a Render Blueprint service with
`rootDir: video-service` — create it in Render via **New > Blueprint**,
pointing at this repo, and fill in the `SERVICE_TOKEN` and
`SUPABASE_SERVICE_ROLE_KEY` secrets when prompted (they're marked
`sync: false` in render.yaml so Render asks for them rather than storing
a default).
