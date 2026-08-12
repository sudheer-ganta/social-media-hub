import { describe, expect, it } from "vitest";
import {
  adviseOnMixedMedia,
  defaultContentType,
  optionsFor,
  qualityNotes,
  whyUnavailable,
} from "./content-type";
import type { ProviderCapabilities } from "@/types/capabilities";
import type { PostMediaItem } from "@/types";

/**
 * What the composer offers, given capabilities and attached media.
 *
 * The capability objects below are *fixtures shaped like the API's response*,
 * not a copy of the real rules — the real ones live on the server and this
 * module has no opinion about them. What is tested is the reasoning: that a
 * Reel is offered when there is a video and disabled with a sentence when there
 * is not, that a video does not silently become a Reel, and that a mixed upload
 * produces a route out rather than "Invalid media".
 */

const instagram: ProviderCapabilities = {
  IMAGE: {
    label: "Post",
    description: "One image on your feed.",
    minItems: 1,
    maxItems: 1,
    requiresMedia: true,
    maxCaptionLength: 2200,
    image: { mimeTypes: ["image/jpeg"], maxBytes: 8 * 1024 * 1024, recommendedMinWidth: 1080 },
    transport: "url",
  },
  CAROUSEL: {
    label: "Carousel",
    description: "Two to ten images.",
    minItems: 2,
    maxItems: 10,
    requiresMedia: true,
    maxCaptionLength: 2200,
    image: { mimeTypes: ["image/jpeg"], maxBytes: 8 * 1024 * 1024 },
    transport: "url",
  },
  REEL: {
    label: "Reel",
    description: "Short vertical video.",
    minItems: 1,
    maxItems: 1,
    requiresMedia: true,
    maxCaptionLength: 2200,
    video: {
      mimeTypes: ["video/mp4"],
      maxBytes: 1024 * 1024 * 1024,
      minDurationMs: 3000,
      maxDurationMs: 900_000,
      recommendedMinWidth: 1080,
      recommendedMinHeight: 1920,
    },
    aspectRatio: { min: 0.01, max: 10, recommended: "9:16", recommendedMin: 0.5, recommendedMax: 0.6 },
    transport: "url",
  },
  STORY: {
    label: "Story",
    description: "Visible for 24 hours.",
    minItems: 1,
    maxItems: 1,
    requiresMedia: true,
    maxCaptionLength: 0,
    image: { mimeTypes: ["image/jpeg"], maxBytes: 8 * 1024 * 1024 },
    video: { mimeTypes: ["video/mp4"], maxBytes: 1024 * 1024 * 1024, maxDurationMs: 60_000 },
    transport: "url",
  },
};

const facebook: ProviderCapabilities = {
  TEXT: {
    label: "Post",
    description: "Text on your Page.",
    minItems: 0,
    maxItems: 0,
    requiresMedia: false,
    maxCaptionLength: 63_206,
    transport: "url",
  },
  IMAGE: {
    label: "Photo post",
    description: "One photo.",
    minItems: 1,
    maxItems: 1,
    requiresMedia: true,
    maxCaptionLength: 63_206,
    image: { mimeTypes: ["image/jpeg", "image/png"], maxBytes: 4 * 1024 * 1024 },
    transport: "url",
  },
};

function image(overrides: Partial<PostMediaItem> = {}): PostMediaItem {
  return {
    id: `image-${Math.random()}`,
    url: "https://res.cloudinary.com/demo/image/upload/v1/p.jpg",
    type: "image",
    width: 1080,
    height: 1080,
    crop: null,
    mimeType: "image/jpeg",
    bytes: 500_000,
    ...overrides,
  };
}

function video(overrides: Partial<PostMediaItem> = {}): PostMediaItem {
  return {
    id: `video-${Math.random()}`,
    url: "https://res.cloudinary.com/demo/video/upload/v1/c.mp4",
    type: "video",
    width: 1080,
    height: 1920,
    crop: null,
    mimeType: "video/mp4",
    bytes: 12 * 1024 * 1024,
    durationMs: 18_000,
    posterUrl: "https://res.cloudinary.com/demo/video/upload/v1/c.jpg",
    ...overrides,
  };
}

