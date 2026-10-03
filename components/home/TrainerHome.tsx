// components/home/TrainerHome.tsx — D23b: the trainer's Home
// (docs/design/screens/trainer-home.html).
//
// Top to bottom: date + greeting with the avatar (→ settings); the dark "הבא
// בתור" card for the next timed session today (minutes until, client,
// template, last effort/note, package left, WhatsApp + client card); "היום"
// with every session today (WhatsApp per row, "סימון כבוצע" for offline
// clients); "לתשומת לבך"; the month's money card (→ Money).
//
// "לתשומת לבך" reads client_risk for now. The full feed (renewals,
// adjustments, PRs) comes from the trainer_attention view once the main
// session builds it (D23a / B2). Every number comes from the DB views; none
// is computed or faked here.

import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Activity from "lucide-react-native/icons/activity";
import Check from "lucide-react-native/icons/check";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Clock from "lucide-react-native/icons/clock";
import MessageCircle from "lucide-react-native/icons/message-circle";
import Ticket from "lucide-react-native/icons/ticket";
import TriangleAlert from "lucide-react-native/icons/triangle-alert";
import User from "lucide-react-native/icons/user";

import { qk } from "@/lib/queryKeys";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { ltr } from "@/lib/i18n";
import { useRosterClients, type RosterClient } from "@/lib/useRoster";
import { buildWhatsAppReminderLink } from "@/lib/whatsapp";
import {
  AppText,
  Avatar,
  Button,
  Card,
  Chip,
  colors,
  Display,
  Icon,
  IconButton,
  ListCard,
  Meter,
  Num,
} from "@/components/ui";

import { formatMoney, greetingKey, localMinutesNow, longDate, minutesOf, monthName, firstName } from "./format";

type Session = {
  id: string;
  client_id: string | null;
  managed_client_id: string | null;
  template_id: string | null;
  scheduled_time: string | null;
  status: "scheduled" | "completed";
  with_trainer: boolean;
  template_name: string;
};

/** A session counts as "next" until 10 minutes after its start. */
const NEXT_GRACE_MINUTES = 10;

