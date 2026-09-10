// POST /functions/v1/upload
// Accepts a multipart form (video, photos[], property details), stores the
// files in Supabase Storage, and creates the uploads row with status
// 'pending'. Uses the service-role key since this is a trusted server-side
// write path — the anon key has no insert/storage-write access (see
// supabase/schema.sql).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const REQUIRED_TEXT_FIELDS = [
  "address",
  "property_type",
  "price",
  "agent_name",
  "agent_phone",
] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const form = await req.formData();

    const missing = REQUIRED_TEXT_FIELDS.filter((field) => !form.get(field));
    const video = form.get("video");
    if (!(video instanceof File) || video.size === 0) {
      missing.push("video");
    }
    if (missing.length > 0) {
      return jsonResponse(
        { error: `Missing required field(s): ${missing.join(", ")}` },
        400,
      );
    }

    const price = Number(form.get("price"));
    if (!Number.isFinite(price) || price < 0) {
      return jsonResponse(
        { error: "price must be a non-negative number" },
        400,
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const uploadId = crypto.randomUUID();
    const videoFile = video as File;

    const videoPath = `${uploadId}/${sanitizeFilename(videoFile.name)}`;
    const { error: videoError } = await supabase.storage
      .from("videos")
      .upload(videoPath, videoFile, {
        contentType: videoFile.type || "video/mp4",
        upsert: true,
      });
    if (videoError) {
      throw new Error(`Video upload failed: ${videoError.message}`);
    }
    const videoUrl =
      supabase.storage.from("videos").getPublicUrl(videoPath).data.publicUrl;

    const photoFiles = form
      .getAll("photos")
      .filter((f): f is File => f instanceof File && f.size > 0);

    const photoUrls: string[] = [];
    for (let i = 0; i < photoFiles.length; i++) {
      const photo = photoFiles[i];
      const photoPath = `${uploadId}/${i}-${sanitizeFilename(photo.name)}`;
      const { error: photoError } = await supabase.storage
        .from("photos")
        .upload(photoPath, photo, {
          contentType: photo.type || "image/jpeg",
          upsert: true,
        });
      if (photoError) {
        throw new Error(`Photo upload failed: ${photoError.message}`);
      }
      photoUrls.push(
        supabase.storage.from("photos").getPublicUrl(photoPath).data
          .publicUrl,
      );
    }

    const { error: insertError } = await supabase.from("uploads").insert({
      id: uploadId,
      video_file_url: videoUrl,
      photos_array: photoUrls,
      address: form.get("address"),
      property_type: form.get("property_type"),
      furnishing: form.get("furnishing") || null,
      price,
      agent_name: form.get("agent_name"),
      agent_phone: form.get("agent_phone"),
      agent_whatsapp: form.get("agent_whatsapp") || null,
      description: form.get("description") || null,
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

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "-");
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
