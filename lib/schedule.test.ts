// lib/schedule.test.ts — which dates a schedule creates (lib/schedule.ts).

import { describe, expect, it } from "vitest";

import { expandScheduleDates, freeSlots } from "./schedule";

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

describe("freeSlots (D24a)", () => {
  it("offers the gaps of an hour or more around one-hour sessions", () => {
    // The reference day: 07:00, 08:00, 09:30, 12:00, 18:00, 19:30.
    expect(freeSlots(["07:00", "08:00:00", "09:30", "12:00", "18:00", "19:30"])).toEqual([
      { start: "10:30", end: "12:00" },
      { start: "13:00", end: "18:00" },
    ]);
  });

  it("a day with nothing timed is free from 07:00 to 21:00", () => {
    expect(freeSlots([])).toEqual([{ start: "07:00", end: "21:00" }]);
  });

  it("ignores gaps shorter than an hour and sessions outside the day", () => {
    expect(freeSlots(["07:30", "20:30"])).toEqual([{ start: "08:30", end: "20:30" }]);
    expect(freeSlots(["06:00", "21:30"])).toEqual([{ start: "07:00", end: "21:00" }]);
  });

  it("today starts from now, so past gaps aren't offered", () => {
    expect(freeSlots(["12:00"], 10 * 60 + 30)).toEqual([
      { start: "10:30", end: "12:00" },
      { start: "13:00", end: "21:00" },
    ]);
    // 10:59 rounds up to 11:00: exactly an hour before 12:00 still counts.
    expect(freeSlots(["12:00"], 10 * 60 + 59)).toEqual([
      { start: "11:00", end: "12:00" },
      { start: "13:00", end: "21:00" },
    ]);
    expect(freeSlots(["12:00"], 11 * 60 + 1)).toEqual([{ start: "13:00", end: "21:00" }]);
    expect(freeSlots(["12:00"], 9 * 60)).toEqual([
      { start: "09:00", end: "12:00" },
      { start: "13:00", end: "21:00" },
    ]);
  });
});
