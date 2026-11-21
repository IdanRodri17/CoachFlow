// lib/shareFileName.test.ts — readable, safe names for the shared progress card.

import { describe, expect, it } from "vitest";

import { shareFileName } from "./shareFileName";

describe("shareFileName", () => {
  it("names the card after the client and the day", () => {
    expect(shareFileName("Dana Levi", "2026-11-21")).toBe("CoachFlow-Dana-Levi-2026-11-21.png");
  });

  it("keeps Hebrew names", () => {
    expect(shareFileName("דנה לוי", "2026-11-21")).toBe("CoachFlow-דנה-לוי-2026-11-21.png");
  });

  it("drops characters a file system or chat app might reject", () => {
    expect(shareFileName('Dana/Levi: "the best" 💪', "2026-11-21")).toBe("CoachFlow-DanaLevi-the-best-2026-11-21.png");
  });

  it("falls back to 'progress' without a usable name", () => {
    expect(shareFileName("", "2026-11-21")).toBe("CoachFlow-progress-2026-11-21.png");
    expect(shareFileName(null, "2026-11-21")).toBe("CoachFlow-progress-2026-11-21.png");
    expect(shareFileName("💪💪", "2026-11-21")).toBe("CoachFlow-progress-2026-11-21.png");
  });

  it("keeps long names short", () => {
    const name = shareFileName("A".repeat(100), "2026-11-21");
    expect(name).toBe(`CoachFlow-${"A".repeat(40)}-2026-11-21.png`);
  });
});
