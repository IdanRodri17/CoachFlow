// components/QuickAddSheet.tsx — D21a/D21b: what the trainer's volt [+] opens
// (docs/design/screens/trainer-quick-add.html): four create tiles, then
// "קביעה מהירה ל…" — the five clients with the most sessions in the last 30
// days (tap → the schedule form with that client picked) — and "מחכה לך":
// today's earliest offline-client workout that isn't marked done yet, with
// the same mark-done as Home. It stays a sheet component opened by the tab
// bar (not the playbook's modal route): it already opens from every tab.

import { Pressable, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import CalendarPlus from "lucide-react-native/icons/calendar-plus";
import Check from "lucide-react-native/icons/check";
import Dumbbell from "lucide-react-native/icons/dumbbell";
import Layers from "lucide-react-native/icons/layers";
import UserPlus from "lucide-react-native/icons/user-plus";

import { qk } from "@/lib/queryKeys";
import { frequentClientsQuery, todaySessionsQuery } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { addDays, todayISO } from "@/lib/dates";
import { ltr } from "@/lib/i18n";
import { useRosterClients } from "@/lib/useRoster";
import { firstName } from "@/components/home/format";
import { AppText, Avatar, Button, colors, Icon, Sheet, type IconComponent } from "@/components/ui";

export function QuickAddSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const trainerId = session?.user.id ?? "";
  const today = todayISO();

  const roster = useRosterClients(trainerId, { enabled: visible && !!trainerId });
  const frequent = useQuery({
    ...frequentClientsQuery(trainerId, addDays(today, -30), today),
    enabled: visible && !!trainerId,
  });
  const todays = useQuery({ ...todaySessionsQuery(trainerId, today), enabled: visible && !!trainerId });

  const byKey = new Map((roster.data ?? []).map((c) => [c.kind === "app" ? c.refId : `m:${c.refId}`, c]));
  const quick = (frequent.data ?? []).map((k) => byKey.get(k)).filter((c) => c != null);
  const waiting = (todays.data ?? []).find((w) => w.managed_client_id && w.status !== "completed");
  const waitingClient = waiting ? byKey.get(`m:${waiting.managed_client_id}`) : undefined;

  const markDone = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("scheduled_workouts").update({ status: "completed" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.scheduledTrainer.all });
      queryClient.invalidateQueries({ queryKey: qk.clientRisk.all });
      queryClient.invalidateQueries({ queryKey: qk.money.all });
    },
  });

  function go(href: Href) {
    onClose();
    router.push(href);
  }

  const tiles: { icon: IconComponent; label: string; href: Href }[] = [
    { icon: CalendarPlus, label: t("quickAdd.schedule"), href: "/schedule/new" },
    // Opens the Clients tab with its add-client sheet already up.
    { icon: UserPlus, label: t("quickAdd.client"), href: "/clients?add=1" },
    { icon: Layers, label: t("quickAdd.template"), href: "/templates/new" },
    { icon: Dumbbell, label: t("quickAdd.exercise"), href: "/exercises/new" },
  ];

  return (
    <Sheet visible={visible} onClose={onClose} closeLabel={t("quickAdd.close")} title={t("quickAdd.title")}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {tiles.map((tile) => (
          <Pressable
            key={tile.label}
            accessibilityRole="button"
            onPress={() => go(tile.href)}
            style={({ pressed }) => ({
              width: "48.5%",
              flexGrow: 1,
              height: 104,
              borderRadius: 20,
              backgroundColor: colors.chalk,
              padding: 14,
              justifyContent: "space-between",
              transform: [{ scale: pressed ? 0.97 : 1 }],
            })}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                backgroundColor: colors.paper,
                borderWidth: 1,
                borderColor: colors.line,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon icon={tile.icon} size={22} />
            </View>
            <AppText size={16} weight="semibold">
              {tile.label}
            </AppText>
          </Pressable>
        ))}
      </View>

      {quick.length > 0 ? (
        <View style={{ gap: 10 }}>
          <AppText size={14} weight="semibold" tone="graphite">
            {t("quickAdd.quickSchedule")}
          </AppText>
          <View style={{ flexDirection: "row", gap: 4 }}>
            {quick.map((c) => (
              <Pressable
                key={`${c.kind}-${c.refId}`}
                accessibilityRole="button"
                accessibilityLabel={t("quickAdd.scheduleFor", { name: c.name })}
                onPress={() =>
                  go({ pathname: "/schedule/new", params: { clientKind: c.kind, clientId: c.refId } })
                }
                style={({ pressed }) => ({ flex: 1, alignItems: "center", gap: 6, minHeight: 76, opacity: pressed ? 0.7 : 1 })}
              >
                <Avatar id={c.refId} name={c.name} size={52} />
                <AppText size={13} weight="medium" center numberOfLines={1}>
                  {firstName(c.name)}
                </AppText>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {waiting && waitingClient ? (
        <View style={{ gap: 10 }}>
          <AppText size={14} weight="semibold" tone="graphite">
            {t("quickAdd.waiting")}
          </AppText>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              padding: 12,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: colors.line,
            }}
          >
            <Avatar id={waitingClient.refId} name={waitingClient.name} size={44} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <AppText size={15} weight="semibold" numberOfLines={1}>
                {waiting.scheduled_time
                  ? `${waitingClient.name} · ${ltr(waiting.scheduled_time.slice(0, 5))}`
                  : waitingClient.name}
              </AppText>
              <AppText size={13} tone="graphite" numberOfLines={1}>
                {`${waiting.template_name} · ${t("trainerHome.notMarked")}`}
              </AppText>
            </View>
            <Button
              label={t("trainerHome.markDone")}
              icon={Check}
              variant="secondary"
              size={44}
              disabled={markDone.isPending}
              onPress={() => markDone.mutate(waiting.id)}
            />
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}
