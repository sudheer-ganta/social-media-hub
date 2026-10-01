/** Photography for the demo brand, generated for this page. */
export const photos = {
  lamp: "/landing/lamp.webp",
  chair: "/landing/chair.webp",
  vase: "/landing/vase.webp",
  living: "/landing/living.webp",
  console: "/landing/console.webp",
  dusk: "/landing/dusk.webp",
} as const;

export const NAV_LINKS = [
  { label: "Product", href: "#flow" },
  { label: "Brand Intelligence", href: "#brand" },
  { label: "AI Assist", href: "#assist" },
] as const;

/* -------------------------------------------------------------- hero data */

export const VOICES = ["Modern", "Warm", "Confident"] as const;
export const STYLES = ["Editorial", "Minimal", "Warm"] as const;
/** `fg` is the readable label colour when a swatch is used as a button fill. */
export const SWATCHES = [
  { name: "Sand", value: "#E4D9C7", fg: "#171717" },
  { name: "Stone", value: "#B9B2A6", fg: "#171717" },
  { name: "Rally orange", value: "#FF4D32", fg: "#171717" },
  { name: "Ink", value: "#171717", fg: "#FBFAF7" },
] as const;

export type VoiceName = (typeof VOICES)[number];
export type StyleName = (typeof STYLES)[number];

export const PLATFORM_ORDER = ["instagram", "linkedin", "x", "facebook", "youtube"] as const;
export type PostPlatform = (typeof PLATFORM_ORDER)[number];

/** What Rally writes for each platform once a voice is applied. */
export const POST_COPY: Record<VoiceName, Record<PostPlatform, string>> = {
  Modern: {
    instagram: "Good design lives longer. Made to be kept, not replaced.",
    linkedin: "Good design lives longer. Why we build for decades, not seasons.",
    x: "Design for a calmer mind.",
    facebook: "New in: pieces made to last. Come and take a look.",
    youtube: "Good Design Lives Longer",
  },
  Warm: {
    instagram: "Made for the rooms you love, and the people in them.",
    linkedin: "Come home to calm: a note on designing spaces that feel like you.",
    x: "Soft light, slow evenings.",
    facebook: "Where every piece has a story. Come in and stay a while.",
    youtube: "Where Every Piece Has a Story",
  },
  Confident: {
    instagram: "Buy once. Keep it for good.",
    linkedin: "Built to outlast the trend. Here is how we think about longevity.",
    x: "Quiet design. Loud results.",
    facebook: "One piece. Many years. Shop the new collection.",
    youtube: "One Piece. Many Years.",
  },
};

/** Selections the hero's demo cursor works through, one round per loop. */
export const HERO_ROUNDS = [
  { voice: "Warm", style: "Minimal", swatch: 2 },
  { voice: "Confident", style: "Warm", swatch: 3 },
  { voice: "Modern", style: "Editorial", swatch: 0 },
] as const satisfies readonly { voice: VoiceName; style: StyleName; swatch: number }[];
