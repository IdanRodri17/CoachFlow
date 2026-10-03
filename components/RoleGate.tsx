// components/RoleGate.tsx — V19 (Step 2b): a screen's role check, done BEFORE
// the screen's own hooks mount.
//
// Screens used to begin with
//   if (profile && profile.role !== "trainer") return <Redirect href="/" />;
// and call their hooks after it. That breaks React's Rules of Hooks — the
// number of hooks called could change between renders — and only worked
// because a role never changes while a screen is open. ESLint's
// react-hooks/rules-of-hooks flags it as an error. Wrapping the screen body
// instead means the body, and every hook in it, only ever mounts for the
// right role.
//
// Same behaviour as the old inline guard: while the profile is still null
// (loading), the screen renders — the (tabs) layout's guards already handle
// signed-out and not-yet-onboarded users. The redesign's layout work (D21)
// can later move role gating into Stack.Protected / Tabs.Protected groups and
// retire this component.

import type { ReactNode } from "react";
import { Redirect, type Href } from "expo-router";

import { useAuth } from "@/lib/auth";

export function RoleGate({
  role,
  redirectTo = "/",
  children,
}: {
  role: "trainer" | "client";
  redirectTo?: Href;
  children: ReactNode;
}) {
  const { profile } = useAuth();
  if (profile && profile.role !== role) return <Redirect href={redirectTo} />;
  return <>{children}</>;
}
