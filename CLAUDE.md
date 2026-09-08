# FlowPost — engineering rules

## The one rule that governs creative generation

**FlowPost must never map an occasion, industry, or content category directly to a
visual layout, symbol set, palette or composition.**

Forbidden, in code or in a prompt:

```
Diwali      → diya layout
Travel      → postcard layout
Sale        → red discount layout
Restaurant  → food photo layout
BTS         → purple K-pop layout
SaaS        → blue gradient layout
```

Required instead:

```
Intent + Brand + Audience + Offer + Context + Research
        ↓
Creative Strategy      ← what is the idea? what is the MECHANISM?
        ↓
Graphic Design Concept ← how does that mechanism become visual?
        ↓
Composition            ← where do things go, derived from the above
        ↓
Mechanical Repair → Render → Critic
```

That is the difference between an AI template generator and a creative direction
system. The whole pipeline was rebuilt around it after every creative — for every
brand and every occasion — collapsed into "big headline left, image right, small
copy, logo in the corner".

### Why the rule is absolute rather than a guideline

The collapse was not written in one commit. It accreted:

- `isSimpleCampaign: /pooja|diwali|bts party|sale/` in the brief
- "For simple campaigns such as Diwali / Anniversary / Sale, a direct typographic
  poster can be the strongest concept" in the art-director prompt
- "ground the visual in the most commonly recognised symbols traditionally
  associated with that occasion" in the concepts and direction prompts
- `anchor ?? 'left-edge'`, `dominantRegion ?? 'left-major'`,
  `negativeSpaceRegion ?? 'upper-right'` in the art-director generator
- `fontScale: isDisplay ? 0.14 : 0.028` in mechanical repair

Each was individually reasonable. Together they were a template engine keyed on
the occasion. Any single addition of the same shape starts it again, which is why
the rule admits no exceptions and is enforced by a test rather than by review.

### Enforcement

`server/src/ai/strategy/no-category-mapping.test.ts` scans every file in the live
generation path and fails if it names a specific occasion, festival, fandom,
holiday or industry — including inside prompt strings. Comments are stripped
before scanning: documenting a removed hardcoding is encouraged, reintroducing it
is not.

If FlowPost handles some occasion badly, that is a signal to improve the strategy
prompt's *reasoning*. It is never a reason to add that occasion's name to the
codebase. Occasion-specific vocabulary is supplied at runtime, per request, by
research and the strategy stage — where symbols are **available to the idea,
never required by it**.

## Corollaries

**No spatial default, ever.** If the model does not decide a spatial property,
the system does not invent one. `anchor: blueprint.anchor ?? 'left-edge'` must not
exist; an undecided placement stays `undefined` and the composition stage derives
it from the idea. Every default position is a template, applied identically to
every brand and every campaign.

**Mechanical repair repairs, it does not art-direct.** It may fix bounds,
contrast, collisions and readability — exactly what validation would reject, and
no more. It may not impose a hierarchy, enlarge a deliberately discreet logo, or
turn one kind of creative into another.

**Copy quantity is a property of the idea.** The art director's `copyPlan` names
the roles the creative needs; roles it omits are dropped even when text exists for
them. Nothing downstream may widen a plan, and no stage may add copy because a
region looks empty. The member's own required claims are the only thing that
survives the trim.

**Brand is a constraint, not a template.** Brand governs tone, vocabulary, palette
and personality. It must never govern composition: the same brand has to be able
to produce a typographic piece, a photographic piece, a collage and a product
piece and stay recognisably itself in all of them.

**Diversity is judged on the idea, not the styling.** Two concepts sharing a
`compositionFamily` must still look nothing alike, so similarity is measured on
mechanism, metaphor, hierarchy, type/image behaviour, spatial relationship and
dominant object — never on palette, typeface or family. See
`server/src/ai/strategy/concept-similarity.ts`.

## Verifying a change

- `npx vitest run server/src/ai/strategy` — the architecture, divergence and
  category-mapping guards.
- `cd server && npx tsx src/scripts/verify-creative-divergence.ts` — a real-model
  run across three matrices (one occasion × four intents, one request × four
  brands, seven unrelated requests). Costs real API calls; prints the mechanism
  each request chose. The unit tests prove the plumbing permits divergence; only
  this proves divergence happens.
