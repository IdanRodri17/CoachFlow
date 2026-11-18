// lib/authRoute.test.ts — the (tabs) guard's routing decision (C3).

import { describe, expect, it } from "vitest";

import { authRoute } from "@/lib/authRoute";
import type { Profile } from "@/lib/auth";

const done = {
  role: "trainer",
  accepted_terms_at: "2026-01-01",
  accepted_health_disclaimer_at: "2026-01-01",
  intake: null,
} as unknown as Profile;
const client = { ...done, role: "client" } as unknown as Profile;
const session = { user: { id: "u1" } };

describe("authRoute", () => {
  it("no session goes to sign-in", () => {
    expect(authRoute(null, null, false)).toBe("signIn");
  });
  it("a failed read with no cached profile retries instead of onboarding", () => {
    expect(authRoute(session, null, true)).toBe("retry");
  });
  it("a successful read with no profile goes to onboarding", () => {
    expect(authRoute(session, null, false)).toBe("onboarding");
  });
  it("an incomplete profile goes to onboarding", () => {
    expect(authRoute(session, { ...done, role: null } as unknown as Profile, false)).toBe("onboarding");
  });
  it("a cached profile stays usable after a failed refresh", () => {
    expect(authRoute(session, done, true)).toBe("app");
  });
  it("a client without intake goes to intake", () => {
    expect(authRoute(session, client, false)).toBe("intake");
  });
  it("a complete trainer goes to the app", () => {
    expect(authRoute(session, done, false)).toBe("app");
  });
});
