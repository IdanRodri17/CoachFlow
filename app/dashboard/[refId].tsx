// app/dashboard/[refId].tsx — the trainer's client card (V8; D26b redesign,
// docs/design/screens/trainer-client.html).
//
// :refId is an app client's profile id or a managed_client id; ?kind=
// disambiguates (lib/useRoster.ts). Hero (avatar, name, since when, streak /
// next-session / status chips), four quick actions (וואטסאפ · קביעה · הערה ·
// תזונה), then a segmented סקירה · אימונים · הערות · פרטים:
//   - סקירה: the package (segment meter, price, unpaid + "סימון כשולם"; "עריכה"
//     sets size and price and creates the row if there's none — an app client
//     who joined by invite gets theirs here), the last workout from the shared
//     client context (lib/queries.ts: effort, duration, sets, the client's note,
//     PRs, swaps/skips with reasons), the last check-in, weight, and the latest
//     private notes.
//   - אימונים: upcoming sessions, then recent ones with the per-session paid
//     toggle (V10 add-on).
//   - הערות: the full private-notes log (V8b) — add, edit, delete.
//   - פרטים: the intake answers (V12b) and the contact phone.
// Offline (managed) clients have no account: no logs, check-ins, weight,
// intake or notes, so they get the package, their last session, today's
// "סימון כבוצע", and סקירה · אימונים only. The AI nutrition assistant is its
// own screen (D26a, app/dashboard/nutrition/[refId].tsx).

import { useRef, useState, type ReactNode, type RefObject } from "react";
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Activity from "lucide-react-native/icons/activity";
import Apple from "lucide-react-native/icons/apple";
import ArrowDown from "lucide-react-native/icons/arrow-down";
import ArrowLeftRight from "lucide-react-native/icons/arrow-left-right";
import ArrowUp from "lucide-react-native/icons/arrow-up";
import Banknote from "lucide-react-native/icons/banknote";
import CalendarPlus from "lucide-react-native/icons/calendar-plus";
import Check from "lucide-react-native/icons/check";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import Clock from "lucide-react-native/icons/clock";
import Flame from "lucide-react-native/icons/flame";
import ListChecks from "lucide-react-native/icons/list-checks";
import Lock from "lucide-react-native/icons/lock";
import MessageCircle from "lucide-react-native/icons/message-circle";
import Moon from "lucide-react-native/icons/moon";
import Pencil from "lucide-react-native/icons/pencil";
import Plus from "lucide-react-native/icons/plus";
import StickyNote from "lucide-react-native/icons/sticky-note";
import Trash from "lucide-react-native/icons/trash";
import Zap from "lucide-react-native/icons/zap";

import { qk } from "@/lib/queryKeys";
import { clientContextQuery, owedQuery, type ClientContext } from "@/lib/queries";
import { RoleGate } from "@/components/RoleGate";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { addDays, DEFAULT_TIME_ZONE, todayISO, toDateString } from "@/lib/dates";
import { ltr } from "@/lib/i18n";
import { useRosterClients } from "@/lib/useRoster";
import { usePullToRefresh } from "@/lib/usePullToRefresh";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { LineChart } from "@/components/LineChart";
import { firstName, formatMoney, monthName, shortDate, weekdayLetter } from "@/components/home/format";
import { ActionRow } from "@/components/ui/ActionRow";
import {
  AppText,
  Avatar,
  Button,
  Card,
  Chip,
  colors,
  Display,
  Divider,
  FieldLabel,
  Icon,
  IconButton,
  Input,
  ListCard,
  ListRow,
  Meter,
  Num,
  parseTypedNumber,
  SectionHeader,
  Segmented,
  SegmentMeter,
  Sheet,
  TextButton,
  type IconComponent,
} from "@/components/ui";
import type { Database } from "@/lib/database.types";

type WorkoutStatus = Database["public"]["Views"]["client_workout_status"]["Row"];
type ClientNote = Database["public"]["Tables"]["client_notes"]["Row"];
type Pkg = Database["public"]["Tables"]["packages"]["Row"];
type Tab = "overview" | "workouts" | "notes" | "details";

type Upcoming = {
  id: string;
  scheduled_date: string;
  scheduled_time: string | null;
  with_trainer: boolean;
  template_name: string;
};

type Detail = {
  name: string;
  /** When the trainer started with this client (yyyy-mm-dd). */
  since: string | null;
  streak: number;
  status: WorkoutStatus | null;
  intake: Record<string, unknown> | null;
  upcoming: Upcoming[];
  /** App clients: their logged workouts, newest first. */
  logs: {
    id: string;
    scheduledWorkoutId: string;
    completed_at: string;
    effort: number | null;
    note: string | null;
    template_name: string;
    paid: boolean;
    prs: number;
  }[];
  /** App clients: weigh-ins, oldest first. */
  weights: { date: string; value: number }[];
  /** Offline clients: their sessions up to today, newest first. */
  recent: { id: string; scheduled_date: string; status: "scheduled" | "completed"; template_name: string; paid: boolean }[];
};

const CHECKIN_ROWS: { key: "sleep" | "energy" | "soreness" | "adherence"; icon: IconComponent }[] = [
  { key: "sleep", icon: Moon },
  { key: "energy", icon: Zap },
  { key: "soreness", icon: Activity },
  { key: "adherence", icon: ListChecks },
];
const INTAKE_KEYS = ["goals", "injuries", "equipment", "experience"] as const;

/** "ג׳ 29.9" / "Tue 9/29". */
function dayLabel(iso: string, lang: string): string {
  if (lang === "he") return `${weekdayLetter(iso, lang)} ${shortDate(iso, lang)}`;
  const wd = new Intl.DateTimeFormat("en", { weekday: "short", timeZone: DEFAULT_TIME_ZONE }).format(
    new Date(`${iso}T12:00:00Z`),
  );
  return `${wd} ${shortDate(iso, lang)}`;
}

