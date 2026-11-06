// lib/useScheduleRealtime.ts — the schedule updates live (0038).
//
// One Supabase Realtime subscription per signed-in user, opened by the tab
// layout: a trainer listens to their own scheduled_workouts rows, a client to
// theirs. Any insert or update refetches the schedule queries, so a workout a
// client completes, or one the trainer moves, shows on the other phone at
// once. Realtime applies RLS, so no one hears about a row they can't read.
//
// A burst of changes (a group or a repeat inserts many rows at once) is
// collapsed into one refetch. Deletes aren't delivered to a filtered
// subscription; the refetch on returning to the app (app/_layout.tsx)
// covers those, as before.

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { qk } from "./queryKeys";
import { supabase } from "./supabase";

const BURST_MS = 400;

export function useScheduleRealtime(userId: string | undefined, role: "trainer" | "client" | null | undefined) {
  const queryClient = useQueryClient();
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userId || !role) return;
    const column = role === "trainer" ? "trainer_id" : "client_id";
    // What a schedule change moves: the calendar and everything under it
    // (today, attention, owed, groups), packages, money and the client card —
    // or, for a client, their week, package and streak.
    const families =
      role === "trainer"
        ? [qk.scheduledTrainer.all, qk.package.all, qk.money.all, qk.clientDetail.all, qk.clientContext.all]
        : [qk.scheduledClient.all, qk.package.all, qk.clientStreak.all];

    const refetch = () => {
      if (pending.current) clearTimeout(pending.current);
      pending.current = setTimeout(() => {
        pending.current = null;
        families.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
      }, BURST_MS);
    };

    const channel = supabase
      .channel(`schedule:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scheduled_workouts", filter: `${column}=eq.${userId}` },
        refetch,
      )
      .subscribe();

    return () => {
      if (pending.current) clearTimeout(pending.current);
      void supabase.removeChannel(channel);
    };
  }, [userId, role, queryClient]);
}
