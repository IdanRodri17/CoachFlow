// lib/series.test.ts — the "this and all future" rules (lib/series.ts). The
// database helpers run against a fake that records the query they build, so
// the hard rule — only 'scheduled' rows dated today or later — is checked on
// the exact filters sent, not on a description of them.

import { describe, expect, it } from "vitest";

import {
  applyToSeries,
  assertSeriesPatch,
  canActOnSeries,
  changedSeriesFields,
  deleteFromSeries,
  futureSiblings,
  seriesFloor,
  type SeriesMember,
} from "@/lib/series";
import { todayISO, addDays } from "@/lib/dates";

const TODAY = todayISO();

type Call = [method: string, ...args: unknown[]];

/** A stand-in for supabase.from(...): every builder method is recorded, and
 * awaiting the chain resolves to `rows`. */
function fakeDb(rows: { id: string }[] = []) {
  const calls: Call[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "update", "delete", "eq", "neq", "gte"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    };
  }
  builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
  const db = {
    from: (table: string) => {
      calls.push(["from", table]);
      return builder;
    },
  };
  return { db: db as never, calls };
}

const member = (over: Partial<SeriesMember> = {}): SeriesMember => ({
  id: "open",
  series_id: "series-1",
  status: "scheduled",
  scheduled_date: addDays(TODAY, 3),
  ...over,
});

const fields = {
  scheduled_time: "18:00:00",
  template_id: "tpl-a",
  notes: "bring bands",
  with_trainer: true,
};

describe("seriesFloor", () => {
  it("starts at the open workout when it's in the future", () => {
    expect(seriesFloor("2030-05-10", "2030-05-01")).toBe("2030-05-10");
  });
  it("never reaches back before today", () => {
    expect(seriesFloor("2030-04-20", "2030-05-01")).toBe("2030-05-01");
  });
});

describe("canActOnSeries", () => {
  it("is true for a scheduled workout in a series, today or later", () => {
    expect(canActOnSeries(member({ scheduled_date: TODAY }))).toBe(true);
  });
  it("is false for a one-off", () => {
    expect(canActOnSeries(member({ series_id: null }))).toBe(false);
  });
  it("is false for a completed workout", () => {
    expect(canActOnSeries(member({ status: "completed" }))).toBe(false);
  });
  it("is false for a past workout", () => {
    expect(canActOnSeries(member({ scheduled_date: addDays(TODAY, -1) }))).toBe(false);
  });
});

describe("changedSeriesFields", () => {
  it("returns only what the edit changed", () => {
    expect(changedSeriesFields(fields, { ...fields, scheduled_time: "19:00" })).toEqual({ scheduled_time: "19:00" });
  });
  it("treats HH:MM and HH:MM:SS as the same time", () => {
    expect(changedSeriesFields(fields, { ...fields, scheduled_time: "18:00" })).toEqual({});
  });
  it("treats an empty note and no note as the same", () => {
    expect(changedSeriesFields({ ...fields, notes: null }, { ...fields, notes: "  " })).toEqual({});
  });
  it("carries a cleared template or time", () => {
    expect(changedSeriesFields(fields, { ...fields, template_id: null, scheduled_time: null })).toEqual({
      template_id: null,
      scheduled_time: null,
    });
  });
});

describe("assertSeriesPatch", () => {
  it("accepts the four series fields", () => {
    expect(() => assertSeriesPatch({ scheduled_time: "19:00", template_id: null, notes: "x", with_trainer: false })).not.toThrow();
  });
  it("rejects moving the date of every occurrence", () => {
    expect(() => assertSeriesPatch({ scheduled_date: "2030-01-01" })).toThrow(/scheduled_date/);
  });
  it("rejects changing the client of every occurrence", () => {
    expect(() => assertSeriesPatch({ client_id: "c", notes: "x" })).toThrow(/client_id/);
  });
});

describe("series queries only touch scheduled rows from today on", () => {
  it("futureSiblings: other rows of this series, scheduled, from the open date", async () => {
    const { db, calls } = fakeDb([{ id: "a" }, { id: "b" }]);
    const row = member();
    expect(await futureSiblings(db, row)).toEqual(["a", "b"]);
    expect(calls).toEqual([
      ["from", "scheduled_workouts"],
      ["select", "id"],
      ["eq", "series_id", "series-1"],
      ["eq", "status", "scheduled"],
      ["gte", "scheduled_date", row.scheduled_date],
      ["neq", "id", "open"],
    ]);
  });

  it("applyToSeries: sends only the patch, never the open row, never history", async () => {
    const { db, calls } = fakeDb([{ id: "a" }]);
    expect(await applyToSeries(db, member(), { scheduled_time: "19:00" })).toBe(1);
    expect(calls).toContainEqual(["update", { scheduled_time: "19:00" }]);
    expect(calls).toContainEqual(["eq", "status", "scheduled"]);
    expect(calls).toContainEqual(["neq", "id", "open"]);
  });

  it("applyToSeries: a floor in the past is lifted to today", async () => {
    const { db, calls } = fakeDb();
    await applyToSeries(db, member({ scheduled_date: addDays(TODAY, -14) }), { notes: "x" });
    expect(calls).toContainEqual(["gte", "scheduled_date", TODAY]);
  });

  it("applyToSeries: refuses a date change before touching the database", async () => {
    const { db, calls } = fakeDb();
    await expect(applyToSeries(db, member(), { scheduled_date: "2030-01-01" } as never)).rejects.toThrow(
      /scheduled_date/,
    );
    expect(calls).toEqual([]);
  });

  it("applyToSeries: nothing to send for an empty patch or a one-off", async () => {
    const { db, calls } = fakeDb();
    expect(await applyToSeries(db, member(), {})).toBe(0);
    expect(await applyToSeries(db, member({ series_id: null }), { notes: "x" })).toBe(0);
    expect(calls).toEqual([]);
  });

  it("deleteFromSeries: the open row and later scheduled ones, nothing completed or past", async () => {
    const { db, calls } = fakeDb([{ id: "open" }, { id: "a" }]);
    const row = member();
    expect(await deleteFromSeries(db, row)).toBe(2);
    expect(calls).toEqual([
      ["from", "scheduled_workouts"],
      ["delete"],
      ["eq", "series_id", "series-1"],
      ["eq", "status", "scheduled"],
      ["gte", "scheduled_date", row.scheduled_date],
      ["select", "id"],
    ]);
  });
});
