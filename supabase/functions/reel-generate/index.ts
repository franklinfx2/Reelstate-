// POST /functions/v1/reel-generate/:projectId
// Orchestrates the "photos only" flow's analysis phase, then hands off the
// heavy media work (Kling generation + ffmpeg assembly) to the
// reel-process-video GitHub Actions workflow — same division of labor as
// functions/generate does for the raw-video pipeline.
//
// One Claude vision call does all of: quality scoring, feature detection,
// diverse best-5 selection, and per-selected-photo Kling prompt + caption
// generation. That covers the brief's "analyze" and "generate prompts"
// steps in a single request instead of two, which is faster and cheaper
// without changing what gets produced.
//
// This function only submits Kling jobs (fast, non-blocking) — it never
// waits for them to finish, since generation takes minutes and Edge
// Functions can't hold a connection open that long. reel-poll-clips (run on
// a schedule) checks on them and hands off to GitHub Actions for ffmpeg
// assembly once every clip for a project is ready.
//
// Required secrets (supabase secrets set ...):
//   ANTHROPIC_API_KEY — for the vision/selection/prompt-writing call
//   KLING_API_KEY (or KLING_ACCESS_KEY + KLING_SECRET_KEY) — see
//     ../_shared/kling.ts. Kept Supabase-only; never passed to GitHub Actions.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { submitImageToVideo } from "../_shared/kling.ts";

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const SELECT_COUNT = 5;
const MAX_PHOTOS_TO_ANALYZE = 20;
const CLIP_DURATION_SECONDS = 10;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const projectId = new URL(req.url).pathname.split("/").filter(Boolean).pop();
  if (!projectId) {
    return jsonResponse({ error: "Missing projectId in path" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: project, error: projectError } = await supabase
    .from("reel_projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) return jsonResponse({ error: projectError.message }, 500);
  if (!project) return jsonResponse({ error: "Project not found" }, 404);

  const { data: photos, error: photosError } = await supabase
    .from("reel_photos")
    .select("id, storage_path, sort_order")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });
  if (photosError) return jsonResponse({ error: photosError.message }, 500);
  if (!photos || photos.length < SELECT_COUNT) {
    return jsonResponse({ error: `Project needs at least ${SELECT_COUNT} photos` }, 400);
  }

  const analyzed = photos.slice(0, MAX_PHOTOS_TO_ANALYZE);
  const photoUrls = analyzed.map(
    (p) => supabase.storage.from("property-photos").getPublicUrl(p.storage_path).data.publicUrl,
  );

  try {
    await supabase.from("reel_projects").update({ status: "analyzing" }).eq("id", projectId);

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not configured for this project's Edge Functions.");
    }

    const analysis = await analyzeAndPromptPhotos(apiKey, project, photoUrls);

    await supabase.from("reel_projects").update({ status: "prompting" }).eq("id", projectId);

    await Promise.all(
      analysis.photos.map(({ index, quality_score, feature_type, notes }) => {
        const photo = analyzed[index];
        if (!photo) return Promise.resolve();
        return supabase
          .from("reel_photos")
          .update({ quality_score, feature_type, analysis_notes: notes })
          .eq("id", photo.id);
      }),
    );

    const selections = analysis.selected.slice(0, SELECT_COUNT);
    for (const [rank, sel] of selections.entries()) {
      const photo = analyzed[sel.index];
      if (!photo) continue;

      await supabase
        .from("reel_photos")
        .update({ is_selected: true, selection_rank: rank + 1 })
        .eq("id", photo.id);

      const { data: clipRow, error: clipError } = await supabase
        .from("reel_clips")
        .insert({
          project_id: projectId,
          photo_id: photo.id,
          sort_order: rank + 1,
          caption_text: sel.caption,
          prompt_text: sel.prompt,
          status: "pending",
        })
        .select("id")
        .single();
      if (clipError || !clipRow) {
        throw new Error(`Could not save clip: ${clipError?.message ?? "unknown error"}`);
      }

      const photoUrl = supabase.storage
        .from("property-photos")
        .getPublicUrl(photo.storage_path).data.publicUrl;
      const taskId = await submitImageToVideo({
        imageUrl: photoUrl,
        prompt: sel.prompt,
        durationSeconds: CLIP_DURATION_SECONDS,
      });
      await supabase
        .from("reel_clips")
        .update({ kling_task_id: taskId, status: "generating" })
        .eq("id", clipRow.id);
    }

    await supabase.from("reel_projects").update({ status: "generating" }).eq("id", projectId);

    return jsonResponse({ projectId, status: "generating" }, 202);
  } catch (err) {
    console.error("reel-generate failed:", err);
    const message = err instanceof Error ? err.message : "Processing failed";
    await supabase
      .from("reel_projects")
      .update({ status: "failed", error_message: message })
      .eq("id", projectId);
    return jsonResponse({ error: message }, 500);
  }
});

