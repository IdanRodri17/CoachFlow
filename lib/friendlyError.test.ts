// lib/friendlyError.test.ts — the error shapes supabase-js and fetch really
// produce, sorted into the four kinds the app shows.

import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";

import { errorKind, friendlyError, screenError } from "./friendlyError";

const t = ((key: string) => `t:${key}`) as unknown as TFunction;

describe("errorKind", () => {
  it("is offline for the network failures supabase-js and fetch report", () => {
    // postgrest-js wraps a failed fetch like this on React Native.
    expect(errorKind({ message: "TypeError: Network request failed", details: "", hint: "", code: "" })).toBe("offline");
    expect(errorKind(new TypeError("Network request failed"))).toBe("offline");
    expect(errorKind(new TypeError("Failed to fetch"))).toBe("offline");
    expect(errorKind({ name: "FunctionsFetchError", message: "Failed to send a request to the Edge Function" })).toBe(
      "offline",
    );
    expect(errorKind({ name: "AuthRetryableFetchError", message: "" })).toBe("offline");
    expect(errorKind({ name: "AbortError", message: "Aborted" })).toBe("offline");
  });

  it("is notFound when .single() finds no row", () => {
    expect(
      errorKind({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: "" }),
    ).toBe("notFound");
  });

  it("is notAllowed for RLS and privilege refusals", () => {
    expect(errorKind({ code: "42501", message: 'new row violates row-level security policy for table "x"' })).toBe(
      "notAllowed",
    );
    expect(errorKind({ code: "", message: "permission denied for table packages" })).toBe("notAllowed");
  });

  it("is generic for everything else, including non-objects", () => {
    expect(errorKind({ code: "P0001", message: "A client can only mark a workout completed." })).toBe("generic");
    expect(errorKind({ code: "23505", message: "duplicate key value violates unique constraint" })).toBe("generic");
    expect(errorKind(new Error("something odd"))).toBe("generic");
    expect(errorKind("text")).toBe("generic");
    expect(errorKind(null)).toBe("generic");
    expect(errorKind(undefined)).toBe("generic");
  });
});

describe("friendlyError", () => {
  it("never returns the raw message", () => {
    expect(friendlyError({ code: "P0001", message: "completed_workout_locked" }, t)).toBe("t:error.body");
    expect(friendlyError(new TypeError("Network request failed"), t)).toBe("t:error.offline");
    expect(friendlyError({ code: "PGRST116", message: "x" }, t)).toBe("t:error.notFound");
    expect(friendlyError({ code: "42501", message: "x" }, t)).toBe("t:error.notAllowed");
  });
});

describe("screenError", () => {
  it("shows the screen's own not-found text, without retry, for a missing row", () => {
    expect(screenError(null, t, "Gone.")).toEqual({ message: "Gone.", canRetry: false });
    expect(screenError({ code: "PGRST116", message: "x" }, t, "Gone.")).toEqual({ message: "Gone.", canRetry: false });
  });

  it("offers a retry for anything else", () => {
    expect(screenError(new TypeError("Network request failed"), t, "Gone.")).toEqual({
      message: "t:error.offline",
      canRetry: true,
    });
    expect(screenError(new Error("boom"), t, "Gone.")).toEqual({ message: "t:error.body", canRetry: true });
  });
});
