// lib/authRoute.ts — where the signed-in guard should send the user.
//
// Pure so it can be tested. The key rule (C3): a FAILED profile read must never
// look like "no profile", or an onboarded user is sent to onboarding, whose Save
// upserts over their real profile.

import type { Profile } from "@/lib/auth";

/** True once the user has finished onboarding: role set + both consents stamped. */
export function profileComplete(profile: Profile | null): boolean {
  return (
    !!profile &&
    !!profile.role &&
    !!profile.accepted_terms_at &&
    !!profile.accepted_health_disclaimer_at
  );
}

export type AuthRoute = "signIn" | "onboarding" | "intake" | "retry" | "app";

export function authRoute(
  session: unknown,
  profile: Profile | null,
  profileError: boolean,
): AuthRoute {
  if (!session) return "signIn";
  if (profileError && !profile) return "retry";
  if (!profileComplete(profile)) return "onboarding";
  if (profile?.role === "client" && profile.intake == null) return "intake";
  return "app";
}
