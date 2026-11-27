// lib/badgeRules.test.ts — V9's badge rules, and U7: a session the trainer
// marked done counts as a completed workout.

import { describe, expect, it } from "vitest";

import { badgesToAward, earliestDay } from "./badgeRules";

const NONE = new Set<string>();

describe("badgesToAward", () => {
  it("nothing done yet earns nothing", () => {
    expect(badgesToAward({ firstDay: null, streak: 0, today: "2026-11-27", already: NONE })).toEqual([]);
  });

  it("the first workout earns first_workout; 30 days later, first_month", () => {
    expect(badgesToAward({ firstDay: "2026-11-27", streak: 1, today: "2026-11-27", already: NONE })).toEqual([
      "first_workout",
    ]);
    expect(badgesToAward({ firstDay: "2026-10-28", streak: 1, today: "2026-11-27", already: new Set(["first_workout"]) })).toEqual([
      "first_month",
    ]);
    expect(badgesToAward({ firstDay: "2026-10-29", streak: 1, today: "2026-11-27", already: new Set(["first_workout"]) })).toEqual([]);
  });

  it("a streak of 10 earns streak_10, once", () => {
    const already = new Set(["first_workout", "first_month"]);
    expect(badgesToAward({ firstDay: "2026-01-01", streak: 10, today: "2026-11-27", already })).toEqual(["streak_10"]);
    expect(badgesToAward({ firstDay: "2026-01-01", streak: 12, today: "2026-11-27", already: new Set([...already, "streak_10"]) })).toEqual([]);
  });
});

describe("earliestDay (U7: a session marked done counts)", () => {
  it("takes the earlier of the first log and the first session marked done", () => {
    expect(earliestDay("2026-11-20", "2026-11-03")).toBe("2026-11-03");
    expect(earliestDay("2026-11-02", "2026-11-03")).toBe("2026-11-02");
  });

  it("works with only one of them", () => {
    expect(earliestDay(null, "2026-11-03")).toBe("2026-11-03");
    expect(earliestDay("2026-11-20", null)).toBe("2026-11-20");
    expect(earliestDay(null, null)).toBeNull();
  });
});
