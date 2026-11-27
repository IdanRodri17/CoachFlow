// lib/packageRenewal.test.ts — U4: renewing carries what's left over.

import { describe, expect, it } from "vitest";

import { renewedPackage } from "./packageRenewal";

describe("renewedPackage", () => {
  it("adds what's left of the old package to the new one", () => {
    expect(renewedPackage({ total: 10, used: 8 }, 10)).toEqual({ total: 12, used: 0 });
  });

  it("a used-up package starts the new one clean", () => {
    expect(renewedPackage({ total: 10, used: 10 }, 10)).toEqual({ total: 10, used: 0 });
  });

  it("sessions done beyond the old package count against the new one", () => {
    expect(renewedPackage({ total: 10, used: 12 }, 10)).toEqual({ total: 10, used: 2 });
  });

  it("the first package is just its size", () => {
    expect(renewedPackage({ total: 0, used: 0 }, 8)).toEqual({ total: 8, used: 0 });
  });
});
