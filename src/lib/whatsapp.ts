/**
 * Converts a locally-formatted Ghanaian number (e.g. "024 123 4567" or
 * "0241234567") into a wa.me link. Falls back to stripping non-digits for
 * numbers that already include a country code.
 */
export function whatsappLink(phone: string, message?: string): string {
  const digits = phone.replace(/\D/g, "");
  const international = digits.startsWith("0")
    ? `233${digits.slice(1)}`
    : digits.startsWith("233")
      ? digits
      : `233${digits}`;

  const base = `https://wa.me/${international}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