type PhotoAnalysis = { index: number; quality_score: number; feature_type: string; notes: string };
type PhotoSelection = { index: number; feature_type: string; caption: string; prompt: string };

async function analyzeAndPromptPhotos(
  apiKey: string,
  project: { title: string; location: string },
  photoUrls: string[],
): Promise<{ photos: PhotoAnalysis[]; selected: PhotoSelection[] }> {
  const instructions = `You are producing the shot list for a cinematic real-estate marketing video.

Property: "${project.title}" in ${project.location}.

You are shown ${photoUrls.length} property photos, numbered 0 to ${photoUrls.length - 1} in the order given.

Step 1 — for EVERY photo, assess:
- quality_score: 0-100 (sharpness, lighting, composition — penalize blurry, dark, or cluttered shots)
- feature_type: one of "exterior", "living_room", "bedroom", "kitchen", "bathroom", "dining", "pool", "garden", "amenity", "other"
- notes: one short phrase on what's actually visible (specific furniture, finishes, view) to ground a video prompt later

Step 2 — select exactly ${SELECT_COUNT} of these photos for the final video: the highest-quality ones, but prefer covering DIFFERENT feature_types over picking near-duplicates, so the video shows a variety of spaces. Order the selection as a narrative walkthrough (typically exterior first, then living spaces, then bedroom, then a detail/amenity shot, ending on an aspirational wide shot).

Step 3 — for each selected photo, write:
- caption: 2-4 words, elegant title-case overlay text (e.g. "Executive Space", "Comfortable Living", "Restful Spaces", "Luxury Finishes", "Your Perfect Home") — no price, address, or contact info
- prompt: a single-paragraph cinematic video-generation prompt describing camera movement (slow pan / dolly-in / tracking / reveal), lighting (warm/golden/natural), and the specific details from that photo's notes. Style descriptors to include: hyperrealistic, 4K, cinematic, premium, aspirational. Do not mention duration, frame rate, or resolution numbers — those are handled separately.

Return ONLY valid JSON, no markdown fences, matching exactly this shape:
{"photos":[{"index":0,"quality_score":0,"feature_type":"","notes":""}],"selected":[{"index":0,"feature_type":"","caption":"","prompt":""}]}`;

  const content: Record<string, unknown>[] = [{ type: "text", text: instructions }];
  photoUrls.forEach((url, i) => {
    content.push({ type: "text", text: `Photo ${i}:` });
    content.push({ type: "image", source: { type: "url", url } });
  });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const text: string = data?.content?.[0]?.text ?? "";
  const parsed = JSON.parse(extractJson(text));

  const photosOut: PhotoAnalysis[] = Array.isArray(parsed.photos) ? parsed.photos : [];
  let selectedOut: PhotoSelection[] = Array.isArray(parsed.selected) ? parsed.selected : [];

  // Safety net: if the model returned fewer than SELECT_COUNT valid, unique
  // selections, fill the rest by quality_score so the pipeline never stalls
  // on a malformed response.
  const validIndices = new Set(
    selectedOut
      .filter((s) => Number.isInteger(s?.index) && s.index >= 0 && s.index < photoUrls.length)
      .map((s) => s.index),
  );
  selectedOut = selectedOut.filter((s) => validIndices.has(s.index));

  if (selectedOut.length < SELECT_COUNT) {
    const byQuality = [...photosOut]
      .filter((p) => Number.isInteger(p?.index) && !validIndices.has(p.index))
      .sort((a, b) => (b.quality_score ?? 0) - (a.quality_score ?? 0));

    for (const p of byQuality) {
      if (selectedOut.length >= SELECT_COUNT) break;
      selectedOut.push({
        index: p.index,
        feature_type: p.feature_type ?? "other",
        caption: "Your Perfect Home",
        prompt:
          `Cinematic reveal shot of a ${p.feature_type ?? "property"} space. ${p.notes ?? ""} ` +
          `Smooth camera movement, warm natural lighting. Hyperrealistic, cinematic, premium.`,
      });
      validIndices.add(p.index);
    }
  }

  return { photos: photosOut, selected: selectedOut.slice(0, SELECT_COUNT) };
}

function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON found in model output");
  return text.slice(start, end + 1);
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
