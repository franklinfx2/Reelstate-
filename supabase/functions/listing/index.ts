// GET /functions/v1/listing/:uploadId
// Renders a shareable HTML landing page for a property: video player,
// details, photo gallery, captions, and a WhatsApp CTA.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return htmlResponse("<h1>405 Method Not Allowed</h1>", 405);
  }

  const uploadId = new URL(req.url).pathname.split("/").filter(Boolean).pop();
  if (!uploadId) {
    return htmlResponse("<h1>400 Missing upload id</h1>", 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: upload, error } = await supabase
    .from("uploads")
    .select("*")
    .eq("id", uploadId)
    .maybeSingle();

  if (error) {
    return htmlResponse(`<h1>500 ${escapeHtml(error.message)}</h1>`, 500);
  }
  if (!upload) return htmlResponse("<h1>404 Listing not found</h1>", 404);

  if (upload.status !== "ready") {
    return htmlResponse(renderProcessingPage(upload), 200);
  }

  const { data: captions } = await supabase
    .from("captions")
    .select("timecode_start, timecode_end, caption_text")
    .eq("upload_id", uploadId)
    .order("timecode_start", { ascending: true });

  return htmlResponse(renderListingPage(upload, captions ?? []), 200);
});

// deno-lint-ignore no-explicit-any
function renderListingPage(upload: any, captions: any[]): string {
  const photos: string[] = Array.isArray(upload.photos_array)
    ? upload.photos_array
    : [];
  const whatsappNumber = String(upload.agent_whatsapp || upload.agent_phone)
    .replace(/[^0-9]/g, "");
  const whatsappMessage = encodeURIComponent(
    `Hi, I'm interested in the property at ${upload.address}. Is it still available?`,
  );

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(upload.address)} — Reelstate</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #faf8f5; color: #1a1a1a; }
  main { max-width: 640px; margin: 0 auto; padding: 24px 20px 48px; }
  video { width: 100%; border-radius: 16px; background: #000; aspect-ratio: 9 / 16; max-height: 70vh; display: block; margin: 0 auto; }
  h1 { font-size: 28px; margin: 20px 0 4px; }
  .price { font-size: 22px; font-weight: 600; margin: 8px 0 16px; }
  .meta { color: #666; margin: 0 0 20px; }
  .gallery { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin: 24px 0; }
  .gallery img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 10px; }
  .whatsapp { display: block; text-align: center; background: #d9a441; color: #1a1a1a; font-weight: 600; padding: 16px; border-radius: 12px; text-decoration: none; margin-top: 24px; }
  .captions { margin-top: 32px; border-top: 1px solid #e5e0d8; padding-top: 16px; }
  .caption-row { display: flex; gap: 12px; padding: 8px 0; font-size: 14px; }
  .caption-time { color: #999; white-space: nowrap; }
  .description { margin-top: 16px; line-height: 1.5; }
</style>
</head>
<body>
<main>
  <video src="${escapeAttr(upload.walkthrough_video_url)}" controls playsinline></video>
  <h1>${escapeHtml(upload.address)}</h1>
  <p class="meta">${escapeHtml(upload.property_type)}${upload.furnishing ? ` · ${escapeHtml(upload.furnishing)}` : ""}</p>
  <p class="price">GH₵ ${Number(upload.price).toLocaleString()}</p>
  ${upload.description ? `<p class="description">${escapeHtml(upload.description)}</p>` : ""}
  <a class="whatsapp" href="https://wa.me/${whatsappNumber}?text=${whatsappMessage}" target="_blank" rel="noopener noreferrer">
    WhatsApp ${escapeHtml(upload.agent_name)} to view
  </a>
  ${
    photos.length > 0
      ? `<div class="gallery">${
        photos.map((p) =>
          `<img src="${escapeAttr(p)}" alt="${escapeHtml(upload.address)}" />`
        ).join("")
      }</div>`
      : ""
  }
  ${
    captions.length > 0
      ? `<div class="captions">${
        captions.map((c) =>
          `<div class="caption-row"><span class="caption-time">${
            escapeHtml(c.timecode_start)
          }–${escapeHtml(c.timecode_end)}</span><span>${
            escapeHtml(c.caption_text)
          }</span></div>`
        ).join("")
      }</div>`
      : ""
  }
</main>
</body>
</html>`;
}

// deno-lint-ignore no-explicit-any
function renderProcessingPage(upload: any): string {
  const message = upload.status === "failed"
    ? "Generation failed for this listing. Please try again."
    : "Your listing is still being generated — check back in a moment.";
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><title>Reelstate — Processing</title></head>
<body style="font-family: system-ui, sans-serif; text-align: center; padding: 80px 20px;">
  <h1>${escapeHtml(message)}</h1>
  <p>Status: ${escapeHtml(upload.status)}</p>
</body>
</html>`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value: unknown): string {
  return escapeHtml(value);
}

function htmlResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
  });
}
