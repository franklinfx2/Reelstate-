// GET /functions/v1/status/:uploadId
// Lightweight polling endpoint for the frontend — RLS only lets the
// public read a row once status = 'ready', so the client needs this to
// see 'pending'/'generating'/'failed' too. Returns only status + urls,
// never the property/agent details (those only appear on the listing
// page once truly ready).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const uploadId = new URL(req.url).pathname.split("/").filter(Boolean).pop();
  if (!uploadId) {
    return jsonResponse({ error: "Missing uploadId in path" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: upload, error } = await supabase
    .from("uploads")
    .select("status, walkthrough_video_url, reels_video_url")
    .eq("id", uploadId)
    .maybeSingle();

  if (error) return jsonResponse({ error: error.message }, 500);
  if (!upload) return jsonResponse({ error: "Upload not found" }, 404);

  return jsonResponse(
    {
      uploadId,
      status: upload.status,
      walkthrough_url: upload.walkthrough_video_url,
      reels_url: upload.reels_video_url,
    },
    200,
  );
});

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
