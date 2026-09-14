import { notFound } from "next/navigation";
import { supabaseAdmin, ORDER_VIDEOS_BUCKET } from "@/lib/supabase";
import { formatGHS } from "@/lib/pricing";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_DESCRIPTION,
  statusIndex,
  type OrderStatus,
} from "@/lib/order-status";

export const dynamic = "force-dynamic";

export default async function TrackOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = supabaseAdmin();

  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!order) notFound();

  const status = order.status as OrderStatus;
  const currentIndex = statusIndex(status);

  const videoUrl = order.deliverable_video_path
    ? supabase.storage
        .from(ORDER_VIDEOS_BUCKET)
        .getPublicUrl(order.deliverable_video_path).data.publicUrl
    : null;

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <p className="text-sm font-medium text-accent">Reelstate</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">
        Order status
      </h1>
      <p className="mt-2 text-muted">
        {order.client_name} · {order.photo_count} photos ·{" "}
        {order.price_ghs ? formatGHS(order.price_ghs) : "Custom quote"}
      </p>

      <ol className="mt-10 space-y-6">
        {ORDER_STATUSES.map((s, i) => (
          <li key={s} className="flex gap-4">
            <div
              className={`mt-1 h-3 w-3 shrink-0 rounded-full ${
                i <= currentIndex ? "bg-accent" : "bg-border"
              }`}
            />
            <div>
              <p
                className={`font-medium ${
                  i <= currentIndex ? "text-foreground" : "text-muted"
                }`}
              >
                {ORDER_STATUS_LABEL[s]}
              </p>
              {i === currentIndex && (
                <p className="mt-0.5 text-sm text-muted">
                  {ORDER_STATUS_DESCRIPTION[s]}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>

      {status === "placed" && (
        <div className="mt-10 rounded-card bg-surface p-5">
          <h2 className="text-sm font-semibold">Complete your payment</h2>
          <p className="mt-2 text-sm text-muted">
            Send{" "}
            <span className="font-semibold text-foreground">
              {order.price_ghs ? formatGHS(order.price_ghs) : "your quoted amount"}
            </span>{" "}
            via Mobile Money to{" "}
            <span className="font-semibold text-foreground">
              {process.env.PAYMENT_MOMO_NUMBER ?? "our MoMo number"}
            </span>{" "}
            ({process.env.PAYMENT_MOMO_NAME ?? "Reelstate"}), using{" "}
            <span className="font-semibold text-foreground">
              {order.id.slice(0, 8)}
            </span>{" "}
            as the reference. We&apos;ll confirm here once received.
          </p>
        </div>
      )}

      {status === "ready" && videoUrl && (
        <div className="mt-10 rounded-card bg-surface p-5">
          <h2 className="text-sm font-semibold">Your video is ready</h2>
          <a
            href={videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex w-full items-center justify-center rounded-control bg-accent px-5 py-3.5 text-base font-semibold text-accent-foreground"
          >
            Download video
          </a>
        </div>
      )}
    </main>
  );
}
