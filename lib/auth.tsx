// lib/auth.tsx — the app's authentication layer, in one place.
//
// It does three jobs:
//   1. AUTH_MODE + helpers: send and verify a one-time passcode (OTP). One flag
//      switches the whole app between email OTP (dev) and phone/SMS OTP (prod).
//   2. AuthProvider: tracks the logged-in Supabase session AND the user's
//      profile row, and exposes them to the whole app via the useAuth() hook.
//   3. profileComplete(): the single definition of "this user has finished
//      onboarding" (has a role + accepted both consents), used by the route guards.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

// ---------------------------------------------------------------------------
// 1) OTP mode + helpers
// ---------------------------------------------------------------------------
//
// V18a: SMS login. Supabase Auth has no SMS4Free provider, so the codes go out
// through the Send SMS auth hook (supabase/functions/send-sms-hook — its header
// lists the dashboard setup). "email" stays available as the fallback mode; the
// dev quick-switch (DevPanel) uses email+password and doesn't read this flag.
export const AUTH_MODE: "email" | "sms" = "sms";

/**
 * Normalize an Israeli mobile number to E.164 (+9725XXXXXXXX) — the only phone
 * format Supabase Auth accepts. People type "050-123-4567", "0501234567",
 * "+972 50…" or even "+9720501234567"; all become "+972501234567". Returns
 * null for anything that isn't an Israeli mobile (Israeli numbers only for
 * now — SMS4Free delivers only within Israel).
 */
export function toE164IL(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  const national = (digits.startsWith("972") ? digits.slice(3) : digits).replace(/^0/, "");
  return /^5\d{8}$/.test(national) ? `+972${national}` : null;
}

/** Send a one-time passcode to the given email (or phone, in sms mode). */
export async function sendOtp(identifier: string) {
  if (AUTH_MODE === "email") {
    return supabase.auth.signInWithOtp({
      email: identifier,
      // Create the auth user on first sign-in (this is our sign-up too).
      options: { shouldCreateUser: true },
    });
  }
  // Normalized here as well as on the screen so send and verify can never
  // disagree on the format — Auth matches the code to the exact string.
  return supabase.auth.signInWithOtp({ phone: toE164IL(identifier) ?? identifier });
}

/** Verify the passcode the user typed in. On success, a session is created. */
export async function verifyOtp(identifier: string, token: string) {
  if (AUTH_MODE === "email") {
    return supabase.auth.verifyOtp({ email: identifier, token, type: "email" });
  }
  return supabase.auth.verifyOtp({ phone: toE164IL(identifier) ?? identifier, token, type: "sms" });
}

/** True once the user has finished onboarding: role set + both consents stamped. */
export function profileComplete(profile: Profile | null): boolean {
  return (
    !!profile &&
    !!profile.role &&
    !!profile.accepted_terms_at &&
    !!profile.accepted_health_disclaimer_at
  );
}

// ---------------------------------------------------------------------------
// 2) Auth context
// ---------------------------------------------------------------------------
type AuthContextValue = {
  /** True while we're still figuring out the session / loading the profile. */
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  /** Re-fetch the profile row (call after onboarding writes it). Re-enters the
   * global loading state — use patchProfile for in-place settings changes. */
  refreshProfile: () => Promise<void>;
  /** Merge an already-persisted change into the cached profile, without
   * re-entering the loading state (so the tab navigator isn't remounted). */
  patchProfile: (patch: Partial<Profile>) => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  // Two-stage loading: first we resolve the session, then (if any) the profile.
  const [authLoading, setAuthLoading] = useState(true);
  const [profileResolved, setProfileResolved] = useState(false);

  // Fetch the current user's profile row (RLS returns only their own).
  //
  // On a read ERROR we deliberately keep whatever profile we already had. The
  // old code did `setProfile(data ?? null)` unconditionally, so one flaky
  // request collapsed profile to null — and since profileComplete(null) is
  // false, (tabs)/_layout.tsx would eject a fully-onboarded user to the
  // onboarding screen, with no way back until app restart (this effect only
  // re-runs on session change).
  const loadProfile = useCallback(async (userId: string) => {
    setProfileResolved(false);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (!error) setProfile(data ?? null);
    setProfileResolved(true);
  }, []);

  // Merge a known-saved change into the cached profile WITHOUT re-entering the
  // loading state. refreshProfile() flips profileResolved to false, which makes
  // AuthContext.loading true, which makes (tabs)/_layout.tsx replace the whole
  // navigator with a spinner — remounting every tab and losing their state.
  // That's the right trade on login, but far too heavy for a settings toggle.
  const patchProfile = useCallback((patch: Partial<Profile>) => {
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  // On mount: read any persisted session, then listen for login/logout changes.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Whenever the session changes, (re)load or clear the profile.
  useEffect(() => {
    if (session?.user) {
      loadProfile(session.user.id);
    } else {
      setProfile(null);
      setProfileResolved(true);
    }
  }, [session, loadProfile]);

  const value: AuthContextValue = {
    // Still loading if the session isn't resolved yet, or we have a session but
    // haven't finished checking for its profile row.
    loading: authLoading || (!!session && !profileResolved),
    session,
    profile,
    refreshProfile: async () => {
      if (session?.user) await loadProfile(session.user.id);
    },
    patchProfile,
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Access auth state anywhere: const { session, profile, signOut } = useAuth(); */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
