// POST /functions/v1/upload
// Creates the uploads row with status 'pending'. Expects the video and
// photos to already be uploaded to Storage via signed URLs from
// /functions/v1/upload-url — this function only ever receives small JSON
// (paths + text fields), never raw file bytes, so it can't crash or drop
// mid-transfer on a large video the way the old multipart-body version did.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const REQUIRED_TEXT_FIELDS = [
  "address",
  "property_type",
  "price",
  "agent_name",
  "agent_phone",
  "videoPath",
] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // deno-lint-ignore no-explicit-any
  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const missing = REQUIRED_TEXT_FIELDS.filter((field) => !body[field]);
  if (missing.length > 0) {
    return jsonResponse({ error: `Missing required field(s): ${missing.join(", ")}` }, 400);
  }

  const price = Number(body.price);
  if (!Number.isFinite(price) || price < 0) {
    return jsonResponse({ error: "price must be a non-negative number" }, 400);
  }

  const photoPaths: string[] = Array.isArray(body.photoPaths) ? body.photoPaths : [];
  if (photoPaths.length === 0) {
    return jsonResponse({ error: "At least one photo is required" }, 400);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const uploadId: string = body.uploadId || crypto.randomUUID();

    const videoUrl = supabase.storage.from("videos").getPublicUrl(body.videoPath).data
      .publicUrl;
    const photoUrls = photoPaths.map(
      (path) => supabase.storage.from("photos").getPublicUrl(path).data.publicUrl,
    );

    const { error: insertError } = await supabase.from("uploads").insert({
      id: uploadId,
      video_file_url: videoUrl,
      photos_array: photoUrls,
      address: body.address,
      property_type: body.property_type,
      furnishing: body.furnishing || null,
      price,
      agent_name: body.agent_name,
      agent_phone: body.agent_phone,
      agent_whatsapp: body.agent_whatsapp || null,
      description: body.description || null,
      status: "pending",
    });
    if (insertError) {
      throw new Error(`Could not save upload: ${insertError.message}`);
    }

    return jsonResponse({ uploadId, status: "pending" }, 201);
  } catch (err) {
    console.error("upload function error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      500,
    );
  }
});

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
