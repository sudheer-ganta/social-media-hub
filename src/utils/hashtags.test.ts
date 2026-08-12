import { describe, expect, it } from "vitest";
import { hashtagLimitFor, hashtagsIn, withHashtags } from "./hashtags";

/**
 * Hashtag extraction and appending.
 *
 * `scripts/verify-hashtags.ts` already exercises the append rules under plain
 * node. What is here is the part that script does not cover: scripts that write
 * their vowels as combining marks, which a `\p{L}\p{N}_` character class silently
 * truncates. That failure is invisible in English and corrupts every Devanagari,
 * Arabic, Tamil and Thai tag — and this codebase deliberately reasons about
 * Hinglish and Devanagari elsewhere (`ai/style/measure.ts`), so those tags are an
 * ordinary case rather than a hypothetical one.
 */

describe("hashtagsIn", () => {
  it("reads plain Latin tags", () => {
    expect(hashtagsIn("new drop #StreetwearIndia #OversizedFits")).toEqual([
      "StreetwearIndia",
      "OversizedFits",
    ]);
  });

  it("keeps Devanagari matras rather than truncating at the first letter", () => {
    // Without \p{M} this returns ["द"] — a different word entirely.
    expect(hashtagsIn("घर से #दिल्ली")).toEqual(["दिल्ली"]);
  });

  it("keeps an Arabic tag whole", () => {
    expect(hashtagsIn("#تصميم")).toEqual(["تصميم"]);
  });

  it("stops at punctuation and whitespace", () => {
    expect(hashtagsIn("#one, #two. #three")).toEqual(["one", "two", "three"]);
  });

  it("finds nothing in a caption with no tags", () => {
    expect(hashtagsIn("just words")).toEqual([]);
  });
});

describe("withHashtags", () => {
  it("appends tags as a trailing block", () => {
    expect(withHashtags("A caption", ["one", "two"])).toBe(
      "A caption\n\n#one #two",
    );
  });

  it("is idempotent — applying twice cannot double the tags", () => {
    const once = withHashtags("A caption", ["one", "two"]);
    expect(withHashtags(once, ["one", "two"])).toBe(once);
  });

  it("does not re-add a Devanagari tag the caption already carries", () => {
    // The regression the \p{M} fix prevents: a truncated key would not match, so
    // the tag would be appended a second time.
    const once = withHashtags("घर से", ["दिल्ली"]);
    expect(withHashtags(once, ["दिल्ली"])).toBe(once);
  });

  it("ignores case when deduplicating", () => {
    expect(withHashtags("A caption #One", ["one"])).toBe("A caption #One");
  });

  it("respects the tightest selected network's limit", () => {
    // LinkedIn tolerates three.
    expect(withHashtags("Post", ["a", "b", "c", "d", "e"], ["linkedin"])).toBe(
      "Post\n\n#a #b #c",
    );
  });

  it("takes the tightest limit across several networks", () => {
    expect(hashtagLimitFor(["linkedin", "x"])).toBe(2);
    expect(withHashtags("Post", ["a", "b", "c"], ["linkedin", "x"])).toBe(
      "Post\n\n#a #b",
    );
  });

  it("leaves the caption untouched when every tag is already there", () => {
    const caption = "Post\n\n#a #b";
    expect(withHashtags(caption, ["a", "b"])).toBe(caption);
  });

  it("never reorders or edits what the member typed", () => {
    const caption = "  Odd   spacing  and\n\nline breaks  ";
    expect(withHashtags(caption, ["tag"]).startsWith(caption.trimEnd())).toBe(true);
  });
});
