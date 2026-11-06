// app/group/[groupId].tsx — V23 (Step 15): a group session's attendance sheet.
//
// A group is one scheduled_workouts row per attendee sharing a
// session_group_id (0035). Each attendee's checkbox flips THAT attendee's own
// row between scheduled and completed, so the package trigger, money,
// streaks and risk work per person exactly as for a solo session. "סימון
// שכולם הגיעו" completes every row still open. Each attendee also has their
// paid toggle (once they came) and a link to their client card. The group's
// status is derived on read (lib/groups.ts); nothing about it is stored.
//
// Attendance opens on the day itself, like "סימון כבוצע" on the calendar. A
// row with a workout log (logged in the workout screen) stays done here.
// Known gap, reported rather than patched: trg_increment_used_sessions counts
// only the change TO completed, so unchecking someone leaves their package
// one session short.

import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Check from "lucide-react-native/icons/check";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import User from "lucide-react-native/icons/user";

import { qk } from "@/lib/queryKeys";
import { RoleGate } from "@/components/RoleGate";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { ltr } from "@/lib/i18n";
import { groupStatus } from "@/lib/groups";
import { useRosterClients } from "@/lib/useRoster";
import { usePullToRefresh } from "@/lib/usePullToRefresh";
import { longDate } from "@/components/home/format";
import { AppText, Button, Checkbox, Chip, colors, Display, IconButton, ListCard } from "@/components/ui";

export default function GroupAttendanceScreen() {
  return (
    <RoleGate role="trainer">
      <GroupAttendanceBody />
    </RoleGate>
  );
}

