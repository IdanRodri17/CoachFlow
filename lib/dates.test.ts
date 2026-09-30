// lib/dates.test.ts — the Asia/Jerusalem rules every derived number rests on
// (SRS §2.3, §4.1): "today", derived-missed, week starts, and date math that
// must not drift across DST changes or month ends.
//
// "Now" is pinned with fake timers, and every expectation is written in
// Jerusalem local time, so the suite gives the same answer on a UTC CI runner
// as on a phone in Israel.

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addDays,
  addMonths,
  daysBetween,
  isBeforeToday,
  isToday,
  todayISO,
  toDateString,
  weekStartOf,
  weekdayOf,
} from "./dates";

// Pin the clock to an instant given in UTC.
function setNow(isoUtc: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(isoUtc));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("todayISO / isToday — the local day, not the UTC day", () => {
  it("23:30 in Jerusalem is still that day (summer, UTC+3)", () => {
    setNow("2026-07-15T20:30:00Z"); // 23:30 IDT
    expect(todayISO()).toBe("2026-07-15");
    expect(isToday("2026-07-15")).toBe(true);
  });

  it("00:30 in Jerusalem is already the next day while UTC is still on the previous one", () => {
    setNow("2026-07-15T21:30:00Z"); // 00:30 IDT on the 16th, 21:30 UTC on the 15th
    expect(todayISO()).toBe("2026-07-16");
    expect(isToday("2026-07-15")).toBe(false);
  });

  it("uses UTC+2 in winter", () => {
    setNow("2026-01-15T21:59:00Z"); // 23:59 IST
    expect(todayISO()).toBe("2026-01-15");
    setNow("2026-01-15T22:00:00Z"); // 00:00 IST on the 16th
    expect(todayISO()).toBe("2026-01-16");
  });

  it("still honours an explicit time zone", () => {
    setNow("2026-07-15T21:30:00Z");
    expect(todayISO("UTC")).toBe("2026-07-15");
  });
});

describe("isBeforeToday — the derived 'missed' rule (SRS §4.1)", () => {
  it("a workout dated the previous local day is missed", () => {
    setNow("2026-07-16T05:00:00Z"); // 08:00 on the 16th
    expect(isBeforeToday("2026-07-15")).toBe(true);
  });

  it("a workout dated today is not missed, even at 23:30 local", () => {
    setNow("2026-07-15T20:30:00Z"); // 23:30 on the 15th
    expect(isBeforeToday("2026-07-15")).toBe(false);
  });

  it("just after local midnight, yesterday's workout flips to missed although UTC hasn't changed day", () => {
    setNow("2026-07-15T21:05:00Z"); // 00:05 on the 16th local, still the 15th in UTC
    expect(isBeforeToday("2026-07-15")).toBe(true);
  });
});

describe("DST transition days don't shift a date", () => {
  // Israel 2026: summer time starts Fri 27 Mar, ends Sun 25 Oct.
  it("toDateString gives the right local day on both sides of the spring change", () => {
    expect(toDateString(new Date("2026-03-26T22:30:00Z"))).toBe("2026-03-27"); // 00:30 IST
    expect(toDateString(new Date("2026-03-27T21:30:00Z"))).toBe("2026-03-28"); // 00:30 IDT
  });

  it("toDateString gives the right local day on both sides of the autumn change", () => {
    expect(toDateString(new Date("2026-10-24T21:30:00Z"))).toBe("2026-10-25"); // 00:30 IDT
    expect(toDateString(new Date("2026-10-25T22:30:00Z"))).toBe("2026-10-26"); // 00:30 IST
  });

  it("addDays and daysBetween step exactly one calendar day across the changes", () => {
    expect(addDays("2026-03-26", 1)).toBe("2026-03-27");
    expect(addDays("2026-03-27", 1)).toBe("2026-03-28");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
    expect(daysBetween("2026-03-30", "2026-03-25")).toBe(5);
    expect(daysBetween("2026-10-28", "2026-10-23")).toBe(5);
  });
});

describe("date-only math", () => {
  it("addDays crosses month and year ends, forwards and backwards", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29"); // leap year
  });

  it("daysBetween is signed", () => {
    expect(daysBetween("2026-06-28", "2026-06-26")).toBe(2);
    expect(daysBetween("2026-06-26", "2026-06-28")).toBe(-2);
  });

  it("weekdayOf: 0 = Sunday … 6 = Saturday", () => {
    expect(weekdayOf("2026-09-27")).toBe(0); // Sunday
    expect(weekdayOf("2026-10-03")).toBe(6); // Saturday
  });

  it("weekStartOf returns the Sunday of that week (the check-in week)", () => {
    expect(weekStartOf("2026-09-27")).toBe("2026-09-27"); // a Sunday is its own start
    expect(weekStartOf("2026-10-03")).toBe("2026-09-27"); // Saturday → previous Sunday
    expect(weekStartOf("2026-10-01")).toBe("2026-09-27"); // across a month boundary
  });

  it("weekStartOf defaults to the local today", () => {
    setNow("2026-10-03T21:30:00Z"); // 00:30 Sunday 4 Oct local, still Saturday in UTC
    expect(weekStartOf()).toBe("2026-10-04");
  });
});

describe("addMonths", () => {
  it("moves by calendar months and rolls the year", () => {
    expect(addMonths("2026-09-01", 1)).toBe("2026-10-01");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
  });

  it("clamps to the target month's last day instead of spilling into the next month", () => {
    // "Repeat for 1 month" from 31 Jan must end in February, not on 3 March.
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29"); // leap year
    expect(addMonths("2026-03-31", 1)).toBe("2026-04-30");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
  });
});
