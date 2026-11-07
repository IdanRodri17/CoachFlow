// lib/volume.test.ts — the V28 ladder (lib/volume.ts).

import { describe, expect, it } from "vitest";

import { nextRung, rungsReached, tons, topRung } from "@/lib/volume";

describe("rungsReached", () => {
  it("is empty below the first rung", () => {
    expect(rungsReached(0)).toEqual([]);
    expect(rungsReached(199.9)).toEqual([]);
  });

  it("counts a rung as reached at exactly its weight", () => {
    expect(rungsReached(200)).toEqual(["motorbike"]);
    expect(rungsReached(6_000)).toEqual(["motorbike", "car", "elephant"]);
  });

  it("reaches the whole ladder at 150 t", () => {
    expect(rungsReached(150_000)).toEqual(["motorbike", "car", "elephant", "bus", "whale"]);
  });
});

describe("topRung", () => {
  it("is null before the first rung", () => {
    expect(topRung(150)).toBeNull();
  });

  it("names the heaviest rung and how many fit", () => {
    expect(topRung(36_000)).toEqual({ key: "bus", count: 3 });
    expect(topRung(7_200)).toEqual({ key: "elephant", count: 1 });
    expect(topRung(450)).toEqual({ key: "motorbike", count: 2 });
  });
});

describe("nextRung", () => {
  it("gives the kilos left to the next object", () => {
    expect(nextRung(0)).toEqual({ key: "motorbike", kg: 200, leftKg: 200 });
    expect(nextRung(7_200)).toEqual({ key: "bus", kg: 12_000, leftKg: 4_800 });
  });

  it("is null past the whale", () => {
    expect(nextRung(150_000)).toBeNull();
  });
});

describe("tons", () => {
  it("rounds down to one decimal and drops a trailing .0", () => {
    expect(tons(7_249)).toBe("7.2");
    expect(tons(12_000)).toBe("12");
    expect(tons(80)).toBe("0");
  });
});