export function TrainerHome() {
  const { session, profile } = useAuth();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const trainerId = session!.user.id;
  const today = todayISO();
  const lang = i18n.language;

  // "In 25 minutes" stays true: re-read the clock every minute.
  const [nowMin, setNowMin] = useState(() => localMinutesNow());
  useEffect(() => {
    const id = setInterval(() => setNowMin(localMinutesNow()), 60_000);
    return () => clearInterval(id);
  }, []);

  const roster = useRosterClients(trainerId);

  // Under "scheduled-trainer", so every existing schedule mutation refreshes it.
  const todays = useQuery({
    queryKey: qk.scheduledTrainer.today(today),
    queryFn: async (): Promise<Session[]> => {
      const { data, error } = await supabase
        .from("scheduled_workouts")
        .select("id, client_id, managed_client_id, template_id, scheduled_time, status, with_trainer")
        .eq("trainer_id", trainerId)
        .eq("scheduled_date", today)
        .order("scheduled_time", { ascending: true, nullsFirst: false });
      if (error) throw error;
      const tplIds = [...new Set(data.map((s) => s.template_id).filter(Boolean) as string[])];
      const names = new Map<string, string>();
      if (tplIds.length > 0) {
        const { data: tpls } = await supabase.from("workout_templates").select("id, name").in("id", tplIds);
        tpls?.forEach((tpl) => names.set(tpl.id, tpl.name));
      }
      return data.map((s) => ({
        ...s,
        template_name: s.template_id ? names.get(s.template_id) ?? "—" : "—",
      }));
    },
  });

  const monthKey = `${today.slice(0, 7)}-01`;
  const money = useQuery({
    queryKey: qk.money.month(monthKey),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trainer_monthly_money")
        .select("*")
        .eq("trainer_id", trainerId)
        .eq("month", monthKey)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const atRisk = useQuery({
    queryKey: qk.clientRisk.all,
    queryFn: async () => {
      const { data, error } = await supabase.from("client_risk").select("*").eq("trainer_id", trainerId);
      if (error) throw error;
      return data;
    },
  });

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

  function clientOf(s: { client_id: string | null; managed_client_id: string | null }): RosterClient | undefined {
    const kind = s.client_id ? "app" : "managed";
    const refId = (s.client_id ?? s.managed_client_id) as string;
    return roster.data?.find((c) => c.kind === kind && c.refId === refId);
  }

  function whatsappFor(s: Session, client?: RosterClient): string | null {
    return buildWhatsAppReminderLink({
      phone: client?.phone ?? null,
      clientName: client?.name ?? "",
      trainerName: profile?.display_name ?? "",
      dateLabel: "today",
      timeLabel: s.scheduled_time ? s.scheduled_time.slice(0, 5) : null,
      templateName: s.template_name,
    });
  }

  const sessions = todays.data ?? [];
  const next = sessions.find(
    (s) => s.status === "scheduled" && s.scheduled_time && minutesOf(s.scheduled_time) >= nowMin - NEXT_GRACE_MINUTES,
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.chalk }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 24, gap: 24 }}
    >
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1, gap: 6 }}>
          <AppText size={14} weight="medium" tone="smoke">
            {longDate(today, lang)}
          </AppText>
          <Display size={44}>{t(greetingKey(), { name: firstName(profile?.display_name ?? "") })}</Display>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("trainerHome.settings")}
          onPress={() => router.push("/profile")}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Avatar id={trainerId} name={profile?.display_name ?? "?"} size={48} />
        </Pressable>
      </View>

      {next ? (
        <NextUpCard
          session={next}
          client={clientOf(next)}
          minutesUntil={minutesOf(next.scheduled_time!) - nowMin}
          whatsapp={whatsappFor(next, clientOf(next))}
          onOpenClient={(c) => router.push(`/dashboard/${c.refId}?kind=${c.kind}`)}
        />
      ) : null}

      {/* Today */}
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 32 }}>
          <AppText size={18} weight="semibold" lineHeight={23}>
            {t("trainerHome.today")}
            {sessions.length > 0 ? (
              <AppText size={18} weight="medium" tone="smoke">
                {` · ${t("trainerHome.sessions", { count: sessions.length })}`}
              </AppText>
            ) : null}
          </AppText>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push("/schedule")}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 2, minHeight: 44, opacity: pressed ? 0.6 : 1 })}
          >
            <AppText size={14} weight="semibold" tone="graphite">
              {t("trainerHome.toCalendar")}
            </AppText>
            <Icon icon={ChevronRight} size={16} color={colors.graphite} mirror />
          </Pressable>
        </View>

        {sessions.length > 0 ? (
          <ListCard>
            {sessions.map((s) => {
              const client = clientOf(s);
              const offline = !!s.managed_client_id;
              const done = s.status === "completed";
              const link = whatsappFor(s, client);
              return (
                <View key={s.id} style={{ backgroundColor: s.id === next?.id ? colors.voltSoft : undefined }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, minHeight: 72 }}>
                    <View style={{ width: 50 }}>
                      <Num size={21} weight="semibold" tone={done ? "smoke" : "ink"}>
                        {s.scheduled_time ? s.scheduled_time.slice(0, 5) : "—"}
                      </Num>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      disabled={!client}
                      onPress={() => client && router.push(`/dashboard/${client.refId}?kind=${client.kind}`)}
                      style={({ pressed }) => ({ flex: 1, minWidth: 0, gap: 5, opacity: pressed ? 0.7 : 1 })}
                    >
                      <AppText size={16} weight="semibold" numberOfLines={1}>
                        {client?.name ?? "—"}
                      </AppText>
                      <AppText size={14} tone="graphite" numberOfLines={1}>
                        {`${s.template_name} · ${
                          offline && !done
                            ? t("trainerHome.notMarked")
                            : s.with_trainer
                              ? t("trainerHome.withTrainer")
                              : t("trainerHome.solo")
                        }`}
                      </AppText>
                      {offline ? <Chip kind="noApp" label={t("trainerHome.noApp")} /> : null}
                    </Pressable>
                    {done ? (
                      <Chip kind="done" label={t("trainerHome.done")} />
                    ) : link ? (
                      <IconButton
                        icon={MessageCircle}
                        accessibilityLabel={t("trainerHome.remindWhatsApp")}
                        onPress={() => Linking.openURL(link)}
                      />
                    ) : null}
                  </View>
                  {offline && !done ? (
                    // Lined up under the name: 14 padding + 50 time + 12 gap.
                    <View style={{ paddingStart: 76, paddingEnd: 14, paddingBottom: 14, marginTop: -4, flexDirection: "row" }}>
                      <Button
                        label={t("trainerHome.markDone")}
                        icon={Check}
                        variant="secondary"
                        size={44}
                        disabled={markDone.isPending}
                        onPress={() => markDone.mutate(s.id)}
                      />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </ListCard>
        ) : todays.isSuccess ? (
          <Card>
            <AppText size={15} tone="graphite">
              {t("trainerHome.noSessionsToday")}
            </AppText>
          </Card>
        ) : null}
      </View>

      {/* Worth a look (client_risk for now) */}
      {atRisk.data && atRisk.data.length > 0 ? (
        <View style={{ gap: 10 }}>
          <View style={{ minHeight: 32, justifyContent: "center" }}>
            <AppText size={18} weight="semibold" lineHeight={23}>
              {t("trainerHome.attention")}
            </AppText>
          </View>
          <ListCard>
            {atRisk.data.map((r) => {
              const client = clientOf(r);
              const link = client?.phone
                ? buildWhatsAppReminderLink({
                    phone: client.phone,
                    clientName: client.name,
                    trainerName: profile?.display_name ?? "",
                    dateLabel: "today",
                    timeLabel: null,
                    templateName: "next",
                  })
                : null;
              return (
                <View
                  key={r.subject_key}
                  style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, minHeight: 72 }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      backgroundColor: colors.emberSoft,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon icon={TriangleAlert} size={20} color={colors.ember} />
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    disabled={!client}
                    onPress={() => client && router.push(`/dashboard/${client.refId}?kind=${client.kind}`)}
                    style={({ pressed }) => ({ flex: 1, minWidth: 0, gap: 2, opacity: pressed ? 0.7 : 1 })}
                  >
                    <AppText size={16} weight="semibold" numberOfLines={1}>
                      {client?.name ?? "—"}
                    </AppText>
                    <AppText size={14} tone="graphite">
                      {r.reason === "missed_streak" ? t("home.atRisk.missedStreak") : t("home.atRisk.goneQuiet")}
                    </AppText>
                  </Pressable>
                  {link ? (
                    <Button
                      label={t("trainerHome.remind")}
                      icon={MessageCircle}
                      variant="secondary"
                      size={44}
                      onPress={() => Linking.openURL(link)}
                    />
                  ) : (
                    <Icon icon={ChevronRight} size={20} color={colors.smoke} mirror />
                  )}
                </View>
              );
            })}
          </ListCard>
        </View>
      ) : null}

      {/* Money */}
      {money.data ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/money")}
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
        >
          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <AppText size={18} weight="semibold" lineHeight={23}>
                {monthName(today, lang)}
              </AppText>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                <AppText size={14} weight="semibold" tone="graphite">
                  {t("trainerHome.money")}
                </AppText>
                <Icon icon={ChevronRight} size={16} color={colors.graphite} mirror />
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10 }}>
              <Num size={44}>{`₪${formatMoney(money.data.earned, lang)}`}</Num>
              <AppText size={14} tone="graphite">
                {t("trainerHome.earnedSoFar")}
              </AppText>
            </View>
            <Meter
              height={10}
              value={money.data.projected > 0 ? money.data.earned / money.data.projected : 0}
            />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <AppText size={14} tone="graphite" style={{ flexShrink: 1 }}>
                {`${t("trainerHome.projected")} `}
                <AppText size={14} weight="semibold">
                  {ltr(`₪${formatMoney(money.data.projected, lang)}`)}
                </AppText>
              </AppText>
              {money.data.unpaid > 0 ? (
                <Chip kind="unpaid" label={t("trainerHome.unpaid", { amount: formatMoney(money.data.unpaid, lang) })} />
              ) : null}
            </View>
            {money.data.clients_without_price > 0 ? (
              <AppText size={13} tone="smoke">
                {t("trainerHome.priceGap", { count: money.data.clients_without_price })}
              </AppText>
            ) : null}
          </Card>
        </Pressable>
      ) : null}

      {roster.data && roster.data.length === 0 ? (
        <Card style={{ gap: 12 }}>
          <AppText size={16} weight="semibold">
            {t("trainerHome.noClients")}
          </AppText>
          <AppText size={14} tone="graphite">
            {t("trainerHome.noClientsHint")}
          </AppText>
          <Button label={t("trainerHome.addClient")} onPress={() => router.push("/clients")} />
        </Card>
      ) : null}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// The dark next-up card
// ---------------------------------------------------------------------------
function NextUpCard({
  session: s,
  client,
  minutesUntil,
  whatsapp,
  onOpenClient,
}: {
  session: Session;
  client?: RosterClient;
  minutesUntil: number;
  whatsapp: string | null;
  onOpenClient: (c: RosterClient) => void;
}) {
  const { t } = useTranslation();
  const kind = s.client_id ? "app" : "managed";
  const refId = (s.client_id ?? s.managed_client_id) as string;

  // Last effort / note (app clients log their own) + the package balance.
  const context = useQuery({
    queryKey: qk.clientContext.subject(kind, refId),
    queryFn: async () => {
      const [logRes, pkgRes] = await Promise.all([
        kind === "app"
          ? supabase
              .from("workout_logs")
              .select("effort_rating, client_note")
              .eq("client_id", refId)
              .order("completed_at", { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase
          .from("packages")
          .select("total_sessions, used_sessions")
          .eq(kind === "app" ? "client_id" : "managed_client_id", refId)
          .maybeSingle(),
      ]);
      if (logRes.error) throw logRes.error;
      if (pkgRes.error) throw pkgRes.error;
      return { log: logRes.data, pkg: pkgRes.data };
    },
  });

  const until =
    minutesUntil <= 0
      ? t("trainerHome.now")
      : minutesUntil < 60
        ? t("trainerHome.inMinutes", { count: minutesUntil })
        : t("trainerHome.inHours", { hours: Math.floor(minutesUntil / 60), minutes: minutesUntil % 60 });

  const log = context.data?.log;
  const pkg = context.data?.pkg;
  const effortLine =
    log?.effort_rating != null && log.client_note
      ? t("trainerHome.lastEffortNote", { effort: log.effort_rating, note: log.client_note })
      : log?.effort_rating != null
        ? t("trainerHome.lastEffort", { effort: log.effort_rating })
        : log?.client_note
          ? t("trainerHome.lastNote", { note: log.client_note })
          : null;
  const packageLine =
    pkg && pkg.total_sessions > 0
      ? t("trainerHome.packageLeft", { left: Math.max(0, pkg.total_sessions - pkg.used_sessions), total: pkg.total_sessions })
      : null;

  return (
    <View style={{ backgroundColor: colors.ink, borderRadius: 28, padding: 20, gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <AppText size={14} weight="medium" tone="ash">
          {t("trainerHome.nextUp")}
        </AppText>
        <Chip kind="pr" icon={Clock} label={until} />
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <Num size={46} tone="bone">
          {s.scheduled_time!.slice(0, 5)}
        </Num>
        <View style={{ flex: 1, gap: 4 }}>
          <Display size={34} tone="bone" numberOfLines={2}>
            {client?.name ?? "—"}
          </Display>
          <AppText size={15} tone="ash" numberOfLines={1}>
            {`${s.template_name} · ${s.with_trainer ? t("trainerHome.withTrainer") : t("trainerHome.solo")}`}
          </AppText>
        </View>
      </View>

      {effortLine || packageLine ? (
        <View style={{ backgroundColor: colors.iron3, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, gap: 8 }}>
          {effortLine ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Icon icon={Activity} size={18} color={colors.ash} />
              <AppText size={14} tone="bone" style={{ flex: 1 }}>
                {effortLine}
              </AppText>
            </View>
          ) : null}
          {packageLine ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Icon icon={Ticket} size={18} color={colors.ash} />
              <AppText size={14} tone="bone" style={{ flex: 1 }}>
                {packageLine}
              </AppText>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={{ flexDirection: "row", gap: 8 }}>
        {whatsapp ? (
          <Button
            label={t("trainerHome.whatsapp")}
            icon={MessageCircle}
            variant="dark"
            size={48}
            onPress={() => Linking.openURL(whatsapp)}
          />
        ) : null}
        {client ? (
          <Button
            label={t("trainerHome.clientCard")}
            icon={User}
            variant="bone"
            size={48}
            onPress={() => onOpenClient(client)}
          />
        ) : null}
      </View>
    </View>
  );
}
