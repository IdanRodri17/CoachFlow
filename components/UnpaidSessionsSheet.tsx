// components/UnpaidSessionsSheet.tsx — which sessions a client hasn't paid
// for (Idan, 2026-11-27: "I have 6 unpaid but I can't find them").
//
// The client card counted them, but an app client's workouts list shows
// workout logs, so a session the trainer only marked done (no log) was in
// the count and nowhere else. This lists every finished, unpaid session —
// logged or marked — newest first, with its price (the one it was done at,
// 0049) and "שולם" per row; the card keeps "סימון כשולם" for all at once.

import { ActivityIndicator, ScrollView, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Check from "lucide-react-native/icons/check";

import { qk } from "@/lib/queryKeys";
import { supabase } from "@/lib/supabase";
import { ltr } from "@/lib/i18n";
import { friendlyError } from "@/lib/friendlyError";
import { formatMoney, shortDate, weekdayLetter } from "@/components/home/format";
import { AppText, Button, colors, Sheet } from "@/components/ui";

type Unpaid = {
  id: string;
  date: string;
  time: string | null;
  withTrainer: boolean;
  name: string | null;
  price: number | null;
};

export function UnpaidSessionsSheet({
  visible,
  onClose,
  kind,
  refId,
  trainerId,
  packagePrice,
}: {
  visible: boolean;
  onClose: () => void;
  kind: "app" | "managed";
  refId: string;
  trainerId: string;
  /** For a session that had no price when it was done (as "owed" counts it). */
  packagePrice: number | null;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const lang = i18n.language;

  const list = useQuery({
    queryKey: qk.scheduledTrainer.unpaid(kind, refId),
    enabled: visible,
    queryFn: async (): Promise<Unpaid[]> => {
      const { data, error } = await supabase
        .from("scheduled_workouts")
        .select("id, scheduled_date, scheduled_time, with_trainer, template_id, price")
        .eq("trainer_id", trainerId)
        .eq(kind === "app" ? "client_id" : "managed_client_id", refId)
        .eq("status", "completed")
        .eq("paid", false)
        .order("scheduled_date", { ascending: false });
      if (error) throw error;
      const tplIds = [...new Set(data.map((s) => s.template_id).filter(Boolean) as string[])];
      const names = new Map<string, string>();
      if (tplIds.length > 0) {
        const { data: tpls } = await supabase.from("workout_templates").select("id, name").in("id", tplIds);
        tpls?.forEach((tpl) => names.set(tpl.id, tpl.name));
      }
      return data.map((s) => ({
        id: s.id,
        date: s.scheduled_date,
        time: s.scheduled_time ? s.scheduled_time.slice(0, 5) : null,
        withTrainer: s.with_trainer,
        name: s.template_id ? (names.get(s.template_id) ?? null) : null,
        price: s.price,
      }));
    },
  });

  const markPaid = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("scheduled_workouts").update({ paid: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.scheduledTrainer.unpaid(kind, refId) });
      queryClient.invalidateQueries({ queryKey: qk.scheduledTrainer.owed });
      queryClient.invalidateQueries({ queryKey: qk.clientDetail.subject(kind, refId) });
      queryClient.invalidateQueries({ queryKey: qk.money.all });
    },
  });

  const rows = list.data ?? [];

  return (
    <Sheet visible={visible} onClose={onClose} closeLabel={t("common.back")} title={t("clientCard.unpaidList.title")}>
      {list.isLoading ? (
        <ActivityIndicator color={colors.ink} />
      ) : list.error ? (
        <AppText size={14} tone="ember">
          {friendlyError(list.error, t)}
        </AppText>
      ) : rows.length === 0 ? (
        <AppText size={15} tone="graphite">
          {t("clientCard.package.allPaid")}
        </AppText>
      ) : (
        <ScrollView style={{ maxHeight: 420 }}>
          {rows.map((r, i) => {
            const price = r.price ?? packagePrice;
            return (
              <View
                key={r.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingVertical: 10,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: colors.line,
                }}
              >
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <AppText size={15} weight="semibold" numberOfLines={1}>
                    {r.name ?? t("workout.freeWorkout")}
                  </AppText>
                  <AppText size={13} tone="graphite" numberOfLines={1}>
                    {[
                      `${weekdayLetter(r.date, lang)} ${shortDate(r.date, lang)}`,
                      r.time ? ltr(r.time) : null,
                      r.withTrainer ? t("trainerHome.withTrainer") : t("trainerHome.solo"),
                      price != null ? ltr(`₪${formatMoney(price, lang)}`) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </AppText>
                </View>
                <Button
                  label={t("clientCard.unpaidList.paid")}
                  icon={Check}
                  variant="secondary"
                  size={44}
                  disabled={markPaid.isPending}
                  onPress={() => markPaid.mutate(r.id)}
                />
              </View>
            );
          })}
        </ScrollView>
      )}
    </Sheet>
  );
}
