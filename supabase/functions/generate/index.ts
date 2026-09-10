// POST /functions/v1/generate/:uploadId
// Fetches the upload, calls Kling AI to generate the walkthrough/reels
// videos, and updates the row with the results.
//
// KLING_API_KEY is not set by default. Without it, this falls back to a
// placeholder that just reuses the raw uploaded video, so the pending ->
// generating -> ready pipeline (and the listing page) can be exercised
// end-to-end before real Kling AI credentials exist. Set it with:
//   supabase secrets set KLING_API_KEY=your-key
// then replace the placeholder branch below with a real call once you know
// Kling's actual request/response shape.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
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

  const { data: upload, error: fetchError } = await supabase
    .from("uploads")
    .select("*")
    .eq("id", uploadId)
    .maybeSingle();

  if (fetchError) return jsonResponse({ error: fetchError.message }, 500);
  if (!upload) return jsonResponse({ error: "Upload not found" }, 404);

  await supabase.from("uploads").update({ status: "generating" }).eq(
    "id",
    uploadId,
  );

  try {
    const { walkthroughUrl, reelsUrl } = await generateVideos(upload);

    const { error: updateError } = await supabase
      .from("uploads")
      .update({
        walkthrough_video_url: walkthroughUrl,
        reels_video_url: reelsUrl,
        status: "ready",
      })
      .eq("id", uploadId);
    if (updateError) throw new Error(updateError.message);

    return jsonResponse(
      {
        uploadId,
        status: "ready",
        walkthrough_url: walkthroughUrl,
        reels_url: reelsUrl,
      },
      200,
    );
  } catch (err) {
    console.error("generate function error:", err);
    await supabase.from("uploads").update({ status: "failed" }).eq(
      "id",
      uploadId,
    );
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Generation failed" },
      500,
    );
  }
});

// deno-lint-ignore no-explicit-any
async function generateVideos(upload: any) {
  const klingApiKey = Deno.env.get("KLING_API_KEY");

  if (!klingApiKey) {
    console.warn(
      "KLING_API_KEY not set — returning the raw video as a placeholder instead of calling Kling AI.",
    );
    return {
      walkthroughUrl: upload.video_file_url,
      reelsUrl: upload.video_file_url,
    };
  }

  // Placeholder endpoint/payload — adjust to Kling AI's actual API contract
  // before relying on this in production.
  const res = await fetch("https://api.klingai.com/v1/videos/generate", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${klingApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source_video_url: upload.video_file_url,
      photos: upload.photos_array,
      property_details: {
        address: upload.address,
        price: upload.price,
        property_type: upload.property_type,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Kling AI error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return {
    walkthroughUrl: data.walkthrough_video_url,
    reelsUrl: data.reels_video_url,
  };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
