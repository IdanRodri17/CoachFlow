// lib/groups.test.ts — a group session on read (lib/groups.ts): the calendar
// collapses a group's rows into one entry, and the group's status comes from
// its attendees' rows.

import { describe, expect, it } from "vitest";

import { collapseGroups, groupStatus } from "@/lib/groups";
import { addDays, todayISO } from "@/lib/dates";

const TODAY = todayISO();
const YESTERDAY = addDays(TODAY, -1);
const TOMORROW = addDays(TODAY, 1);

type R = { id: string; session_group_id: string | null; status: "scheduled" | "completed"; scheduled_date: string };
const row = (id: string, group: string | null, status: R["status"] = "scheduled", date = TODAY): R => ({
  id,
  session_group_id: group,
  status,
  scheduled_date: date,
});

describe("collapseGroups", () => {
  it("keeps solo rows as they are, in order", () => {
    const entries = collapseGroups([row("a", null), row("b", null)]);
    expect(entries).toEqual([
      { kind: "session", w: row("a", null) },
      { kind: "session", w: row("b", null) },
    ]);
  });

  it("collapses a group's rows into one entry where its first row stood", () => {
    const entries = collapseGroups([row("a", null), row("g1", "G"), row("b", null), row("g2", "G")]);
    expect(entries.map((e) => (e.kind === "session" ? e.w.id : `group:${e.id}`))).toEqual(["a", "group:G", "b"]);
    const group = entries[1];
    expect(group.kind === "group" && group.rows.map((r) => r.id)).toEqual(["g1", "g2"]);
  });

  it("keeps two groups on the same day apart", () => {
    const entries = collapseGroups([row("g1", "G"), row("h1", "H"), row("g2", "G"), row("h2", "H")]);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.kind === "group" && e.rows.length === 2)).toBe(true);
  });
});

describe("groupStatus", () => {
  it("is completed when every attendee came", () => {
    expect(groupStatus([row("1", "G", "completed"), row("2", "G", "completed")])).toBe("completed");
  });

  it("is partial when some came, whatever the day", () => {
    expect(groupStatus([row("1", "G", "completed"), row("2", "G")])).toBe("partial");
    expect(groupStatus([row("1", "G", "completed", YESTERDAY), row("2", "G", "scheduled", YESTERDAY)])).toBe("partial");
  });

  it("is missed when nobody came and the day is over", () => {
    expect(groupStatus([row("1", "G", "scheduled", YESTERDAY), row("2", "G", "scheduled", YESTERDAY)])).toBe("missed");
  });

  it("is planned today and later while nobody is marked", () => {
    expect(groupStatus([row("1", "G"), row("2", "G")])).toBe("planned");
    expect(groupStatus([row("1", "G", "scheduled", TOMORROW)])).toBe("planned");
  });
});
