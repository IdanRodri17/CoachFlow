// lib/devAuth.ts — DEV-ONLY fast account switching.
//
// Real auth is phone/email OTP (lib/auth.tsx). For development it's painful to
// need two real inboxes, so this lets you jump between a throwaway TRAINER and
// CLIENT account instantly. It is only ever called from <DevPanel>, which renders
// solely when __DEV__ is true — so it never reaches a production build.
//
// How it works: fixed fake emails + a shared password. We try to sign in; if the
// account doesn't exist yet we sign up (which returns a session immediately
// because the project has "Confirm email" turned OFF). Then we make sure the
// account has a completed profile with the right role, so onboarding is skipped.

import { supabase } from "@/lib/supabase";

const DEV_PASSWORD = "devpass123";
export const DEV_EMAILS = {
  trainer: "trainer@coachflow.dev",
  client: "client@coachflow.dev",
} as const;

export type DevRole = "trainer" | "client";

export async function devSignInAs(role: DevRole) {
  const email = DEV_EMAILS[role];

  // Sign in, creating the account on first use.
  const signIn = await supabase.auth.signInWithPassword({ email, password: DEV_PASSWORD });
  if (signIn.error) {
    const signUp = await supabase.auth.signUp({ email, password: DEV_PASSWORD });
    if (signUp.error) throw signUp.error;
  }

  // Ensure a complete profile with the right role (so the guards route straight in).
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (user) {
    const now = new Date().toISOString();
    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      role,
      display_name: role === "trainer" ? "Dev Trainer" : "Dev Client",
      accepted_terms_at: now,
      accepted_health_disclaimer_at: now,
    });
    if (error) throw error;
  }
}
