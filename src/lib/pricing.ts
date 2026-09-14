export type BandId = "A" | "B" | "C";

export type Band = {
  id: BandId;
  label: string;
  minPhotos: number;
  maxPhotos: number;
  /** Max photos actually Kling-animated — internal cost control, never shown to the customer. */
  cap: number;
  priceGHS: number;
};

export const MIN_ORDER_PHOTOS = 5;

export const BANDS: Band[] = [
  { id: "A", label: "Starter", minPhotos: 5, maxPhotos: 10, cap: 8, priceGHS: 280 },
  { id: "B", label: "Standard", minPhotos: 11, maxPhotos: 18, cap: 16, priceGHS: 420 },
  { id: "C", label: "Premium", minPhotos: 19, maxPhotos: 28, cap: 26, priceGHS: 640 },
];

export const MAX_STANDARD_PHOTOS = BANDS[BANDS.length - 1].maxPhotos;

export type PriceQuote =
  | { kind: "band"; band: Band; priceGHS: number }
  | { kind: "custom" };

/** Returns null when count is below the site-wide minimum. */
export function quoteForPhotoCount(count: number): PriceQuote | null {
  if (count < MIN_ORDER_PHOTOS) return null;
  const band = BANDS.find((b) => count <= b.maxPhotos);
  return band ? { kind: "band", band, priceGHS: band.priceGHS } : { kind: "custom" };
}

export function formatGHS(amount: number): string {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    maximumFractionDigits: 0,
  }).format(amount);
}
