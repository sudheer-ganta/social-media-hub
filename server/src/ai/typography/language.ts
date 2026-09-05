import type { ScriptTag } from './font-catalog';

/**
 * Which script the generated copy is actually in — the hard filter
 * font-selector.ts applies before any style scoring, so FlowPost can never
 * pick a Latin-only display font for Hindi/Bengali/Tamil/Telugu copy (spec
 * §8: "Never select a font that does not support the generated
 * language/script"). Detection, not declaration: the pipeline has no
 * `language` field today, so this reads it off the copy itself via Unicode
 * script ranges — cheap, deterministic, and correct for the mixed-script
 * copy FlowPost actually generates (an English CTA under a Hindi headline
 * scans as two scripts, and both must be satisfied).
 */

const SCRIPT_RANGES: Array<{ script: ScriptTag; pattern: RegExp }> = [
  { script: 'devanagari', pattern: /[ऀ-ॿ]/ },
  { script: 'bengali', pattern: /[ঀ-৿]/ },
  { script: 'tamil', pattern: /[஀-௿]/ },
  { script: 'telugu', pattern: /[ఀ-౿]/ },
];

/** Every script present in the text, Latin always included (punctuation/CTA/numerals ride along even in single-script copy). */
export function detectScripts(text: string): ScriptTag[] {
  const found = new Set<ScriptTag>(['latin']);
  for (const { script, pattern } of SCRIPT_RANGES) {
    if (pattern.test(text)) found.add(script);
  }
  return [...found];
}

/** Scripts across every copy field the renderer will actually set in type — the selector must satisfy all of them. */
export function detectScriptsAcross(texts: Array<string | undefined>): ScriptTag[] {
  const found = new Set<ScriptTag>(['latin']);
  for (const text of texts) {
    if (!text) continue;
    for (const script of detectScripts(text)) found.add(script);
  }
  return [...found];
}
