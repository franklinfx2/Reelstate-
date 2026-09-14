import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { formatGHS } from "@/lib/pricing";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/order-status";
import { logout } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  await requireAdmin();

  const supabase = supabaseAdmin();
  const { data: orders } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-accent">Reelstate</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Orders
          </h1>
        </div>
        <form action={logout}>
          <button type="submit" className="text-sm text-muted underline">
            Log out
          </button>
        </form>
      </div>

      {!orders?.length && <p className="text-muted">No orders yet.</p>}

      <div className="space-y-3">
        {orders?.map((order) => (
          <Link
            key={order.id}
            href={`/admin/orders/${order.id}`}
            className="flex items-center justify-between rounded-card border border-border bg-surface px-5 py-4"
          >
            <div>
              <p className="font-medium">{order.client_name}</p>
              <p className="text-sm text-muted">
                {order.photo_count} photos · {order.band.toUpperCase()} ·{" "}
                {order.price_ghs ? formatGHS(order.price_ghs) : "Custom"}
              </p>
            </div>
            <span className="rounded-control bg-background px-3 py-1 text-xs font-medium">
              {ORDER_STATUS_LABEL[order.status as OrderStatus]}
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
