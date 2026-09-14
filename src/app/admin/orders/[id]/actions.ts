"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin, ORDER_VIDEOS_BUCKET } from "@/lib/supabase";

export type UploadDeliverableState = {
  error: string | null;
};

export async function confirmPayment(formData: FormData): Promise<void> {
  await requireAdmin();
  const orderId = requireOrderId(formData);

  const supabase = supabaseAdmin();
  await supabase
    .from("orders")
    .update({ status: "payment_confirmed" })
    .eq("id", orderId)
    .eq("status", "placed");

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin");
}

export async function startEditing(formData: FormData): Promise<void> {
  await requireAdmin();
  const orderId = requireOrderId(formData);

  const supabase = supabaseAdmin();
  await supabase
    .from("orders")
    .update({ status: "in_progress" })
    .eq("id", orderId)
    .eq("status", "payment_confirmed");

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin");
}

export async function uploadDeliverable(
  _prevState: UploadDeliverableState,
  formData: FormData
): Promise<UploadDeliverableState> {
  await requireAdmin();
  const orderId = requireOrderId(formData);

  const video = formData.get("video");
  if (!(video instanceof File) || video.size === 0) {
    return { error: "Choose the finished video file." };
  }

  const supabase = supabaseAdmin();
  const path = `${orderId}/final.mp4`;

  const { error: uploadError } = await supabase.storage
    .from(ORDER_VIDEOS_BUCKET)
    .upload(path, await video.arrayBuffer(), {
      contentType: video.type || "video/mp4",
      upsert: true,
    });

  if (uploadError) {
    return { error: `Upload failed: ${uploadError.message}` };
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({ deliverable_video_path: path, status: "ready" })
    .eq("id", orderId)
    .eq("status", "in_progress");

  if (updateError) {
    return { error: `Could not finalize order: ${updateError.message}` };
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin");
  return { error: null };
}

function requireOrderId(formData: FormData): string {
  const value = formData.get("orderId");
  if (typeof value !== "string" || !value) {
    throw new Error("Missing orderId");
  }
  return value;
}