describe("options are built from capabilities, never from network names", () => {
  it("offers every format the network declares, in a stable order", () => {
    expect(optionsFor(instagram, [image()]).map((option) => option.label)).toEqual([
      "Post",
      "Carousel",
      "Reel",
      "Story",
    ]);

    // Facebook has two keys, so it gets two buttons. No branch anywhere says so.
    expect(optionsFor(facebook, []).map((option) => option.label)).toEqual([
      "Post",
      "Photo post",
    ]);
  });

  it("shows unusable formats disabled with a reason rather than hiding them", () => {
    const options = optionsFor(instagram, [image()]);
    const reel = options.find((option) => option.label === "Reel")!;

    expect(reel.available).toBe(false);
    // Precise about what is wrong with what is *there*, rather than the generic
    // "add a video" a member with nothing attached gets.
    expect(reel.reason).toBe("Needs a video, not an image.");
    expect(whyUnavailable(instagram.REEL!, [])).toBe("Add a video.");
    // A format that vanishes when the media changes reads as a bug.
    expect(options).toHaveLength(4);
  });

  it("says what each format wants when it is usable", () => {
    const options = optionsFor(instagram, [image(), image()]);
    expect(options.find((option) => option.label === "Carousel")).toMatchObject({
      available: true,
      requirement: "2–10 images",
    });
    expect(options.find((option) => option.label === "Reel")!.requirement).toBe(
      "1 video",
    );
  });
});

describe("a video is not automatically a Reel", () => {
  it("offers both Reel and Story for one video, and picks neither for the member", () => {
    const options = optionsFor(instagram, [video()]);
    const usable = options.filter((option) => option.available).map((o) => o.label);
    expect(usable).toEqual(["Reel", "Story"]);
  });

  it("defaults to the first available format in the declared order", () => {
    // Post before Story for a single image — the ordinary thing to want.
    expect(defaultContentType(instagram, [image()])).toBe("IMAGE");
    // Reel before Story for a video, for the same reason.
    expect(defaultContentType(instagram, [video()])).toBe("REEL");
  });

  it("never defaults to a format that cannot be used", () => {
    // Nothing attached: the only formats Instagram has all require media.
    expect(defaultContentType(instagram, [])).toBeNull();
  });

  it("a single image is not a Story unless it is chosen", () => {
    const story = optionsFor(instagram, [image()]).find((o) => o.label === "Story")!;
    expect(story.available).toBe(true);
    // Available, and not the default. Selecting it stays the member's decision.
    expect(defaultContentType(instagram, [image()])).not.toBe("STORY");
  });
});

describe("reasons a format is unavailable", () => {
  it("names the count, and how many to add or remove", () => {
    expect(whyUnavailable(instagram.CAROUSEL!, [image()])).toBe(
      "Needs 2 items — add 1 more.",
    );
    expect(whyUnavailable(instagram.CAROUSEL!, Array.from({ length: 12 }, image))).toBe(
      "Holds 10 — remove 2.",
    );
  });

  it("names the format when the file type is wrong", () => {
    expect(whyUnavailable(instagram.IMAGE!, [image({ mimeType: "image/png" })])).toBe(
      "Doesn't accept PNG.",
    );
  });

  it("names duration when the video is too long or too short", () => {
    expect(whyUnavailable(instagram.STORY!, [video({ durationMs: 90_000 })])).toBe(
      "Too long — takes up to 1:00.",
    );
    expect(whyUnavailable(instagram.REEL!, [video({ durationMs: 1_000 })])).toBe(
      "Too short — needs 0:03.",
    );
  });

  it("passes an unmeasured duration rather than blocking on it", () => {
    expect(
      whyUnavailable(instagram.REEL!, [video({ durationMs: undefined })]),
    ).toBeNull();
  });

  it("tells a text post to lose its media", () => {
    expect(whyUnavailable(facebook.TEXT!, [image()])).toBe(
      "Remove the media to post text only.",
    );
  });

  it("never produces a message with provider internals in it", () => {
    const messages = [
      whyUnavailable(instagram.REEL!, []),
      whyUnavailable(instagram.REEL!, [image()]),
      whyUnavailable(instagram.CAROUSEL!, [video()]),
      whyUnavailable(instagram.IMAGE!, [image({ bytes: 20 * 1024 * 1024 })]),
    ].filter((message): message is string => message !== null);

    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) {
      expect(message).not.toMatch(/media_type|HTTP|cloudinary|undefined|\{|\}/i);
      // A sentence, not a code.
      expect(message).toMatch(/\.$/);
    }
  });
});

