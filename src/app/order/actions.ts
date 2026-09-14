"use server";

import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { supabaseAdmin, ORDER_PHOTOS_BUCKET } from "@/lib/supabase";
import { MIN_ORDER_PHOTOS, quoteForPhotoCount } from "@/lib/pricing";

export type CreateOrderState = {
  error: string | null;
};

export async function createOrder(
  _prevState: CreateOrderState,
  formData: FormData
): Promise<CreateOrderState> {
  const clientName = requireString(formData, "clientName");
  const clientPhone = requireString(formData, "clientPhone");
  const wantsCustom = formData.get("wantsCustom") === "on";
  const customInstructions = requireString(formData, "customInstructions") || null;
  const musicFile = formData.get("musicFile");
  const musicFileProvided = musicFile instanceof File && musicFile.size > 0;

  if (!clientName || !clientPhone) {
    return { error: "Please fill in your name and WhatsApp number." };
  }
  if (wantsCustom && !customInstructions) {
    return { error: "Tell us how you'd like your video edited for a custom order." };
  }

  const photos = formData
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (photos.length < MIN_ORDER_PHOTOS) {
    return { error: `Please upload at least ${MIN_ORDER_PHOTOS} photos.` };
  }

  const quote = wantsCustom ? null : quoteForPhotoCount(photos.length);
  const isCustomOrder = wantsCustom || quote?.kind === "custom";
  const band = isCustomOrder ? "custom" : quote!.band.id;
  const priceGHS = isCustomOrder ? null : quote!.priceGHS;

  const supabase = supabaseAdmin();
  const orderId = randomUUID();

  const { error: insertError } = await supabase.from("orders").insert({
    id: orderId,
    client_name: clientName,
    client_phone: clientPhone,
    photo_count: photos.length,
    band,
    price_ghs: priceGHS,
    music_choice: musicFileProvided ? "client_provided" : "we_pick",
    custom_instructions: customInstructions,
    status: "placed",
  });

  if (insertError) {
    return { error: `Could not create order: ${insertError.message}` };
  }

  try {
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      const path = `${orderId}/photos/${i}-${photo.name.replace(/\s+/g, "-")}`;
      const { error: uploadErr } = await supabase.storage
        .from(ORDER_PHOTOS_BUCKET)
        .upload(path, await photo.arrayBuffer(), {
          contentType: photo.type || "image/jpeg",
          upsert: true,
        });
      if (uploadErr) throw new Error(`Photo upload failed: ${uploadErr.message}`);

      await supabase.from("order_photos").insert({
        order_id: orderId,
        storage_path: path,
        sort_order: i,
      });
    }

    if (musicFileProvided && musicFile instanceof File) {
      const musicPath = `${orderId}/music/${musicFile.name.replace(/\s+/g, "-")}`;
      const { error: musicUploadErr } = await supabase.storage
        .from(ORDER_PHOTOS_BUCKET)
        .upload(musicPath, await musicFile.arrayBuffer(), {
          contentType: musicFile.type || "audio/mpeg",
          upsert: true,
        });
      if (musicUploadErr) throw new Error(`Music upload failed: ${musicUploadErr.message}`);

      await supabase
        .from("orders")
        .update({ music_file_path: musicPath })
        .eq("id", orderId);
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Upload failed. Please try again.",
    };
  }

  redirect(`/track/${orderId}`);
}

function requireString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}
