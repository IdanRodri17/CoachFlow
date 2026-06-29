// lib/useRoster.ts — one list combining a trainer's two kinds of client:
//   - "app"     : a real client with an account (trainer_clients -> profiles)
//   - "managed" : an offline client the trainer created by name (managed_clients)
//
// `refId` is what a scheduled_workout points at: the client's profile id for app
// clients, or the managed_clients row id for offline clients. Used by the roster
// list and the scheduling picker.

import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";

export type RosterClient = {
  kind: "app" | "managed";
  refId: string;
  name: string;
};

export function useRosterClients(trainerId: string) {
  return useQuery({
    queryKey: ["roster-clients"],
    queryFn: async (): Promise<RosterClient[]> => {
      const [appRes, managedRes] = await Promise.all([
        supabase
          .from("trainer_clients")
          .select("client_id, created_at")
          .eq("trainer_id", trainerId)
          .order("created_at"),
        supabase
          .from("managed_clients")
          .select("id, name, created_at")
          .eq("trainer_id", trainerId)
          .order("created_at"),
      ]);
      if (appRes.error) throw appRes.error;
      if (managedRes.error) throw managedRes.error;

      // Names for app clients (managed clients carry their own name).
      const ids = (appRes.data ?? []).map((r) => r.client_id);
      const names = new Map<string, string>();
      if (ids.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", ids);
        profs?.forEach((p) => names.set(p.id, p.display_name));
      }

      const app: RosterClient[] = (appRes.data ?? []).map((r) => ({
        kind: "app",
        refId: r.client_id,
        name: names.get(r.client_id) ?? "Client",
      }));
      const managed: RosterClient[] = (managedRes.data ?? []).map((r) => ({
        kind: "managed",
        refId: r.id,
        name: r.name,
      }));
      return [...app, ...managed];
    },
  });
}
