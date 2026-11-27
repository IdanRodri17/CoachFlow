// lib/video.test.ts — demo-video links: recognize them, and shorten them for
// the exercise form's one-line field.

import { describe, expect, it } from "vitest";

import { canonicalVideoUrl, isValidVideoUrl, parseVideoUrl } from "./video";

describe("parseVideoUrl", () => {
  it("reads the id from YouTube's link shapes", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=-bJIpOq-LWk",
      "https://www.youtube.com/watch?feature=share&v=-bJIpOq-LWk",
      "https://youtu.be/-bJIpOq-LWk?si=abc123",
      "youtube.com/embed/-bJIpOq-LWk",
      "https://youtube.com/shorts/-bJIpOq-LWk",
    ]) {
      expect(parseVideoUrl(url)).toEqual({ provider: "youtube", id: "-bJIpOq-LWk" });
    }
  });

  it("reads Vimeo ids", () => {
    expect(parseVideoUrl("https://player.vimeo.com/video/76979871")).toEqual({ provider: "vimeo", id: "76979871" });
  });

  it("rejects other links", () => {
    expect(parseVideoUrl("https://example.com/video")).toBeNull();
    expect(isValidVideoUrl("")).toBe(false);
  });
});

describe("canonicalVideoUrl", () => {
  it("shortens a full YouTube watch link", () => {
    expect(canonicalVideoUrl("https://www.youtube.com/watch?v=bVrmtCI0OYs&t=30s")).toBe("https://youtu.be/bVrmtCI0OYs");
  });

  it("keeps a short link as it is", () => {
    expect(canonicalVideoUrl(" https://youtu.be/bVrmtCI0OYs ")).toBe("https://youtu.be/bVrmtCI0OYs");
  });

  it("shortens Vimeo player links", () => {
    expect(canonicalVideoUrl("https://player.vimeo.com/video/76979871")).toBe("https://vimeo.com/76979871");
  });

  it("returns anything else trimmed, for the form to reject", () => {
    expect(canonicalVideoUrl("  not a link ")).toBe("not a link");
    expect(canonicalVideoUrl("")).toBe("");
  });

  it("fits the field: a short YouTube link is 28 characters", () => {
    expect(canonicalVideoUrl("https://www.youtube.com/watch?v=-bJIpOq-LWk")).toHaveLength(28);
  });
});