function GroupAttendanceBody() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const trainerId = session!.user.id;
  const { groupId } = useLocalSearchParams<{ groupId: string }>();

  const group = useQuery({
    queryKey: qk.scheduledTrainer.group(groupId),
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("scheduled_workouts")
        .select("id, client_id, managed_client_id, scheduled_date, scheduled_time, status, paid, template_id, session_group_id")
        .eq("trainer_id", trainerId)
        .eq("session_group_id", groupId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const ids = rows.map((r) => r.id);
      const templateId = rows[0]?.template_id ?? null;
      const [logRes, tplRes] = await Promise.all([
        ids.length > 0
          ? supabase.from("workout_logs").select("scheduled_workout_id").in("scheduled_workout_id", ids)
          : Promise.resolve({ data: [] as { scheduled_workout_id: string }[], error: null }),
        templateId
          ? supabase.from("workout_templates").select("name").eq("id", templateId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (logRes.error) throw logRes.error;
      return {
        rows,
        logged: new Set(logRes.data.map((l) => l.scheduled_workout_id)),
        templateName: tplRes.data?.name ?? null,
      };
    },
  });
  const roster = useRosterClients(trainerId);
  const refresh = usePullToRefresh([qk.scheduledTrainer.all, qk.roster.all]);

  // Attendance moves packages, money, streaks and risk, like "סימון כבוצע".
  const afterChange = () => {
    queryClient.invalidateQueries({ queryKey: qk.scheduledTrainer.all });
    queryClient.invalidateQueries({ queryKey: qk.package.all });
    queryClient.invalidateQueries({ queryKey: qk.money.all });
    queryClient.invalidateQueries({ queryKey: qk.clientRisk.all });
    queryClient.invalidateQueries({ queryKey: qk.clientStreak.all });
    queryClient.invalidateQueries({ queryKey: qk.clientDetail.all });
    queryClient.invalidateQueries({ queryKey: qk.clientContext.all });
  };
  const setPresent = useMutation({
    mutationFn: async ({ id, present }: { id: string; present: boolean }) => {
      const { error } = await supabase
        .from("scheduled_workouts")
        .update({ status: present ? "completed" : "scheduled" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: afterChange,
  });
  const markAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("scheduled_workouts")
        .update({ status: "completed" })
        .eq("trainer_id", trainerId)
        .eq("session_group_id", groupId)
        .eq("status", "scheduled");
      if (error) throw error;
    },
    onSuccess: afterChange,
  });
  const togglePaid = useMutation({
    mutationFn: async ({ id, paid }: { id: string; paid: boolean }) => {
      const { error } = await supabase.from("scheduled_workouts").update({ paid }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: afterChange,
  });

  if (group.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.chalk }}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  const rows = group.data?.rows ?? [];
  const lead = rows[0];
  const busy = setPresent.isPending || markAll.isPending || togglePaid.isPending;
  const canMark = !!lead && lead.scheduled_date <= todayISO();
  const came = rows.filter((r) => r.status === "completed").length;
  const status = groupStatus(rows);
  const mutationError = setPresent.error ?? markAll.error ?? togglePaid.error;
  const nameOf = (r: (typeof rows)[number]) =>
    (roster.data ?? []).find((c) =>
      r.client_id ? c.kind === "app" && c.refId === r.client_id : c.kind === "managed" && c.refId === r.managed_client_id,
    )?.name ?? t("schedule.home.client");

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.chalk }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: insets.bottom + 30, gap: 18 }}
      refreshControl={<RefreshControl {...refresh} />}
    >
      <View style={{ height: 52, flexDirection: "row", alignItems: "center" }}>
        <IconButton
          icon={ChevronLeft}
          mirror
          iconSize={22}
          accessibilityLabel={t("common.back")}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/schedule"))}
        />
      </View>

      {group.error || !lead ? (
        <AppText size={14} tone="ember">
          {group.error ? (group.error as Error).message : t("group.notFound")}
        </AppText>
      ) : (
        <>
          <View style={{ gap: 8 }}>
            <Display size={38} numberOfLines={2}>
              {group.data?.templateName ?? t("schedule.home.workout")}
            </Display>
            <AppText size={14} tone="graphite">
              {[
                longDate(lead.scheduled_date, i18n.language),
                lead.scheduled_time ? ltr(lead.scheduled_time.slice(0, 5)) : null,
                t("sessionForm.groupSummary", { count: rows.length }),
              ]
                .filter(Boolean)
                .join(" · ")}
            </AppText>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {status === "completed" ? (
                <Chip kind="done" label={t("group.allCame")} />
              ) : status === "missed" ? (
                <Chip kind="missed" label={t("schedule.home.missed")} />
              ) : came > 0 ? (
                <Chip kind="neutral" label={t("group.came", { came, total: rows.length })} />
              ) : null}
            </View>
          </View>

          {!canMark ? (
            <AppText size={14} tone="graphite">
              {t("group.opensOnTheDay")}
            </AppText>
          ) : came < rows.length ? (
            <Button
              label={t("group.markAll")}
              icon={Check}
              variant="secondary"
              size={48}
              block
              loading={markAll.isPending}
              disabled={busy}
              onPress={() => markAll.mutate()}
            />
          ) : null}

          {mutationError ? (
            <AppText size={14} tone="ember">
              {(mutationError as Error).message}
            </AppText>
          ) : null}

          <View style={{ gap: 10 }}>
            <AppText size={18} weight="semibold" lineHeight={23}>
              {t("group.attendees")}
            </AppText>
            <ListCard>
              {rows.map((r) => {
                const present = r.status === "completed";
                const logged = group.data?.logged.has(r.id) ?? false;
                const kind = r.client_id ? "app" : "managed";
                const refId = (r.client_id ?? r.managed_client_id)!;
                return (
                  <View
                    key={r.id}
                    style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 14 }}
                  >
                    <View style={{ flex: 1, minWidth: 0, justifyContent: "center" }}>
                      <Checkbox
                        checked={present}
                        disabled={!canMark || busy || (present && logged)}
                        onToggle={() => setPresent.mutate({ id: r.id, present: !present })}
                      >
                        {nameOf(r)}
                      </Checkbox>
                      {logged ? (
                        <AppText size={12} tone="smoke">
                          {t("group.logged")}
                        </AppText>
                      ) : null}
                    </View>
                    {present ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={r.paid ? t("clientCard.markUnpaid") : t("clientCard.package.markPaid")}
                        disabled={busy}
                        onPress={() => togglePaid.mutate({ id: r.id, paid: !r.paid })}
                        hitSlop={10}
                        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                      >
                        <Chip kind={r.paid ? "done" : "unpaid"} label={r.paid ? t("clientCard.paid") : t("clientCard.unpaid")} />
                      </Pressable>
                    ) : null}
                    <IconButton
                      icon={User}
                      variant="ghost"
                      accessibilityLabel={t("schedule.home.clientCard")}
                      onPress={() => router.push(`/dashboard/${refId}?kind=${kind}`)}
                    />
                  </View>
                );
              })}
            </ListCard>
          </View>
        </>
      )}
    </ScrollView>
  );
}
