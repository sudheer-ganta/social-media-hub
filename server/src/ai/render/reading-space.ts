import sharp from 'sharp';

/**
 * Makes room for type when a picture has none.
 *
 * Some pictures fill the frame edge to edge with detail. Placement can only choose
 * among the places that exist, so on those pictures the words land on the subject
 * whatever the search does, and the finished piece is rejected for type sitting on
 * the subject or being hard to read. Regenerating the picture does not help when
 * the next one is as full as the last.
 *
 * This repairs the collision itself and nothing else. The whole picture is kept,
 * every pixel of it, only a little smaller, set on a soft blur of its own colours
 * with its edges feathered into that blur. The blur is calm by construction, so
 * the placement search finds a quiet region to use. Nothing is cropped, nothing is
 * added to the picture, and no idea about what the picture should be is imposed.
 */

/**
 * The share of each dimension the picture keeps, tried from the most picture to the most
 * room. Measured against the real placement search on busy pictures: 78% and 66% still left
 * type on the subject, 56% put it on the quiet backdrop every time, so those are the two
 * that are tried.
 */
export const PICTURE_SCALES = [0.78, 0.56] as const;
/** How softly the picture dissolves into the backdrop, as a share of its own width and height. */
const SIDE_FEATHER = 0.07;
const BOTTOM_FEATHER = 0.10;
const BACKDROP_BLUR = 60;

export interface ReadingSpaceResult {
  data: Buffer;
  width: number;
  height: number;
  /** Where the picture sits, as shares of the canvas. Everything outside it is the quiet backdrop. */
  picture: { x: number; y: number; width: number; height: number };
}

export async function makeReadingSpace(image: Buffer, scale: number = PICTURE_SCALES[0]): Promise<ReadingSpaceResult> {
  const meta = await sharp(image).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 64 || height < 64) throw new Error('The picture is too small to make reading space around.');

  const pictureWidth = Math.round(width * scale);
  const pictureHeight = Math.round(height * scale);
  const left = Math.round((width - pictureWidth) / 2);
  // Flush with the top edge: the picture hangs from the frame instead of sitting inside one.
  const top = 0;

  // The picture's own colours, stretched over the whole canvas and blurred until no detail is left.
  const backdrop = await sharp(image)
    .resize(width, height, { fit: 'cover' })
    .blur(BACKDROP_BLUR)
    .png()
    .toBuffer();

  // The picture at its smaller size. It runs off the top of the canvas and dissolves along its
  // sides and bottom, so it reads as a photograph melting into a field of its own colour and
  // not as a card with a border.
  const sideFeather = Math.round(pictureWidth * SIDE_FEATHER);
  const bottomFeather = Math.round(pictureHeight * BOTTOM_FEATHER);
  const mask = await sharp(Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pictureWidth}" height="${pictureHeight}">
       <rect x="${sideFeather}" y="${-bottomFeather}" width="${pictureWidth - sideFeather * 2}" height="${pictureHeight}" fill="#fff"/>
     </svg>`,
  )).blur(Math.max(sideFeather, bottomFeather) / 2.2).png().toBuffer();

  const picture = await sharp(image)
    .resize(pictureWidth, pictureHeight, { fit: 'fill' })
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  const data = await sharp(backdrop)
    .composite([{ input: picture, left, top }])
    .png()
    .toBuffer();

  return {
    data,
    width,
    height,
    picture: { x: left / width, y: top / height, width: pictureWidth / width, height: pictureHeight / height },
  };
}

export type LegibilityRisk = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

/** What the placement search ended up with, reduced to the two things that decide whether type is readable. */
export interface CollisionReading {
  risk: LegibilityRisk;
  /** The largest share of any text block that sits on the picture's subject, 0 to 1. */
  overlap: number;
}

const RISK_RANK: Record<LegibilityRisk, number> = { LOW: 0, MODERATE: 1, HIGH: 2, CRITICAL: 3 };

/** Whether the best placement found is bad enough that making room is worth a second search. */
export function needsReadingSpace(reading: CollisionReading): boolean {
  return RISK_RANK[reading.risk] >= RISK_RANK.HIGH;
}

/**
 * Whether a second placement is meaningfully safer than the first. A change that only
 * shuffles the same collision somewhere else is not kept, so this can only improve a
 * creative, never trade one problem for another.
 */
export function readingSpaceHelped(before: CollisionReading, after: CollisionReading): boolean {
  if (RISK_RANK[after.risk] !== RISK_RANK[before.risk]) return RISK_RANK[after.risk] < RISK_RANK[before.risk];
  return after.overlap <= before.overlap - 0.1;
}