/** "12.9 · 19:40". */
function noteStamp(ts: string, lang: string): string {
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: DEFAULT_TIME_ZONE }).format(
    new Date(ts),
  );
  return `${shortDate(toDateString(new Date(ts)), lang)} · ${ltr(time)}`;
}

export default function ClientCardScreen() {
  return (
    <RoleGate role="trainer">
      <ClientCardBody />
    </RoleGate>
  );
}

function ClientCardBody() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refId, kind: kindParam } = useLocalSearchParams<{ refId: string; kind?: string }>();
  const kind: "app" | "managed" = kindParam === "managed" ? "managed" : "app";
  const isApp = kind === "app";
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const trainerId = session!.user.id;
  const subjectCol = isApp ? "client_id" : "managed_client_id";
  const today = todayISO();

  const [tab, setTab] = useState<Tab>("overview");
  const noteInput = useRef<TextInput>(null);

  const refresh = usePullToRefresh([
    qk.clientDetail.all,
    qk.clientContext.all,
    qk.package.all,
    qk.checkIns.all,
    qk.clientNotes.all,
    qk.scheduledTrainer.all,
    qk.roster.all,
  ]);

  const detail = useQuery({
    queryKey: qk.clientDetail.subject(kind, refId),
    queryFn: async (): Promise<Detail> => {
      const [whoRes, sinceRes, streakRes, statusRes, upcomingRes] = await Promise.all([
        isApp
          ? supabase.from("profiles").select("display_name, intake").eq("id", refId).single()
          : supabase.from("managed_clients").select("name, created_at").eq("id", refId).single(),
        isApp
          ? supabase
              .from("trainer_clients")
              .select("created_at")
              .eq("trainer_id", trainerId)
              .eq("client_id", refId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase
          .from("client_streaks")
          .select("current_streak")
          .eq("trainer_id", trainerId)
          .eq(subjectCol, refId)
          .maybeSingle(),
        supabase
          .from("client_workout_status")
          .select("*")
          .eq("trainer_id", trainerId)
          .eq(subjectCol, refId)
          .maybeSingle(),
        supabase
          .from("scheduled_workouts")
          .select("id, scheduled_date, scheduled_time, with_trainer, template_id")
          .eq("trainer_id", trainerId)
          .eq(subjectCol, refId)
          .eq("status", "scheduled")
          .gte("scheduled_date", today)
          .order("scheduled_date", { ascending: true })
          .order("scheduled_time", { ascending: true, nullsFirst: false })
          .limit(8),
      ]);
      if (whoRes.error) throw whoRes.error;
      if (sinceRes.error) throw sinceRes.error;
      if (streakRes.error) throw streakRes.error;
      if (statusRes.error) throw statusRes.error;
      if (upcomingRes.error) throw upcomingRes.error;

      const who = whoRes.data as { display_name?: string; name?: string; intake?: unknown; created_at?: string };
      const name = who.display_name ?? who.name ?? t("clientCard.client");
      const sinceTs = isApp ? sinceRes.data?.created_at : who.created_at;

      const tplIds = new Set<string>(upcomingRes.data.map((u) => u.template_id).filter(Boolean) as string[]);
      const scheduled = new Map<string, { template_id: string | null; paid: boolean }>();
      let logRows: { id: string; scheduled_workout_id: string; completed_at: string; effort_rating: number | null; client_note: string | null }[] = [];
      const prCount = new Map<string, number>();
      let weights: Detail["weights"] = [];
      let recentRows: { id: string; scheduled_date: string; status: "scheduled" | "completed"; template_id: string | null; paid: boolean }[] = [];

      if (isApp) {
        const [logsRes, progressRes] = await Promise.all([
          supabase
            .from("workout_logs")
            .select("id, scheduled_workout_id, completed_at, effort_rating, client_note")
            .eq("client_id", refId)
            .order("completed_at", { ascending: false })
            .limit(10),
          supabase
            .from("progress_entries")
            .select("date, weight")
            .eq("client_id", refId)
            .not("weight", "is", null)
            .order("date", { ascending: true }),
        ]);
        if (logsRes.error) throw logsRes.error;
        if (progressRes.error) throw progressRes.error;
        logRows = logsRes.data;
        weights = progressRes.data.map((p) => ({ date: p.date, value: Number(p.weight) }));

        const logIds = logRows.map((l) => l.id);
        const swIds = [...new Set(logRows.map((l) => l.scheduled_workout_id))];
        if (logIds.length > 0) {
          const [swRes, prRes] = await Promise.all([
            supabase.from("scheduled_workouts").select("id, template_id, paid").in("id", swIds),
            supabase.from("set_logs").select("workout_log_id").in("workout_log_id", logIds).eq("is_pr", true),
          ]);
          if (swRes.error) throw swRes.error;
          if (prRes.error) throw prRes.error;
          swRes.data.forEach((s) => {
            scheduled.set(s.id, { template_id: s.template_id, paid: s.paid });
            if (s.template_id) tplIds.add(s.template_id);
          });
          prRes.data.forEach((p) => prCount.set(p.workout_log_id, (prCount.get(p.workout_log_id) ?? 0) + 1));
        }
      } else {
        const { data, error } = await supabase
          .from("scheduled_workouts")
          .select("id, scheduled_date, status, template_id, paid")
          .eq("trainer_id", trainerId)
          .eq("managed_client_id", refId)
          .lte("scheduled_date", today)
          .order("scheduled_date", { ascending: false })
          .limit(10);
        if (error) throw error;
        recentRows = data;
        data.forEach((r) => {
          if (r.template_id) tplIds.add(r.template_id);
        });
      }

      const names = new Map<string, string>();
      if (tplIds.size > 0) {
        const { data } = await supabase.from("workout_templates").select("id, name").in("id", [...tplIds]);
        data?.forEach((tpl) => names.set(tpl.id, tpl.name));
      }
      const tplName = (id: string | null | undefined) => (id ? names.get(id) : undefined) ?? t("clientCard.workout");

      return {
        name,
        since: sinceTs ? toDateString(new Date(sinceTs)) : null,
        streak: streakRes.data?.current_streak ?? 0,
        status: statusRes.data ?? null,
        intake: isApp ? ((who.intake as Record<string, unknown> | null) ?? null) : null,
        upcoming: upcomingRes.data.map((u) => ({
          id: u.id,
          scheduled_date: u.scheduled_date,
          scheduled_time: u.scheduled_time,
          with_trainer: u.with_trainer,
          template_name: tplName(u.template_id),
        })),
        logs: logRows.map((l) => ({
          id: l.id,
          scheduledWorkoutId: l.scheduled_workout_id,
          completed_at: l.completed_at,
          effort: l.effort_rating,
          note: l.client_note,
          template_name: tplName(scheduled.get(l.scheduled_workout_id)?.template_id),
          paid: scheduled.get(l.scheduled_workout_id)?.paid ?? false,
          prs: prCount.get(l.id) ?? 0,
        })),
        weights,
        recent: recentRows.map((r) => ({
          id: r.id,
          scheduled_date: r.scheduled_date,
          status: r.status,
          template_name: tplName(r.template_id),
          paid: r.paid,
        })),
      };
    },
  });

  const context = useQuery(clientContextQuery(kind, refId));
  const roster = useRosterClients(trainerId);
  const phone = (roster.data ?? []).find((c) => c.kind === kind && c.refId === refId)?.phone ?? null;
  const owed = useQuery(owedQuery(trainerId));
  const owedHere = owed.data?.get(isApp ? refId : `m:${refId}`) ?? null;

  const packageQuery = useQuery({
    queryKey: qk.package.subject(kind, refId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("packages")
        .select("*")
        .eq("trainer_id", trainerId)
        .eq(subjectCol, refId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Latest weekly check-in (V10) — app clients only (self-reported).
  const latestCheckin = useQuery({
    queryKey: qk.checkIns.latest(refId),
    enabled: isApp,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("check_ins")
        .select("*")
        .eq("client_id", refId)
        .order("week_start", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Private trainer-only notes (V8b) — app clients only (client_notes.client_id
  // -> profiles). No client-read RLS policy exists at all.
  const notes = useQuery({
    queryKey: qk.clientNotes.subject(refId),
    enabled: isApp,
    queryFn: async (): Promise<ClientNote[]> => {
      const { data, error } = await supabase
        .from("client_notes")
        .select("*")
        .eq("trainer_id", trainerId)
        .eq("client_id", refId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Offline clients: the trainer marks today's (or the overdue) session done.
  const markComplete = useMutation({
    mutationFn: async (scheduledWorkoutId: string) => {
      const { error } = await supabase.from("scheduled_workouts").update({ status: "completed" }).eq("id", scheduledWorkoutId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.clientDetail.subject(kind, refId) });
      queryClient.invalidateQueries({ queryKey: qk.scheduledTrainer.all });
      queryClient.invalidateQueries({ queryKey: qk.package.subject(kind, refId) });
      queryClient.invalidateQueries({ queryKey: qk.clientContext.subject(kind, refId) });
      queryClient.invalidateQueries({ queryKey: qk.money.all });
      queryClient.invalidateQueries({ queryKey: qk.clientRisk.all });
    },
  });

  // Payment bookkeeping (V10 add-on): per session, or every unpaid one at once
  // (the same batch as Money's "שולם").
  const afterPaid = () => {
    queryClient.invalidateQueries({ queryKey: qk.clientDetail.subject(kind, refId) });
    queryClient.invalidateQueries({ queryKey: qk.money.all });
    queryClient.invalidateQueries({ queryKey: qk.scheduledTrainer.owed });
  };
  const togglePaid = useMutation({
    mutationFn: async ({ id, paid }: { id: string; paid: boolean }) => {
      const { error } = await supabase.from("scheduled_workouts").update({ paid }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: afterPaid,
  });
  const markAllPaid = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("scheduled_workouts")
        .update({ paid: true })
        .eq("trainer_id", trainerId)
        .eq(subjectCol, refId)
        .eq("status", "completed")
        .eq("paid", false);
      if (error) throw error;
    },
    onSuccess: afterPaid,
  });

  const [newNote, setNewNote] = useState("");
  const addNote = useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase.from("client_notes").insert({ trainer_id: trainerId, client_id: refId, body });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.clientNotes.subject(refId) });
      setNewNote("");
    },
  });

  if (detail.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.chalk }}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }
  if (detail.error || !detail.data) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.chalk, padding: 24 }}>
        <AppText size={14} tone="ember" center>
          {detail.error ? (detail.error as Error).message : t("clientCard.notFound")}
        </AppText>
      </View>
    );
  }

  const d = detail.data;
  const next = d.upcoming[0];
  const wa = phone ? buildWhatsAppLink(phone, t("clients.waHello", { name: firstName(d.name) })) : null;
  const tabs: { value: Tab; label: string }[] = [
    { value: "overview", label: t("clientCard.tabs.overview") },
    { value: "workouts", label: t("clientCard.tabs.workouts") },
    ...(isApp
      ? [
          { value: "notes" as const, label: t("clientCard.tabs.notes") },
          { value: "details" as const, label: t("clientCard.tabs.details") },
        ]
      : []),
  ];

  const sinceLine = d.since
    ? t("clientCard.since", {
        month:
          d.since.slice(0, 4) === today.slice(0, 4)
            ? monthName(d.since, lang)
            : `${monthName(d.since, lang)} ${ltr(d.since.slice(0, 4))}`,
      })
    : null;
  const nextDay = next
    ? next.scheduled_date === today
      ? t("clients.today")
      : next.scheduled_date === addDays(today, 1)
        ? t("clients.tomorrow")
        : shortDate(next.scheduled_date, lang)
    : null;
  const nextChip = next
    ? `${nextDay}${next.scheduled_time ? ` ${ltr(next.scheduled_time.slice(0, 5))}` : ""} · ${
        next.with_trainer ? t("trainerHome.withTrainer") : t("trainerHome.solo")
      }`
    : null;

  const actionableId = !isApp ? d.status?.actionable_id : null;
  const actionable = actionableId ? d.recent.find((r) => r.id === actionableId) : undefined;
  const lastOffline = !isApp ? d.recent.find((r) => r.status === "completed") : undefined;
  const openSchedule = () => router.push({ pathname: "/schedule/new", params: { clientKind: kind, clientId: refId } });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.chalk }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: insets.bottom + 30, gap: 18 }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      refreshControl={<RefreshControl {...refresh} />}
    >
      <View style={{ height: 52, flexDirection: "row", alignItems: "center" }}>
        <IconButton
          icon={ChevronLeft}
          mirror
          iconSize={22}
          accessibilityLabel={t("common.back")}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/clients"))}
        />
      </View>

      {/* Hero */}
      <View style={{ gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <Avatar id={refId} name={d.name} size={64} />
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <Display size={38} numberOfLines={2}>
              {d.name}
            </Display>
            <AppText size={14} tone="graphite">
              {[isApp ? t("clientCard.inApp") : t("clientCard.noApp"), sinceLine].filter(Boolean).join(" · ")}
            </AppText>
          </View>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {d.streak > 0 ? <Chip kind="streak" icon={Flame} label={t("clientCard.streak", { count: d.streak })} /> : null}
          {d.status?.completed_today ? <Chip kind="done" label={t("clientCard.doneToday")} /> : null}
          {d.status?.is_overdue ? (
            <Chip kind="missed" label={t("clientCard.overdue", { count: d.status.overdue_count })} />
          ) : null}
          {nextChip ? <Chip kind="neutral" icon={Clock} label={nextChip} /> : null}
        </View>
      </View>

      {/* Quick actions */}
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        <QuickAction
          icon={MessageCircle}
          label={t("clientCard.actions.whatsapp")}
          primary
          disabled={!wa}
          onPress={() => {
            if (wa) void Linking.openURL(wa);
          }}
        />
        <QuickAction icon={CalendarPlus} label={t("clientCard.actions.schedule")} onPress={openSchedule} />
        {isApp ? (
          <QuickAction
            icon={StickyNote}
            label={t("clientCard.actions.note")}
            onPress={() => {
              setTab("notes");
              setTimeout(() => noteInput.current?.focus(), 150);
            }}
          />
        ) : null}
        <QuickAction
          icon={Apple}
          label={t("clientCard.actions.nutrition")}
          onPress={() => router.push({ pathname: "/dashboard/nutrition/[refId]", params: { refId, kind } })}
        />
      </View>

      <Segmented value={tab} onChange={setTab} options={tabs} />

      {tab === "overview" ? (
        <>
          {actionable ? (
            <Card style={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <AppText size={15} weight="semibold" numberOfLines={1}>
                  {`${actionable.template_name} · ${dayLabel(actionable.scheduled_date, lang)}`}
                </AppText>
                <AppText size={13} tone="graphite">
                  {t("trainerHome.notMarked")}
                </AppText>
              </View>
              <Button
                label={t("trainerHome.markDone")}
                icon={Check}
                variant="secondary"
                size={44}
                disabled={markComplete.isPending}
                onPress={() => markComplete.mutate(actionable.id)}
              />
            </Card>
          ) : null}
          {markComplete.error ? (
            <AppText size={14} tone="ember">
              {(markComplete.error as Error).message}
            </AppText>
          ) : null}

          <PackageCard
            kind={kind}
            refId={refId}
            trainerId={trainerId}
            pkg={packageQuery.data ?? null}
            owed={owedHere}
            markingPaid={markAllPaid.isPending}
            onMarkPaid={() => markAllPaid.mutate()}
          />

          {isApp ? (
            <LastWorkoutCard last={context.data?.last ?? null} onAll={() => setTab("workouts")} />
          ) : lastOffline ? (
            <Card style={{ padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText size={13} tone="smoke">
                  {t("clientCard.lastWorkout", { day: dayLabel(lastOffline.scheduled_date, lang) })}
                </AppText>
                <AppText size={18} weight="semibold" lineHeight={23}>
                  {lastOffline.template_name}
                </AppText>
              </View>
              <Chip kind="done" label={t("clientCard.done")} />
            </Card>
          ) : null}

          {isApp && latestCheckin.data ? <CheckinCard checkin={latestCheckin.data} /> : null}

          {isApp && d.weights.length > 0 ? <WeightCard weights={d.weights} /> : null}

          {isApp ? (
            <NotesCard
              notes={(notes.data ?? []).slice(0, 2)}
              total={notes.data?.length ?? 0}
              value={newNote}
              onChange={setNewNote}
              adding={addNote.isPending}
              error={addNote.error ? (addNote.error as Error).message : null}
              onAdd={() => addNote.mutate(newNote.trim())}
              onAll={() => setTab("notes")}
            />
          ) : null}
        </>
      ) : null}

      {tab === "workouts" ? (
        <WorkoutsTab
          detail={d}
          isApp={isApp}
          paidPending={togglePaid.isPending}
          onTogglePaid={(id, paid) => togglePaid.mutate({ id, paid })}
          onOpen={(id) => router.push({ pathname: "/schedule/[id]", params: { id } })}
          onSchedule={openSchedule}
        />
      ) : null}

      {tab === "notes" && isApp ? (
        <>
          <NotesComposer
            inputRef={noteInput}
            value={newNote}
            onChange={setNewNote}
            adding={addNote.isPending}
            onAdd={() => addNote.mutate(newNote.trim())}
          />
          {addNote.error ? (
            <AppText size={14} tone="ember">
              {(addNote.error as Error).message}
            </AppText>
          ) : null}
          <NotesLog refId={refId} notes={notes.data ?? []} loading={notes.isLoading} />
        </>
      ) : null}

      {tab === "details" && isApp ? <DetailsTab intake={d.intake} phone={phone} /> : null}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Hero pieces
// ---------------------------------------------------------------------------

function QuickAction({
  icon,
  label,
  onPress,
  primary,
  disabled,
}: {
  icon: IconComponent;
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ flex: 1, alignItems: "center", gap: 6, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 })}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: primary ? colors.ink : colors.paper,
          borderWidth: primary ? 0 : 1,
          borderColor: colors.lineStrong,
        }}
      >
        <Icon icon={icon} size={24} color={primary ? colors.white : colors.ink} />
      </View>
      <AppText size={13} weight="semibold" center numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Package
// ---------------------------------------------------------------------------

function PackageCard({
  kind,
  refId,
  trainerId,
  pkg,
  owed,
  markingPaid,
  onMarkPaid,
}: {
  kind: "app" | "managed";
  refId: string;
  trainerId: string;
  pkg: Pkg | null;
  owed: { count: number; amount: number } | null;
  markingPaid: boolean;
  onMarkPaid: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [editing, setEditing] = useState(false);
  const total = pkg?.total_sessions ?? 0;
  const used = pkg?.used_sessions ?? 0;
  const left = Math.max(0, total - used);
  const money = (n: number) => ltr(`₪${formatMoney(n, i18n.language)}`);

  return (
    <Card style={{ padding: 14, gap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}>
          <AppText size={18} weight="semibold" lineHeight={23}>
            {t("clientCard.package.title")}
          </AppText>
          {pkg && total > 0 && left === 0 ? <Chip kind="lowPackage" label={t("clientCard.package.usedUp")} /> : null}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => setEditing(true)}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            minHeight: 44,
            paddingHorizontal: 8,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Icon icon={Pencil} size={16} />
          <AppText size={14} weight="semibold">
            {pkg ? t("clientCard.package.edit") : t("clientCard.package.setUp")}
          </AppText>
        </Pressable>
      </View>

      {pkg && total > 0 ? (
        <>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
            <Num size={44}>{String(left)}</Num>
            <AppText size={15} tone="graphite">
              {t("clientCard.package.leftOf", { total })}
            </AppText>
          </View>
          {/* One cell per session while they fit; a plain bar for big packages. */}
          {total <= 24 ? (
            <SegmentMeter total={total} filled={Math.min(used, total)} />
          ) : (
            <Meter value={used / total} height={10} />
          )}
        </>
      ) : (
        <AppText size={15} tone="graphite">
          {t("clientCard.package.none")}
        </AppText>
      )}
      <AppText size={14} tone="graphite">
        {pkg?.price_per_session != null
          ? t("clientCard.package.price", { price: money(Number(pkg.price_per_session)) })
          : t("clientCard.package.noPrice")}
      </AppText>

      <Divider inset={0} />
      {owed && owed.count > 0 ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText size={15} weight="semibold">
              {t("clientCard.package.unpaid", { count: owed.count })}
            </AppText>
            {owed.amount > 0 ? (
              <AppText size={14} weight="semibold" tone="gold">
                {money(owed.amount)}
              </AppText>
            ) : null}
          </View>
          <Button
            label={t("clientCard.package.markPaid")}
            icon={Banknote}
            variant="secondary"
            size={44}
            loading={markingPaid}
            disabled={markingPaid}
            onPress={onMarkPaid}
          />
        </View>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Icon icon={Check} size={16} color={colors.voltInk} />
          <AppText size={14} tone="graphite">
            {t("clientCard.package.allPaid")}
          </AppText>
        </View>
      )}

      <Sheet
        visible={editing}
        onClose={() => setEditing(false)}
        closeLabel={t("common.cancel")}
        title={t("clientCard.package.sheetTitle")}
      >
        {editing ? (
          <PackageForm
            key={pkg?.id ?? "new"}
            kind={kind}
            refId={refId}
            trainerId={trainerId}
            pkg={pkg}
            onDone={() => setEditing(false)}
          />
        ) : null}
      </Sheet>
    </Card>
  );
}

/** Size and price per session. Creates the packages row when there's none —
 * how an app client who joined by invite gets one. An empty field leaves that
 * value as it is. */
function PackageForm({
  kind,
  refId,
  trainerId,
  pkg,
  onDone,
}: {
  kind: "app" | "managed";
  refId: string;
  trainerId: string;
  pkg: Pkg | null;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [size, setSize] = useState(pkg ? String(pkg.total_sessions) : "");
  const [price, setPrice] = useState(pkg?.price_per_session != null ? String(pkg.price_per_session) : "");
  const sizeN = parseTypedNumber(size);
  const priceN = parseTypedNumber(price);

  const save = useMutation({
    mutationFn: async () => {
      const patch: { total_sessions?: number; price_per_session?: number } = {};
      if (sizeN != null) patch.total_sessions = Math.round(sizeN);
      if (priceN != null) patch.price_per_session = priceN;
      if (pkg) {
        const { error } = await supabase.from("packages").update(patch).eq("id", pkg.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("packages")
          .insert(
            kind === "app"
              ? { trainer_id: trainerId, client_id: refId, ...patch }
              : { trainer_id: trainerId, managed_client_id: refId, ...patch },
          );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.package.subject(kind, refId) });
      queryClient.invalidateQueries({ queryKey: qk.clientContext.subject(kind, refId) });
      // A bigger package clears a renewal item on Home; the price moves money.
      queryClient.invalidateQueries({ queryKey: qk.scheduledTrainer.attention });
      queryClient.invalidateQueries({ queryKey: qk.scheduledTrainer.owed });
      queryClient.invalidateQueries({ queryKey: qk.money.all });
      onDone();
    },
  });

  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1, gap: 8 }}>
          <FieldLabel>{t("clientCard.package.size")}</FieldLabel>
          <Input
            size="md"
            ltr="start"
            keyboardType="number-pad"
            value={size}
            onChangeText={setSize}
            suffix={t("clientCard.package.sessions")}
            accessibilityLabel={t("clientCard.package.size")}
          />
        </View>
        <View style={{ flex: 1, gap: 8 }}>
          <FieldLabel>{t("clientCard.package.pricePer")}</FieldLabel>
          <Input
            size="md"
            ltr="start"
            keyboardType="decimal-pad"
            value={price}
            onChangeText={setPrice}
            suffix="₪"
            accessibilityLabel={t("clientCard.package.pricePer")}
          />
        </View>
      </View>
      {pkg ? (
        <AppText size={13} tone="graphite">
          {t("clientCard.package.usedSoFar", { count: pkg.used_sessions })}
        </AppText>
      ) : null}
      {save.error ? (
        <AppText size={14} tone="ember">
          {(save.error as Error).message}
        </AppText>
      ) : null}
      <Button
        label={t("clientCard.package.save")}
        block
        loading={save.isPending}
        disabled={save.isPending || (sizeN == null && priceN == null)}
        onPress={() => save.mutate()}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Last workout, check-in, weight
// ---------------------------------------------------------------------------

function LastWorkoutCard({ last, onAll }: { last: ClientContext["last"]; onAll: () => void }) {
  const { t, i18n } = useTranslation();
  if (!last) {
    return (
      <Card style={{ padding: 14 }}>
        <AppText size={15} tone="graphite">
          {t("clientCard.noWorkoutsYet")}
        </AppText>
      </Card>
    );
  }
  const day = dayLabel(toDateString(new Date(last.completedAt)), i18n.language);
  return (
    <Card style={{ padding: 14, gap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText size={13} tone="smoke">
            {t("clientCard.lastWorkout", { day })}
          </AppText>
          <AppText size={18} weight="semibold" lineHeight={23}>
            {last.templateName ?? t("clientCard.workout")}
          </AppText>
        </View>
        <Chip kind="done" label={t("clientCard.done")} />
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Stat label={t("clientCard.effort")} value={last.effort} unit={t("clientCard.outOf10")} />
        <Stat label={t("clientCard.duration")} value={last.minutes} unit={t("clientCard.minutes")} />
        <Stat label={t("clientCard.sets")} value={last.sets} />
      </View>

      {last.note ? (
        <View style={{ paddingVertical: 12, paddingHorizontal: 14, backgroundColor: colors.chalk, borderRadius: 14 }}>
          <AppText size={15} lineHeight={22}>{`"${last.note}"`}</AppText>
        </View>
      ) : null}

      {last.prs.slice(0, 2).map((p, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Chip kind="pr" label={t("clientCard.pr")} />
          <AppText size={14} style={{ flex: 1 }}>
            {[
              p.exercise,
              p.weight != null ? `${ltr(String(p.weight))} ${t("progress.kg")}` : null,
              p.reps != null ? t("clientCard.reps", { count: p.reps }) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </AppText>
        </View>
      ))}

      {last.changes.map((c, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Icon icon={ArrowLeftRight} size={18} color={colors.graphite} />
          <AppText size={14} tone="graphite" style={{ flex: 1 }}>
            {(c.action === "swapped" && c.swappedFor
              ? t("clientCard.swapped", { from: c.exercise, to: c.swappedFor })
              : t("clientCard.skipped", { exercise: c.exercise })) + (c.reason ? ` · "${c.reason}"` : "")}
          </AppText>
        </View>
      ))}

      <TextButton label={t("clientCard.allWorkouts")} onPress={onAll} style={{ alignSelf: "flex-start" }} />
    </Card>
  );
}

function Stat({ label, value, unit }: { label: string; value: number | null; unit?: string }) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <AppText size={13} tone="graphite">
        {label}
      </AppText>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
        <Num size={26}>{value != null ? String(value) : "—"}</Num>
        {unit && value != null ? (
          <AppText size={13} tone="graphite">
            {unit}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

function CheckinCard({ checkin }: { checkin: Database["public"]["Tables"]["check_ins"]["Row"] }) {
  const { t, i18n } = useTranslation();
  return (
    <Card style={{ padding: 14, gap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <AppText size={18} weight="semibold" lineHeight={23}>
          {t("clientCard.lastCheckin")}
        </AppText>
        <AppText size={13} tone="smoke">
          {t("clientCard.week", { date: shortDate(checkin.week_start, i18n.language) })}
        </AppText>
      </View>
      {CHECKIN_ROWS.map((row) => (
        <View key={row.key} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 124, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icon icon={row.icon} size={18} color={colors.graphite} />
            <AppText size={14} numberOfLines={1} style={{ flexShrink: 1 }}>
              {t(`checkin.fields.${row.key}`)}
            </AppText>
          </View>
          <View style={{ flex: 1 }}>
            <SegmentMeter total={5} filled={checkin[row.key]} height={8} />
          </View>
          <Num size={17} weight="semibold">
            {`${checkin[row.key]}/5`}
          </Num>
        </View>
      ))}
      {checkin.note ? <AppText size={14} tone="graphite">{`"${checkin.note}"`}</AppText> : null}
    </Card>
  );
}

function WeightCard({ weights }: { weights: { date: string; value: number }[] }) {
  const { t, i18n } = useTranslation();
  const shown = weights.slice(-10);
  const first = shown[0];
  const last = shown[shown.length - 1];
  const delta = Math.round((last.value - first.value) * 10) / 10;
  return (
    <Card style={{ padding: 14, gap: 16 }}>
      <View style={{ gap: 4 }}>
        <AppText size={18} weight="semibold" lineHeight={23}>
          {t("progress.weightTitle")}
        </AppText>
        <View style={{ flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: 4 }}>
          <Num size={26}>{String(last.value)}</Num>
          <AppText size={13} tone="graphite">
            {t("progress.kg")}
          </AppText>
          {shown.length > 1 && delta !== 0 ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 2, marginStart: 6 }}>
              <Icon icon={delta < 0 ? ArrowDown : ArrowUp} size={14} color={delta < 0 ? colors.voltInk : colors.graphite} />
              <AppText size={13} weight="semibold" tone={delta < 0 ? "voltInk" : "graphite"}>
                {t("progress.deltaSince", { delta: ltr(String(Math.abs(delta))), month: monthName(first.date, i18n.language) })}
              </AppText>
            </View>
          ) : null}
        </View>
      </View>
      <LineChart data={shown.map((w) => ({ label: shortDate(w.date, i18n.language), value: w.value }))} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Private notes
// ---------------------------------------------------------------------------

function NotesHeader() {
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Icon icon={Lock} size={18} color={colors.graphite} />
      <AppText size={18} weight="semibold" lineHeight={23} style={{ flexShrink: 1 }}>
        {t("clientCard.notes.title")}
      </AppText>
      <View style={{ flex: 1 }} />
      <AppText size={13} tone="smoke">
        {t("clientCard.notes.onlyYou")}
      </AppText>
    </View>
  );
}

function NotesComposer({
  value,
  onChange,
  adding,
  onAdd,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  adding: boolean;
  onAdd: () => void;
  inputRef?: RefObject<TextInput | null>;
}) {
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
      <View style={{ flex: 1 }}>
        <Input
          ref={inputRef}
          size="md"
          multiline
          value={value}
          onChangeText={onChange}
          placeholder={t("clientCard.notes.placeholder")}
          accessibilityLabel={t("clientCard.notes.placeholder")}
          containerStyle={{ minHeight: 48 }}
        />
      </View>
      <IconButton
        icon={Plus}
        variant="primary"
        shape="square"
        size={48}
        iconSize={22}
        accessibilityLabel={t("clientCard.notes.add")}
        disabled={adding || value.trim().length === 0}
        onPress={onAdd}
      />
    </View>
  );
}

function NotesCard({
  notes,
  total,
  value,
  onChange,
  adding,
  error,
  onAdd,
  onAll,
}: {
  notes: ClientNote[];
  total: number;
  value: string;
  onChange: (v: string) => void;
  adding: boolean;
  error: string | null;
  onAdd: () => void;
  onAll: () => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <Card style={{ padding: 14, gap: 12 }}>
      <NotesHeader />
      <NotesComposer value={value} onChange={onChange} adding={adding} onAdd={onAdd} />
      {error ? (
        <AppText size={14} tone="ember">
          {error}
        </AppText>
      ) : null}
      {notes.map((n, i) => (
        <View key={n.id}>
          {i > 0 ? <Divider inset={0} /> : null}
          <View style={{ gap: 4, paddingVertical: 10 }}>
            <AppText size={15} lineHeight={22}>
              {n.body}
            </AppText>
            <AppText size={12} tone="smoke">
              {noteStamp(n.created_at, i18n.language)}
            </AppText>
          </View>
        </View>
      ))}
      {total > notes.length ? (
        <TextButton label={t("clientCard.notes.all", { count: total })} onPress={onAll} style={{ alignSelf: "flex-start" }} />
      ) : null}
    </Card>
  );
}

/** The full notes log: long-press or swipe a note to edit or delete it. */
function NotesLog({ refId, notes, loading }: { refId: string; notes: ClientNote[]; loading: boolean }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [body, setBody] = useState("");

  const update = useMutation({
    mutationFn: async ({ id, text }: { id: string; text: string }) => {
      const { error } = await supabase.from("client_notes").update({ body: text }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.clientNotes.subject(refId) });
      setEditingId(null);
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.clientNotes.subject(refId) }),
  });

  if (loading) return <ActivityIndicator color={colors.ink} />;
  if (notes.length === 0) {
    return (
      <Card style={{ padding: 14, gap: 12 }}>
        <NotesHeader />
        <AppText size={15} tone="graphite">
          {t("clientCard.notes.none")}
        </AppText>
      </Card>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      <NotesHeader />
      <ListCard>
        {notes.map((n) =>
          editingId === n.id ? (
            <View key={n.id} style={{ padding: 14, gap: 10 }}>
              <Input
                size="md"
                multiline
                autoFocus
                value={body}
                onChangeText={setBody}
                accessibilityLabel={t("clientCard.notes.edit")}
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button
                  label={t("clientCard.notes.save")}
                  size={44}
                  disabled={update.isPending || body.trim().length === 0}
                  onPress={() => update.mutate({ id: n.id, text: body.trim() })}
                />
                <Button label={t("common.cancel")} variant="ghost" size={44} onPress={() => setEditingId(null)} />
              </View>
              {update.error ? (
                <AppText size={14} tone="ember">
                  {(update.error as Error).message}
                </AppText>
              ) : null}
            </View>
          ) : (
            <ActionRow
              key={n.id}
              sheetTitle={t("clientCard.notes.title")}
              actions={[
                {
                  key: "edit",
                  label: t("clientCard.notes.edit"),
                  icon: Pencil,
                  tone: "edit",
                  onPress: () => {
                    setEditingId(n.id);
                    setBody(n.body);
                  },
                },
                {
                  key: "delete",
                  label: t("clientCard.notes.delete"),
                  icon: Trash,
                  tone: "delete",
                  onPress: () => remove.mutate(n.id),
                  confirm: {
                    title: t("clientCard.notes.deleteTitle"),
                    message: t("clientCard.notes.deleteMessage"),
                    confirmLabel: t("clientCard.notes.delete"),
                  },
                },
              ]}
            >
              <View style={{ gap: 4, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: colors.paper }}>
                <AppText size={15} lineHeight={22}>
                  {n.body}
                </AppText>
                <AppText size={12} tone="smoke">
                  {noteStamp(n.created_at, i18n.language)}
                </AppText>
              </View>
            </ActionRow>
          ),
        )}
      </ListCard>
      <AppText size={13} tone="smoke">
        {t("clientCard.notes.hint")}
      </AppText>
    </View>
  );
}

// ---------------------------------------------------------------------------
// אימונים · פרטים
// ---------------------------------------------------------------------------

function PaidChip({ paid, pending, onToggle }: { paid: boolean; pending: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={paid ? t("clientCard.markUnpaid") : t("clientCard.package.markPaid")}
      disabled={pending}
      onPress={onToggle}
      hitSlop={10}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <Chip kind={paid ? "done" : "unpaid"} label={paid ? t("clientCard.paid") : t("clientCard.unpaid")} />
    </Pressable>
  );
}

function WorkoutsTab({
  detail: d,
  isApp,
  paidPending,
  onTogglePaid,
  onOpen,
  onSchedule,
}: {
  detail: Detail;
  isApp: boolean;
  paidPending: boolean;
  onTogglePaid: (id: string, paid: boolean) => void;
  onOpen: (id: string) => void;
  onSchedule: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const today = todayISO();

  return (
    <>
      <View style={{ gap: 10 }}>
        <SectionHeader title={t("clientCard.upcoming")} />
        {d.upcoming.length > 0 ? (
          <ListCard>
            {d.upcoming.map((u) => (
              <ListRow
                key={u.id}
                title={u.template_name}
                subtitle={[dayLabel(u.scheduled_date, lang), u.scheduled_time ? ltr(u.scheduled_time.slice(0, 5)) : null]
                  .filter(Boolean)
                  .join(" · ")}
                trailing={
                  <Chip
                    kind={u.with_trainer ? "trainer" : "solo"}
                    label={u.with_trainer ? t("trainerHome.withTrainer") : t("trainerHome.solo")}
                  />
                }
                chevron
                onPress={() => onOpen(u.id)}
              />
            ))}
          </ListCard>
        ) : (
          <Card style={{ padding: 14, gap: 12 }}>
            <AppText size={15} tone="graphite">
              {t("clientCard.noUpcoming")}
            </AppText>
            <Button
              label={t("clientCard.actions.schedule")}
              icon={CalendarPlus}
              variant="secondary"
              size={44}
              style={{ alignSelf: "flex-start" }}
              onPress={onSchedule}
            />
          </Card>
        )}
      </View>

      <View style={{ gap: 10 }}>
        <SectionHeader title={t("clientCard.recent")} />
        {isApp ? (
          d.logs.length > 0 ? (
            <ListCard>
              {d.logs.map((l) => (
                <View key={l.id} style={{ paddingVertical: 12, paddingHorizontal: 14, gap: 6 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <AppText size={16} weight="semibold" numberOfLines={1}>
                        {l.template_name}
                      </AppText>
                      <AppText size={13} tone="graphite">
                        {[
                          dayLabel(toDateString(new Date(l.completed_at)), lang),
                          l.effort != null ? t("clientCard.effortOf", { effort: l.effort }) : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </AppText>
                    </View>
                    {l.prs > 0 ? <Chip kind="pr" label={t("clientCard.pr")} /> : null}
                    <PaidChip paid={l.paid} pending={paidPending} onToggle={() => onTogglePaid(l.scheduledWorkoutId, !l.paid)} />
                  </View>
                  {l.note ? <AppText size={14} tone="graphite">{`"${l.note}"`}</AppText> : null}
                </View>
              ))}
            </ListCard>
          ) : (
            <AppText size={15} tone="graphite">
              {t("clientCard.noWorkoutsYet")}
            </AppText>
          )
        ) : d.recent.length > 0 ? (
          <ListCard>
            {d.recent.map((r) => (
              <View
                key={r.id}
                style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 14 }}
              >
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <AppText size={16} weight="semibold" numberOfLines={1}>
                    {r.template_name}
                  </AppText>
                  <AppText size={13} tone="graphite">
                    {dayLabel(r.scheduled_date, lang)}
                  </AppText>
                </View>
                {r.status === "completed" ? (
                  <PaidChip paid={r.paid} pending={paidPending} onToggle={() => onTogglePaid(r.id, !r.paid)} />
                ) : r.scheduled_date < today ? (
                  <Chip kind="missed" label={t("clientCard.notDone")} />
                ) : (
                  <Chip kind="neutral" icon={Clock} label={t("clients.today")} />
                )}
              </View>
            ))}
          </ListCard>
        ) : (
          <AppText size={15} tone="graphite">
            {t("clientCard.noWorkoutsYet")}
          </AppText>
        )}
      </View>
    </>
  );
}

function DetailsTab({ intake, phone }: { intake: Record<string, unknown> | null; phone: string | null }) {
  const { t } = useTranslation();
  // intake is client-written jsonb — only ever render strings.
  const answered = INTAKE_KEYS.filter((k) => typeof intake?.[k] === "string" && (intake[k] as string).trim() !== "");
  const rows: { key: string; label: string; value: ReactNode }[] = answered.map((k) => ({
    key: k,
    label: t(`intake.${k}`),
    value: k === "experience" ? t(`intake.${intake![k] as string}`) : (intake![k] as string),
  }));
  if (phone) rows.push({ key: "phone", label: t("clientCard.phone"), value: ltr(phone) });

  return (
    <View style={{ gap: 10 }}>
      <SectionHeader title={t("clientCard.intakeTitle")} />
      {rows.length > 0 ? (
        <ListCard>
          {rows.map((r) => (
            <View key={r.key} style={{ paddingVertical: 12, paddingHorizontal: 14, gap: 4 }}>
              <AppText size={13} weight="semibold" tone="graphite">
                {r.label}
              </AppText>
              <AppText size={16} lineHeight={23}>
                {r.value}
              </AppText>
            </View>
          ))}
        </ListCard>
      ) : null}
      {answered.length === 0 ? (
        <AppText size={15} tone="graphite">
          {intake == null ? t("clientCard.intakeNone") : t("clientCard.intakeEmpty")}
        </AppText>
      ) : null}
    </View>
  );
}
