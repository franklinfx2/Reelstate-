import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin, ORDER_PHOTOS_BUCKET } from "@/lib/supabase";
import { formatGHS } from "@/lib/pricing";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/order-status";
import { confirmPayment, startEditing } from "./actions";
import { DeliverableUploadForm } from "./DeliverableUploadForm";

export const dynamic = "force-dynamic";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const supabase = supabaseAdmin();

  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!order) notFound();

  const { data: photos } = await supabase
    .from("order_photos")
    .select("storage_path, sort_order")
    .eq("order_id", id)
    .order("sort_order", { ascending: true });

  const photoLinks = await Promise.all(
    (photos ?? []).map(async (photo) => {
      const { data } = await supabase.storage
        .from(ORDER_PHOTOS_BUCKET)
        .createSignedUrl(photo.storage_path, SIGNED_URL_TTL_SECONDS);
      return { path: photo.storage_path, url: data?.signedUrl ?? null };
    })
  );

  const musicUrl = order.music_file_path
    ? (
        await supabase.storage
          .from(ORDER_PHOTOS_BUCKET)
          .createSignedUrl(order.music_file_path, SIGNED_URL_TTL_SECONDS)
      ).data?.signedUrl ?? null
    : null;

  const status = order.status as OrderStatus;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <p className="text-sm font-medium text-accent">Reelstate admin</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">
        {order.client_name}
      </h1>
      <p className="mt-1 text-muted">
        WhatsApp {order.client_phone} · {order.photo_count} photos ·{" "}
        {order.band.toUpperCase()} ·{" "}
        {order.price_ghs ? formatGHS(order.price_ghs) : "Custom — needs quote"}
      </p>
      <p className="mt-1 text-sm text-muted">
        Status: <span className="font-medium">{ORDER_STATUS_LABEL[status]}</span>
      </p>

      {order.custom_instructions && (
        <div className="mt-6 rounded-card bg-surface p-5">
          <h2 className="text-sm font-semibold">Custom instructions</h2>
          <p className="mt-2 text-sm">{order.custom_instructions}</p>
        </div>
      )}

      <div className="mt-6 rounded-card bg-surface p-5">
        <h2 className="text-sm font-semibold">Music</h2>
        <p className="mt-2 text-sm">
          {order.music_choice === "client_provided"
            ? musicUrl
              ? <a href={musicUrl} className="text-accent underline" target="_blank" rel="noopener noreferrer">Download client track</a>
              : "Client provided a track (link unavailable)"
            : "We're picking a licensed track for this one."}
        </p>
      </div>

      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold">
          Photos ({photoLinks.length})
        </h2>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photoLinks.map((photo) =>
            photo.url ? (
              <a
                key={photo.path}
                href={photo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="aspect-square overflow-hidden rounded-control bg-background"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </a>
            ) : null
          )}
        </div>
      </div>

      <div className="mt-8 space-y-4">
        {status === "placed" && (
          <form action={confirmPayment}>
            <input type="hidden" name="orderId" value={order.id} />
            <button
              type="submit"
              className="w-full rounded-control bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground"
            >
              Confirm payment received
            </button>
          </form>
        )}

        {status === "payment_confirmed" && (
          <form action={startEditing}>
            <input type="hidden" name="orderId" value={order.id} />
            <button
              type="submit"
              className="w-full rounded-control bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground"
            >
              Start editing
            </button>
          </form>
        )}

        {status === "in_progress" && (
          <div className="rounded-card border border-border p-5">
            <h2 className="mb-3 text-sm font-semibold">
              Upload finished video
            </h2>
            <DeliverableUploadForm orderId={order.id} />
          </div>
        )}

        {status === "ready" && (
          <p className="rounded-control bg-success/10 px-3.5 py-2.5 text-sm text-success">
            Delivered — client can download their video.
          </p>
        )}
      </div>
    </main>
  );
}