describe("mixed image and video", () => {
  it("explains the conflict and offers both routes out", () => {
    const media = [image(), image(), image(), video()];
    const advice = adviseOnMixedMedia(instagram, media, "Instagram")!;

    expect(advice.summary).toBe("You added 3 images and 1 video.");
    expect(advice.explanation).toContain("Instagram");
    // Never a bare "Invalid media" — both halves of what they uploaded have a
    // use, and each is a button.
    expect(advice.actions.map((action) => action.label)).toEqual([
      "Use the images as a Carousel",
      "Use the video as a Reel",
    ]);
  });

  it("hands back exactly the ids to keep for each route", () => {
    const images = [image(), image()];
    const clip = video();
    const advice = adviseOnMixedMedia(instagram, [...images, clip], "Instagram")!;

    expect(advice.actions[0].keepIds).toEqual(images.map((item) => item.id));
    expect(advice.actions[0].contentType).toBe("CAROUSEL");
    expect(advice.actions[1].keepIds).toEqual([clip.id]);
    expect(advice.actions[1].contentType).toBe("REEL");
  });

  it("says nothing when the mix is fine as it is", () => {
    // One image and one video, where Story would take either — but neither
    // format takes both, so there *is* a conflict. With images only there is
    // none, and inventing one would be noise.
    expect(adviseOnMixedMedia(instagram, [image(), image()], "Instagram")).toBeNull();
    expect(adviseOnMixedMedia(instagram, [video()], "Instagram")).toBeNull();
    expect(adviseOnMixedMedia(instagram, [], "Instagram")).toBeNull();
  });

  it("offers the half that works when the other half has no use", () => {
    // Facebook can publish the photo and not the clip. One action is still a
    // route out, and offering it beats telling the member only what is wrong.
    const advice = adviseOnMixedMedia(facebook, [image(), video()], "Facebook")!;
    expect(advice.actions.map((action) => action.label)).toEqual([
      "Use the image as a Photo post",
    ]);
  });

  it("says nothing at all when neither half has a use", () => {
    // No actions means no advice. A block that names a problem and offers
    // nothing is a dead end dressed as help.
    const textOnly: ProviderCapabilities = { TEXT: facebook.TEXT! };
    expect(adviseOnMixedMedia(textOnly, [image(), video()], "Facebook")).toBeNull();
  });
});

describe("quality notes are warnings, not blocks", () => {
  it("warns about a 16:9 Reel and offers the crop", () => {
    const notes = qualityNotes(instagram.REEL!, video({ width: 1920, height: 1080 }));
    const framing = notes.find((note) => note.kind === "aspect-ratio")!;

    expect(framing.message).toContain("16:9");
    expect(framing.message).toContain("9:16");
    expect(framing.suggestedRatio).toBe("9:16");

    // And it is still publishable — the note is advice, not a refusal.
    expect(whyUnavailable(instagram.REEL!, [video({ width: 1920, height: 1080 })])).toBeNull();
  });

  it("warns about a soft video without disabling the format", () => {
    const soft = video({ width: 720, height: 1280 });
    expect(qualityNotes(instagram.REEL!, soft).some((n) => n.kind === "resolution")).toBe(
      true,
    );
    expect(whyUnavailable(instagram.REEL!, [soft])).toBeNull();
  });

  it("says nothing about a 1080×1920 Reel", () => {
    expect(qualityNotes(instagram.REEL!, video())).toEqual([]);
  });

  it("reaches different verdicts per format for the same file", () => {
    // A Story declares no aspect window in this fixture, so the same 16:9 clip
    // that draws a note as a Reel draws none as a Story. One global "is this
    // good?" check could not express that.
    const wide = video({ width: 1920, height: 1080 });
    expect(qualityNotes(instagram.REEL!, wide).length).toBeGreaterThan(0);
    expect(qualityNotes(instagram.STORY!, wide)).toEqual([]);
  });
});
