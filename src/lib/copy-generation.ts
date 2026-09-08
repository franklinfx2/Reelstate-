import { formatPriceGHS, propertyTypeLabel } from "./property-types";

export type PropertyForCopy = {
  title: string;
  propertyType: string;
  bedrooms: number | null;
  furnishing: string | null;
  listingPurpose: string;
  priceAmount: number;
  pricePeriod: string | null;
  locationArea: string;
  locationCity: string;
  description: string | null;
  agentPhone: string;
};

export type GeneratedCopy = {
  captionInstagram: string;
  captionFacebook: string;
  captionTiktok: string;
  whatsappMessage: string;
  landingPageCopy: string;
};

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

export async function generatePropertyCopy(
  property: PropertyForCopy
): Promise<GeneratedCopy> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    try {
      return await generateWithClaude(property, apiKey);
    } catch (err) {
      console.error("Claude copy generation failed, using template fallback:", err);
    }
  }
  return generateFromTemplate(property);
}

async function generateWithClaude(
  property: PropertyForCopy,
  apiKey: string
): Promise<GeneratedCopy> {
  const price = formatPriceGHS(property.priceAmount, property.pricePeriod);
  const typeLabel = propertyTypeLabel(property.propertyType);

  const prompt = `You write property marketing copy for real-estate agents in Ghana. Match how Ghanaian agents actually post on WhatsApp, Instagram, Facebook and TikTok — direct, benefit-led, uses ₵ pricing, mentions the neighborhood by name, ends with a clear call-to-action pointing to WhatsApp. Keep emoji use natural, not excessive.

Property details:
- Title: ${property.title}
- Type: ${typeLabel}
- Bedrooms: ${property.bedrooms ?? "n/a"}
- Furnishing: ${property.furnishing ?? "n/a"}
- Listing purpose: ${property.listingPurpose}
- Price: ${price}
- Location: ${property.locationArea}, ${property.locationCity}
- Description: ${property.description ?? "none provided"}
- Agent WhatsApp: ${property.agentPhone}

Return ONLY valid JSON with these exact keys, no markdown fences:
{"captionInstagram": "...", "captionFacebook": "...", "captionTiktok": "...", "whatsappMessage": "...", "landingPageCopy": "..."}

captionInstagram: 2-4 short lines + hashtags relevant to Ghana real estate.
captionFacebook: slightly longer, friendly, can include more detail.
captionTiktok: punchy hook line + short body, no hashtags needed.
whatsappMessage: a broadcast-ready message the agent can paste into a WhatsApp status or group.
landingPageCopy: 2-3 sentence description for a property listing page.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const text: string = data?.content?.[0]?.text ?? "";
  const parsed = JSON.parse(extractJson(text));

  return {
    captionInstagram: parsed.captionInstagram,
    captionFacebook: parsed.captionFacebook,
    captionTiktok: parsed.captionTiktok,
    whatsappMessage: parsed.whatsappMessage,
    landingPageCopy: parsed.landingPageCopy,
  };
}

function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON found in model output");
  return text.slice(start, end + 1);
}

function generateFromTemplate(property: PropertyForCopy): GeneratedCopy {
  const price = formatPriceGHS(property.priceAmount, property.pricePeriod);
  const typeLabel = propertyTypeLabel(property.propertyType);
  const bedroomsText = property.bedrooms ? `${property.bedrooms} bedroom ` : "";
  const furnishingText = property.furnishing
    ? `${property.furnishing.replace("_", " ")} `
    : "";
  const place = `${property.locationArea}, ${property.locationCity}`;
  const purposeVerb = property.listingPurpose === "sale" ? "for sale" : "available now";

  const headline = `${furnishingText}${bedroomsText}${typeLabel} ${purposeVerb} in ${place}`.replace(
    /\s+/g,
    " "
  );

  return {
    captionInstagram: `📍 ${place}\n🏠 ${headline}\n💰 ${price}\n\nDM or WhatsApp ${property.agentPhone} to book a viewing.\n#GhanaRealEstate #${property.locationCity.replace(/\s+/g, "")}Rentals #PropertyGhana`,
    captionFacebook: `${headline}.\n\n📍 Location: ${place}\n💰 Price: ${price}\n\n${property.description ?? ""}\n\nSerious inquiries only — WhatsApp ${property.agentPhone} to schedule a viewing.`,
    captionTiktok: `You need to see this ${typeLabel.toLowerCase()} in ${property.locationArea} 👀\n${price} — WhatsApp ${property.agentPhone} now before it's gone.`,
    whatsappMessage: `*${headline}*\n📍 ${place}\n💰 ${price}\n\n${property.description ?? "Contact us for more details."}\n\nWhatsApp ${property.agentPhone} to view.`,
    landingPageCopy: `${headline} in ${place}. ${property.description ?? "Well-located and ready for a new tenant."} Priced at ${price} — contact the agent on WhatsApp to arrange a viewing.`,
  };
}
