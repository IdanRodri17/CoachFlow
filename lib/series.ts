// lib/series.ts — V23 Step 12: "this workout only" or "this and all future".
//
// A series is the rows one repeat insert created (scheduled_workouts.series_id,
// 0031). The schedule edit screen asks for a scope when the open workout has
// later siblings, and everything that touches more than one row goes through
// the helpers below, so the rule lives in exactly one place:
//
//   A SERIES-SCOPED WRITE ONLY TOUCHES ROWS THAT ARE STILL 'scheduled' AND
//   DATED TODAY OR LATER (Asia/Jerusalem, lib/dates.ts). Completing a workout
//   already moved packages.used_sessions (trg_increment_used_sessions) and
//   counts in trainer_monthly_money; rewriting or deleting it would corrupt
//   the package balance and the trainer's revenue history. Past rows are
//   history. The helpers compute the floor date themselves — a caller can't
//   pass an earlier one.
//
// Only scheduled_time, template_id, notes and with_trainer can be applied to
// a series. scheduled_date never is (moving one Sunday must not move every
// Sunday), and neither is the client; assertSeriesPatch rejects both rather
// than trusting the caller.
//
// The pure rules are unit-tested in lib/series.test.ts, including the exact
// filters each query sends.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { todayISO } from "./dates";

type Db = Pick<SupabaseClient<Database>, "from">;
type Row = Database["public"]["Tables"]["scheduled_workouts"]["Row"];

export const SERIES_FIELDS = ["scheduled_time", "template_id", "notes", "with_trainer"] as const;
export type SeriesField = (typeof SERIES_FIELDS)[number];
export type SeriesPatch = Partial<Pick<Row, SeriesField>>;

/** The open workout, as the edit screen loaded it (before any edit). */
export type SeriesMember = Pick<Row, "id" | "series_id" | "status" | "scheduled_date">;

/** The earliest date a series write may touch: the open workout's date, and never before today. */
export function seriesFloor(fromDate: string, today: string = todayISO()): string {
  return fromDate > today ? fromDate : today;
}

/** Whether the scope question can apply at all, before asking the database
 * about siblings: part of a series, still scheduled, today or later. */
export function canActOnSeries(row: SeriesMember, today: string = todayISO()): boolean {
  return row.series_id != null && row.status === "scheduled" && row.scheduled_date >= today;
}

// The form edits times as "HH:MM"; the database returns "HH:MM:SS".
function sameValue(field: SeriesField, a: unknown, b: unknown): boolean {
  if (field === "scheduled_time") {
    const hm = (v: unknown) => (typeof v === "string" ? v.slice(0, 5) : null);
    return hm(a) === hm(b);
  }
  if (field === "notes") {
    const text = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
    return text(a) === text(b);
  }
  return (a ?? null) === (b ?? null);
}

/** The series fields the edit actually changed. Siblings get only these, so
 * changing the time doesn't also overwrite each sibling's own note. */
export function changedSeriesFields(
  before: Pick<Row, SeriesField>,
  after: Pick<Row, SeriesField>,
): SeriesPatch {
  const patch: SeriesPatch = {};
  for (const field of SERIES_FIELDS) {
    if (!sameValue(field, before[field], after[field])) {
      (patch as Record<string, unknown>)[field] = after[field];
    }
  }
  return patch;
}

/** Throws on anything that may not be applied to a series. */
export function assertSeriesPatch(patch: Record<string, unknown>): asserts patch is SeriesPatch {
  const allowed: readonly string[] = SERIES_FIELDS;
  const bad = Object.keys(patch).filter((key) => !allowed.includes(key));
  if (bad.length > 0) throw new Error(`Not a series field: ${bad.join(", ")}`);
}

/** Ids of the OTHER workouts in the series the scope question would affect. */
export async function futureSiblings(db: Db, row: SeriesMember): Promise<string[]> {
  if (!row.series_id) return [];
  const { data, error } = await db
    .from("scheduled_workouts")
    .select("id")
    .eq("series_id", row.series_id)
    .eq("status", "scheduled")
    .gte("scheduled_date", seriesFloor(row.scheduled_date))
    .neq("id", row.id);
  if (error) throw error;
  return (data ?? []).map((r) => r.id);
}

/** Applies the patch to the open workout's future siblings (the open
 * workout itself is saved by the screen, with its full edit). Returns how
 * many siblings changed. */
export async function applyToSeries(db: Db, row: SeriesMember, patch: SeriesPatch): Promise<number> {
  assertSeriesPatch(patch);
  if (!row.series_id || Object.keys(patch).length === 0) return 0;
  const { data, error } = await db
    .from("scheduled_workouts")
    .update(patch)
    .eq("series_id", row.series_id)
    .eq("status", "scheduled")
    .gte("scheduled_date", seriesFloor(row.scheduled_date))
    .neq("id", row.id)
    .select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

/** Deletes the open workout and its future siblings. Returns how many rows went. */
export async function deleteFromSeries(db: Db, row: SeriesMember): Promise<number> {
  if (!row.series_id) return 0;
  const { data, error } = await db
    .from("scheduled_workouts")
    .delete()
    .eq("series_id", row.series_id)
    .eq("status", "scheduled")
    .gte("scheduled_date", seriesFloor(row.scheduled_date))
    .select("id");
  if (error) throw error;
  return data?.length ?? 0;
}
