export const PROPERTY_TYPES = [
  { value: "self_contained", label: "Self-contained" },
  { value: "chamber_and_hall", label: "Chamber and hall" },
  { value: "one_bedroom", label: "1 bedroom" },
  { value: "two_bedroom", label: "2 bedroom" },
  { value: "three_bedroom", label: "3 bedroom" },
  { value: "four_plus_bedroom", label: "4+ bedroom" },
  { value: "apartment", label: "Apartment" },
  { value: "house", label: "House" },
  { value: "standalone", label: "Standalone" },
  { value: "compound_house", label: "Compound house" },
  { value: "furnished_apartment", label: "Furnished apartment" },
  { value: "commercial", label: "Commercial property" },
  { value: "land", label: "Land" },
  { value: "short_stay", label: "Short stay" },
] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number]["value"];

export const FURNISHING_OPTIONS = [
  { value: "furnished", label: "Furnished" },
  { value: "semi_furnished", label: "Semi-furnished" },
  { value: "unfurnished", label: "Unfurnished" },
] as const;

export const LISTING_PURPOSES = [
  { value: "rent", label: "For rent" },
  { value: "sale", label: "For sale" },
  { value: "short_stay", label: "Short stay" },
] as const;

export const PRICE_PERIODS = [
  { value: "per_year", label: "Per year" },
  { value: "per_month", label: "Per month" },
  { value: "per_night", label: "Per night" },
  { value: "one_time", label: "One-time" },
] as const;

export function propertyTypeLabel(value: string): string {
  return PROPERTY_TYPES.find((t) => t.value === value)?.label ?? value;
}

export function formatPriceGHS(amount: number, period?: string | null) {
  const formatted = new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    maximumFractionDigits: 0,
  }).format(amount);

  const periodLabel = PRICE_PERIODS.find((p) => p.value === period)?.label;
  return periodLabel && periodLabel !== "One-time"
    ? `${formatted} / ${periodLabel.replace("Per ", "")}`
    : formatted;
}
