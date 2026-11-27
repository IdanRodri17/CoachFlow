// lib/useArchiveClient.ts — archiving and restoring a client (U5; Idan,
// 2026-11-27: "archive only"), shared by the clients list and the client card.
//
// rpc set_client_archived (0048) stamps archived_at and, when archiving,
// deletes the client's upcoming sessions in the same transaction; the confirm
// says how many first. History, workouts, the package and money stay, and
// restoring brings the client back as they were (minus those sessions).

import { Alert } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { qk } from "@/lib/queryKeys";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { todayISO } from "@/lib/dates";

type ClientRef = { kind: "app" | "managed"; refId: string; name: string };

export function useArchiveClient() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const trainerId = session?.user.id ?? null;

  const mutation = useMutation({
    mutationFn: async ({ kind, refId, archived }: { kind: "app" | "managed"; refId: string; archived: boolean }) => {
      const { data, error } = await supabase.rpc("set_client_archived", {
        p_kind: kind,
        p_ref_id: refId,
        p_archived: archived,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // The lists and pickers, the calendar and everything under it
      // (attention, client status, owed), projected money, the card.
      queryClient.invalidateQueries({ queryKey: qk.roster.all });
      queryClient.invalidateQueries({ queryKey: qk.scheduledTrainer.all });
      queryClient.invalidateQueries({ queryKey: qk.money.all });
      queryClient.invalidateQueries({ queryKey: qk.clientDetail.all });
    },
  });

  async function upcomingCount(c: ClientRef): Promise<number | null> {
    if (!trainerId) return null;
    try {
      const { count, error } = await supabase
        .from("scheduled_workouts")
        .select("id", { count: "exact", head: true })
        .eq("trainer_id", trainerId)
        .eq(c.kind === "app" ? "client_id" : "managed_client_id", c.refId)
        .eq("status", "scheduled")
        .gte("scheduled_date", todayISO());
      if (error) return null;
      return count ?? 0;
    } catch {
      return null;
    }
  }

  /** Asks first (saying how many upcoming sessions go with it), then archives. */
  async function archive(c: ClientRef) {
    const count = await upcomingCount(c);
    Alert.alert(
      t("clients.archive.confirmTitle", { name: c.name }),
      count ? t("clients.archive.confirmBodySessions", { count }) : t("clients.archive.confirmBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("clients.archive.confirm"),
          style: "destructive",
          onPress: () => mutation.mutate({ kind: c.kind, refId: c.refId, archived: true }),
        },
      ],
    );
  }

  function restore(c: ClientRef) {
    mutation.mutate({ kind: c.kind, refId: c.refId, archived: false });
  }

  return { archive, restore, pending: mutation.isPending };
}
