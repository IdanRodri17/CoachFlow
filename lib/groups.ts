// lib/groups.ts — V23 (Step 15): a group session on read.
//
// A group is one scheduled_workouts row per attendee sharing a
// session_group_id (0035). Nothing about the group is stored: the calendar
// collapses its rows into one entry, and its status comes from the
// attendees' rows by the same rule as a solo workout (SRS §4.1 — missed is
// derived, never stored). Pure, unit-tested in lib/groups.test.ts.

import { isBeforeToday } from "./dates";

type Row = {
  session_group_id: string | null;
  status: "scheduled" | "completed";
  scheduled_date: string;
};

export type DayEntry<W extends Row> = { kind: "session"; w: W } | { kind: "group"; id: string; rows: W[] };

/** Solo rows as they are; a group's rows as one entry, where its first row stood. */
export function collapseGroups<W extends Row>(list: W[]): DayEntry<W>[] {
  const out: DayEntry<W>[] = [];
  const groups = new Map<string, W[]>();
  for (const w of list) {
    if (!w.session_group_id) {
      out.push({ kind: "session", w });
      continue;
    }
    const rows = groups.get(w.session_group_id);
    if (rows) {
      rows.push(w);
    } else {
      const first = [w];
      groups.set(w.session_group_id, first);
      out.push({ kind: "group", id: w.session_group_id, rows: first });
    }
  }
  return out;
}

export type GroupStatus = "completed" | "partial" | "missed" | "planned";

/** Everyone came · some came · nobody came and the day is over · still ahead. */
export function groupStatus(rows: Row[], timeZone?: string): GroupStatus {
  const done = rows.filter((r) => r.status === "completed").length;
  if (rows.length > 0 && done === rows.length) return "completed";
  if (done > 0) return "partial";
  return rows.length > 0 && isBeforeToday(rows[0].scheduled_date, timeZone) ? "missed" : "planned";
}
