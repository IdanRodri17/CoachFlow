// lib/schedule.test.ts — which dates a schedule creates (lib/schedule.ts).

import { describe, expect, it } from "vitest";

import { expandScheduleDates } from "./schedule";

describe("expandScheduleDates", () => {
  it("is just the date without a repeat (or with no weekdays chosen)", () => {
    expect(expandScheduleDates("2026-10-01")).toEqual(["2026-10-01"]);
    expect(expandScheduleDates("2026-10-01", { days: [], count: 4, unit: "weeks" })).toEqual(["2026-10-01"]);
  });

  it("Sun + Thu for 8 weeks from a Thursday is exactly 16 sessions", () => {
    // 2026-10-01 is a Thursday.
    const dates = expandScheduleDates("2026-10-01", { days: [0, 4], count: 8, unit: "weeks" });
    expect(dates).toHaveLength(16);
    expect(dates[0]).toBe("2026-10-01");
    expect(dates[1]).toBe("2026-10-04");
    expect(dates[dates.length - 1]).toBe("2026-11-22");
  });

  it("stops before the end date (N weeks later is not included)", () => {
    const dates = expandScheduleDates("2026-10-01", { days: [4], count: 4, unit: "weeks" });
    expect(dates).toEqual(["2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22"]);
  });

  it("months use calendar months, clamped at month end", () => {
    // 31 Jan + 1 month ends on 28 Feb: Saturdays from 31 Jan up to (not incl.) 28 Feb.
    const dates = expandScheduleDates("2026-01-31", { days: [6], count: 1, unit: "months" });
    expect(dates).toEqual(["2026-01-31", "2026-02-07", "2026-02-14", "2026-02-21"]);
  });

  it("falls back to the start date when no chosen weekday falls in range", () => {
    expect(expandScheduleDates("2026-10-01", { days: [5], count: 0, unit: "weeks" })).toEqual(["2026-10-01"]);
  });
});
