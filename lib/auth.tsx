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
// HOW TO SWITCH TO REAL SMS LOGIN: set AUTH_MODE to "sms" below, then enable a
// phone provider (e.g. Twilio) in Supabase Dashboard -> Authentication -> Providers.
// Everything else (the sign-in screen, these helpers) already branches on this flag.
// We stay on "email" during development so we can log in without an SMS provider.
export const AUTH_MODE: "email" | "sms" = "email";

/** Send a one-time passcode to the given email (or phone, in sms mode). */
export async function sendOtp(identifier: string) {
  if (AUTH_MODE === "email") {
    return supabase.auth.signInWithOtp({
      email: identifier,
      // Create the auth user on first sign-in (this is our sign-up too).
      options: { shouldCreateUser: true },
    });
  }
  return supabase.auth.signInWithOtp({ phone: identifier });
}

/** Verify the passcode the user typed in. On success, a session is created. */
export async function verifyOtp(identifier: string, token: string) {
  if (AUTH_MODE === "email") {
    return supabase.auth.verifyOtp({ email: identifier, token, type: "email" });
  }
  return supabase.auth.verifyOtp({ phone: identifier, token, type: "sms" });
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
