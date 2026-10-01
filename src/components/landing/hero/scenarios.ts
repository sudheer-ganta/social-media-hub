import { photos } from "../data";

export interface Scenario {
  prompt: string;
  ideas: { title: string; angle: string }[];
  /** Index of the idea the demo picks. */
  pick: number;
  photo: string;
  /** CSS object-position for the preview crop. */
  position: string;
  caption: string;
  tags: string[];
  /** Day-of-week index (Mon = 0) and the time shown when scheduling. */
  day: number;
  when: string;
}

/** Rally's flow, as the product runs it: describe, ideas, pick one, image, caption, publish. */
export const SCENARIOS: Scenario[] = [
  {
    prompt: "Announce our new autumn lamp collection.",
    ideas: [
      { title: "Made to be kept", angle: "Why good design outlasts the trend." },
      { title: "Light for slow evenings", angle: "A warm, mood-first shot of the lamp at dusk." },
      { title: "Behind the lamp", angle: "How each piece is made, start to finish." },
    ],
    pick: 1,
    photo: photos.lamp,
    position: "50% 38%",
    caption: "Light for slow evenings. Meet the Autumn lamp, made to be kept.",
    tags: ["#autumnlight", "#slowliving", "#homedecor", "#madetolast"],
    day: 3,
    when: "Thursday, 9:30",
  },
  {
    prompt: "Introduce our new oak armchair.",
    ideas: [
      { title: "Corner of the week", angle: "One corner, styled three different ways." },
      { title: "Sit down slowly", angle: "A calm, lived-in shot in soft daylight." },
      { title: "Oak and bouclé", angle: "The materials, up close." },
    ],
    pick: 1,
    photo: photos.chair,
    position: "40% 55%",
    caption: "Sit down slowly. The new oak armchair is here.",
    tags: ["#oakfurniture", "#cosyhome", "#interiordesign", "#armchair"],
    day: 4,
    when: "Friday, 10:00",
  },
];

export const BRAND_CHIPS = ["Warm voice", "Editorial style", "Product-first imagery"];
