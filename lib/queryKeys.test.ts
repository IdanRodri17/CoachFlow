// lib/queryKeys.test.ts — enforces the one rule lib/queryKeys.ts exists for:
// every key in a family starts with that family's `all` prefix, so
// invalidating `all` always reaches it. A key added in the wrong shape fails
// here, in CI, instead of silently going stale on a phone (8966dc3).

import { describe, expect, it } from "vitest";

import { qk } from "./queryKeys";

type KeyBuilder = readonly unknown[] | ((...args: unknown[]) => readonly unknown[]);
type Family = Record<string, KeyBuilder> & { all: readonly unknown[] };

// Call any builder with placeholder arguments of the right arity. Each
// placeholder is a one-element array, so builders that take a list of ids
// (templates.byIds) work too — only the prefix is compared anyway.
function build(entry: KeyBuilder): readonly unknown[] {
  if (typeof entry !== "function") return entry;
  return entry(...Array.from({ length: entry.length }, (_, i) => [`arg${i}`]));
}

const families = Object.entries(qk as unknown as Record<string, Record<string, KeyBuilder>>).filter(
  (e): e is [string, Family] => "all" in e[1],
);

describe("lib/queryKeys", () => {
  it.each(families)("every %s key starts with its family prefix", (_name, family) => {
    for (const [entryName, entry] of Object.entries(family)) {
      if (entryName === "all") continue;
      const key = build(entry);
      expect(key.slice(0, family.all.length), entryName).toEqual([...family.all]);
    }
  });

  it("family prefixes are unique, so one family never invalidates another by accident", () => {
    const firsts = families.map(([, f]) => f.all[0]);
    expect(new Set(firsts).size).toBe(firsts.length);
  });

  it("keeps the shapes other code still writes literally (app/workout/[id].tsx)", () => {
    // Until the redesign's D20a lands, the workout screen invalidates these
    // literals; the factory must keep producing keys they match.
    expect(qk.scheduledClient.upcoming.slice(0, 1)).toEqual(["scheduled-client"]);
    expect(qk.scheduledTrainer.range("a", "b").slice(0, 1)).toEqual(["scheduled-trainer"]);
    expect(qk.package.own("u")).toEqual(["package", "u"]);
    expect(qk.package.subject("app", "u")).toEqual(["package", "app", "u"]);
    expect(qk.badges.own("u")).toEqual(["badges", "u"]);
    expect(qk.clientDetail.subject("app", "u")).toEqual(["client-detail", "app", "u"]);
    expect(qk.exercises.list.slice(0, 1)).toEqual(["exercises"]);
  });
});
