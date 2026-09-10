// Generic-tone caption pool matching the style analyzed from a real manual
// edit: short, title-case, aspirational, no price/location/agent info (that
// lives on the listing page itself, not burned into the video).
export const CAPTION_POOL = [
  "Where Comfort Meets Style",
  "Unwind in Style",
  "Cook. Dine. Entertain.",
  "Fully Equipped, Fully Yours",
  "Every Comfort of Home",
  "Rest & Recharge",
  "Sink Into Comfort",
  "Refresh in Style",
  "Modern. Clean. Elegant.",
  "Your Next Stay Starts Here",
];

export function pickCaptions(count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(CAPTION_POOL[i % CAPTION_POOL.length]);
  }
  return out;
}
