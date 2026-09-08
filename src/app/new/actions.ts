"use server";

import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { supabaseServer, STORAGE_BUCKET } from "@/lib/supabase";
import { makePropertySlug } from "@/lib/slug";
import { formatPriceGHS } from "@/lib/property-types";
import { renderVerticalPropertyVideo } from "@/lib/video";
import { generatePropertyCopy } from "@/lib/copy-generation";

export type CreatePropertyState = {
  error: string | null;
};

export async function createProperty(
  _prevState: CreatePropertyState,
  formData: FormData
): Promise<CreatePropertyState> {
  const agentName = requireString(formData, "agentName");
  const agentPhone = requireString(formData, "agentPhone");
  const title = requireString(formData, "title");
  const propertyType = requireString(formData, "propertyType");
  const listingPurpose = requireString(formData, "listingPurpose");
  const priceAmountRaw = requireString(formData, "priceAmount");
  const locationArea = requireString(formData, "locationArea");
  const locationCity = requireString(formData, "locationCity");

  if (
    !agentName ||
    !agentPhone ||
    !title ||
    !propertyType ||
    !listingPurpose ||
    !priceAmountRaw ||
    !locationArea ||
    !locationCity
  ) {
    return { error: "Please fill in all required fields." };
  }

  const priceAmount = Number(priceAmountRaw);
  if (!Number.isFinite(priceAmount) || priceAmount <= 0) {
    return { error: "Enter a valid price." };
  }

  const bedroomsRaw = formData.get("bedrooms") as string | null;
  const bedrooms = bedroomsRaw ? Number(bedroomsRaw) : null;
  const furnishing = (formData.get("furnishing") as string) || null;
  const pricePeriod = (formData.get("pricePeriod") as string) || null;
  const description = (formData.get("description") as string) || null;

  const rawVideo = formData.get("video") as File | null;
  const photos = formData
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (!rawVideo || rawVideo.size === 0) {
    return { error: "Please upload a raw property video." };
  }
  if (photos.length === 0) {
    return { error: "Please upload at least one property photo." };
  }

  const supabase = supabaseServer();
  const propertyId = randomUUID();
  const slug = makePropertySlug(title, locationArea);

  const { error: insertError } = await supabase.from("properties").insert({
    id: propertyId,
    agent_name: agentName,
    agent_phone: agentPhone,
    title,
    property_type: propertyType,
    bedrooms,
    furnishing,
    listing_purpose: listingPurpose,
    price_amount: priceAmount,
    price_currency: "GHS",
    price_period: pricePeriod,
    location_area: locationArea,
    location_city: locationCity,
    description,
    slug,
    status: "processing",
  });

  if (insertError) {
    return { error: `Could not save property: ${insertError.message}` };
  }

  try {
    // Photos
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      const path = `${propertyId}/photos/${i}-${photo.name.replace(/\s+/g, "-")}`;
      const { error: uploadErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, await photo.arrayBuffer(), {
          contentType: photo.type || "image/jpeg",
          upsert: true,
        });
      if (uploadErr) throw new Error(`Photo upload failed: ${uploadErr.message}`);

      await supabase.from("media").insert({
        property_id: propertyId,
        media_type: "photo",
        storage_path: path,
        sort_order: i,
      });
    }

    // Raw video
    const rawVideoBuffer = Buffer.from(await rawVideo.arrayBuffer());
    const rawVideoPath = `${propertyId}/raw/${rawVideo.name.replace(/\s+/g, "-")}`;
    const { error: rawUploadErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(rawVideoPath, rawVideoBuffer, {
        contentType: rawVideo.type || "video/mp4",
        upsert: true,
      });
    if (rawUploadErr) throw new Error(`Video upload failed: ${rawUploadErr.message}`);

    await supabase.from("media").insert({
      property_id: propertyId,
      media_type: "raw_video",
      storage_path: rawVideoPath,
      sort_order: 0,
    });

    // Processed vertical video (burned-in overlay)
    const price = formatPriceGHS(priceAmount, pricePeriod);
    const processedBuffer = await renderVerticalPropertyVideo(rawVideoBuffer, {
      headline: title,
      location: `${locationArea}, ${locationCity}`,
      price,
      cta: `WhatsApp ${agentPhone} to view`,
    });

    const processedPath = `${propertyId}/processed/vertical.mp4`;
    const { error: processedUploadErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(processedPath, processedBuffer, {
        contentType: "video/mp4",
        upsert: true,
      });
    if (processedUploadErr)
      throw new Error(`Processed video upload failed: ${processedUploadErr.message}`);

    await supabase.from("media").insert({
      property_id: propertyId,
      media_type: "processed_video_vertical",
      storage_path: processedPath,
      sort_order: 0,
    });

    // AI-generated marketing copy
    const copy = await generatePropertyCopy({
      title,
      propertyType,
      bedrooms,
      furnishing,
      listingPurpose,
      priceAmount,
      pricePeriod,
      locationArea,
      locationCity,
      description,
      agentPhone,
    });

    await supabase.from("generated_content").insert([
      { property_id: propertyId, content_type: "caption_instagram", content: copy.captionInstagram },
      { property_id: propertyId, content_type: "caption_facebook", content: copy.captionFacebook },
      { property_id: propertyId, content_type: "caption_tiktok", content: copy.captionTiktok },
      { property_id: propertyId, content_type: "whatsapp_message", content: copy.whatsappMessage },
      { property_id: propertyId, content_type: "landing_page_copy", content: copy.landingPageCopy },
    ]);

    await supabase
      .from("properties")
      .update({ status: "published" })
      .eq("id", propertyId);
  } catch (err) {
    await supabase
      .from("properties")
      .update({ status: "draft" })
      .eq("id", propertyId);
    return {
      error:
        err instanceof Error
          ? `Processing failed: ${err.message}`
          : "Processing failed. Please try again.",
    };
  }

  redirect(`/p/${slug}`);
}

function requireString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}
