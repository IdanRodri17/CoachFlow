// lib/useMyTrainer.ts — the signed-in client's trainer, from rpc("my_trainer")
// (0026, main B1): { id, display_name, business_name, phone, linked_since },
// or null for an unlinked client. Trainers never get a row, so the query only
// runs for clients. The client screens use it to say "אלון" instead of "your
// trainer"; they keep the generic copy while it loads or when there's none.
//
// The copy is phrased so it doesn't need the trainer's gender (Hebrew verbs
// agree with it): "ההחלפה והסיבה יופיעו אצל אלון", not "אלון יראה".

import { useQuery } from "@tanstack/react-query";

import { qk } from "./queryKeys";
import { supabase } from "./supabase";
import { useAuth } from "./auth";

export function useMyTrainer() {
  const { session, profile } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: qk.myTrainer.own(userId),
    enabled: !!userId && profile?.role === "client",
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_trainer").maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

/** "אלון כהן" → "אלון"; null when there's no trainer (yet). */
export function trainerFirstName(trainer: { display_name: string } | null | undefined): string | null {
  const first = trainer?.display_name?.trim().split(/\s+/)[0];
  return first ? first : null;
}
