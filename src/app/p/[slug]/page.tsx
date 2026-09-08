import { notFound } from "next/navigation";
import { supabaseServer, STORAGE_BUCKET } from "@/lib/supabase";
import { formatPriceGHS, propertyTypeLabel } from "@/lib/property-types";
import { whatsappLink } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

type Media = {
  media_type: string;
  storage_path: string;
  sort_order: number;
};

type GeneratedContent = {
  content_type: string;
  content: string;
};

export default async function PropertyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = supabaseServer();

  const { data: property } = await supabase
    .from("properties")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (!property) notFound();

  const [{ data: media }, { data: content }] = await Promise.all([
    supabase
      .from("media")
      .select("media_type, storage_path, sort_order")
      .eq("property_id", property.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("generated_content")
      .select("content_type, content")
      .eq("property_id", property.id),
  ]);

  const publicUrl = (path: string) =>
    supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;

  const photos = (media ?? []).filter((m: Media) => m.media_type === "photo");
  const video = (media ?? []).find(
    (m: Media) => m.media_type === "processed_video_vertical"
  );
  const landingCopy = (content ?? []).find(
    (c: GeneratedContent) => c.content_type === "landing_page_copy"
  )?.content;

  const price = formatPriceGHS(property.price_amount, property.price_period);
  const place = `${property.location_area}, ${property.location_city}`;
  const ctaMessage = `Hi, I'm interested in "${property.title}" in ${place}. Is it still available?`;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      {video && (
        <div className="mx-auto mb-8 aspect-[9/16] w-full max-w-xs overflow-hidden rounded-card bg-black">
          <video
            src={publicUrl(video.storage_path)}
            controls
            playsInline
            className="h-full w-full object-cover"
          />
        </div>
      )}

      <p className="text-sm font-medium text-accent">
        {propertyTypeLabel(property.property_type)}
        {property.bedrooms ? ` · ${property.bedrooms} bed` : ""}
        {property.furnishing ? ` · ${property.furnishing.replace("_", " ")}` : ""}
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">
        {property.title}
      </h1>
      <p className="mt-1 text-muted">{place}</p>
      <p className="mt-4 text-2xl font-semibold">{price}</p>

      {landingCopy && (
        <p className="mt-5 leading-relaxed text-foreground/90">{landingCopy}</p>
      )}

      <a
        href={whatsappLink(property.agent_phone, ctaMessage)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-8 flex w-full items-center justify-center rounded-control bg-accent px-5 py-3.5 text-base font-semibold text-accent-foreground"
      >
        WhatsApp {property.agent_name} to view
      </a>

      {photos.length > 0 && (
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo: Media) => (
            <div
              key={photo.storage_path}
              className="aspect-square overflow-hidden rounded-control bg-surface"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={publicUrl(photo.storage_path)}
                alt={property.title}
                className="h-full w-full object-cover"
              />
            </div>
          ))}
        </div>
      )}

      <p className="mt-10 text-center text-xs text-muted">
        Listed via Reelstate
      </p>
    </main>
  );
}
