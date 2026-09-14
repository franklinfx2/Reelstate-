export const ORDER_STATUSES = [
  "placed",
  "payment_confirmed",
  "in_progress",
  "ready",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  placed: "Order placed",
  payment_confirmed: "Payment confirmed",
  in_progress: "Editing in progress",
  ready: "Video ready",
};

export const ORDER_STATUS_DESCRIPTION: Record<OrderStatus, string> = {
  placed: "We've received your photos. Waiting for payment confirmation.",
  payment_confirmed: "Payment received — your order is queued for editing.",
  in_progress: "Your video is being edited now.",
  ready: "Your video is ready to download and share.",
};

export function statusIndex(status: OrderStatus): number {
  return ORDER_STATUSES.indexOf(status);
}
