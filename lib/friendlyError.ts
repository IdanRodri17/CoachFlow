// lib/friendlyError.ts — C11/C15/C16: one place that turns any error the app
// can hit into a sentence for the user, in their language.
//
// Errors come from supabase-js (PostgREST, Functions, Auth, Storage), from
// fetch itself, or from a thrown Error. Their text is English and sometimes
// SQL, so it never reaches the screen: it's sorted into one of four kinds and
// the kind picks the string. Under __DEV__ an unrecognised error is logged.
//
// Callers that know a specific error (exercise_in_use,
// completed_workout_locked, daily_limit) check for it first and show their
// own string; everything else goes through here.

import type { TFunction } from "i18next";

export type ErrorKind = "offline" | "notFound" | "notAllowed" | "generic";

// fetch on React Native: "Network request failed"; postgrest-js wraps it as
// "TypeError: Network request failed"; browsers say "Failed to fetch" / "Load
// failed"; Functions: "Failed to send a request to the Edge Function".
const NETWORK = /network request failed|failed to fetch|fetch failed|load failed|network error|timed out|timeout|failed to send a request/i;
const NETWORK_NAMES = new Set(["FunctionsFetchError", "AuthRetryableFetchError", "AbortError"]);

export function errorKind(error: unknown): ErrorKind {
  if (!error || typeof error !== "object") return "generic";
  const e = error as { name?: unknown; message?: unknown; code?: unknown };
  const name = typeof e.name === "string" ? e.name : "";
  const message = typeof e.message === "string" ? e.message : "";
  const code = typeof e.code === "string" ? e.code : "";

  if (NETWORK_NAMES.has(name) || NETWORK.test(message)) return "offline";
  // PostgREST: .single() found no row (deleted, or a stale link).
  if (code === "PGRST116") return "notFound";
  // Postgres insufficient_privilege, which RLS refusals also use.
  if (code === "42501" || /row-level security|permission denied/i.test(message)) return "notAllowed";
  return "generic";
}

const KEY: Record<ErrorKind, string> = {
  offline: "error.offline",
  notFound: "error.notFound",
  notAllowed: "error.notAllowed",
  generic: "error.body",
};

/** The user-facing sentence for any error. */
export function friendlyError(error: unknown, t: TFunction): string {
  const kind = errorKind(error);
  if (kind === "generic" && typeof __DEV__ !== "undefined" && __DEV__) console.warn("[error]", error);
  return t(KEY[kind]);
}

/** What a detail screen shows when it has no row to render: its own
 * "not found" text for a missing row (retrying won't bring it back), the
 * friendly sentence plus a retry for anything else. */
export function screenError(
  error: unknown,
  t: TFunction,
  notFound: string,
): { message: string; canRetry: boolean } {
  if (!error || errorKind(error) === "notFound") return { message: notFound, canRetry: false };
  return { message: friendlyError(error, t), canRetry: true };
}
