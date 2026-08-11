import { tokenSimilarity, trigramSimilarity, type Candidate } from './filters';
import {
  captionShape,
  imageConnection,
  voiceDistance,
  type MeasuredStyle,
} from '../style/measure';

/**
 * Which of the survivors go back to the member.
 *
 * The filter answers "is this allowed" and this answers "is this the best one",
 * and both are arithmetic. The model is never asked to rank its own captions
 * for the reason the whole two-engine split exists — see the header of
 * `prompts/analysis.prompt.ts`. A writer scoring its own work returns the order
 * it wrote them in with numbers attached.
 *
 * Three terms, and the weights say what this product thinks a good personal
 * caption is:
 *
 *   voice      0.5  does it sound like them
 *   freshness  0.4  is it a joke they have not already made
 *   image      0.1  does it touch the picture at all
 *
 * Voice leads, but not by so much that a perfectly on-voice rerun of last
 * month's caption wins. With no profile yet — a member's first few posts — the
 * voice term drops out entirely rather than being guessed at, and freshness
 * decides. That is the right behaviour at cold start: with nothing to match,
 * the most surprising option is the best one available.
 */

export interface RankedCandidate extends Candidate {
  score: number;
  /** Kept for the log line, so a strange ordering can be explained. */
  breakdown: { voice: number; freshness: number; image: number };
}

export interface RankOptions {
  /** This member's real captions, for the freshness term. */
  history?: string[];
  /** Vision's observation fields. */
  observations?: string[];
  /** The measured half of their style profile, when they have one. */
  style?: MeasuredStyle | null;
}

const WEIGHTS = { voice: 0.5, freshness: 0.4, image: 0.1 };

/**
 * How unlike anything they have written this is. 1 is brand new.
 *
 * The filter has already rejected anything over its thresholds, so this is
 * ranking the survivors by how far *under* the line they sit. The stronger of
 * the two similarity readings wins, because a caption can be a rerun on either
 * axis independently.
 */
function freshness(text: string, history: string[]): number {
  let closest = 0;
  for (const entry of history) {
    closest = Math.max(
      closest,
      trigramSimilarity(text, entry),
      tokenSimilarity(text, entry),
    );
  }
  return Number((1 - closest).toFixed(3));
}

export function rankCandidates(
  candidates: Candidate[],
  { history = [], observations = [], style }: RankOptions = {},
): RankedCandidate[] {
  const ranked = candidates.map((candidate) => {
    // No profile means no opinion, not a guessed one. Every candidate scores
    // the same on voice and the other two terms decide the order.
    const voice = style ? 1 - voiceDistance(captionShape(candidate.text), style) : 1;
    const fresh = freshness(candidate.text, history);
    const image = imageConnection(candidate.text, observations);

    return {
      ...candidate,
      score: Number(
        (
          WEIGHTS.voice * voice +
          WEIGHTS.freshness * fresh +
          WEIGHTS.image * image
        ).toFixed(4),
      ),
      breakdown: { voice: Number(voice.toFixed(3)), freshness: fresh, image },
    };
  });

  // Stable within a tie: the model's own order is as good a tiebreak as any,
  // and a stable sort makes a regeneration's diff readable.
  return ranked.sort((a, b) => b.score - a.score);
}
