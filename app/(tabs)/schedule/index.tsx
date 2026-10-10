// app/(tabs)/schedule/index.tsx — V14: trainer's schedule-first calendar.
//
// A weekly strip (default) or monthly grid; pick a day to see (and act on)
// that day's workouts below, colored by the derived scheduled/completed/
// missed rules (SRS §4.1 — "missed" is derived on read, never stored). No
// flat "upcoming" list anymore — the calendar IS the browse surface, so the
// trainer always knows exactly what's due today/this week.
//
// Client management (add app/offline client, roster, contact phone) moved
// to app/clients.tsx (V14) so this tab stays purely "what's next" — reached
// from a button on the trainer Home instead.
//
// V19 (Step 2c): pull down to refetch the calendar, the roster and template
// names (lib/usePullToRefresh.ts).
//
// D24a: restyled to docs/design/screens/trainer-schedule.html and
// trainer-month.html — "יומן" + "היום", the שבוע | חודש switch, the week card
// (a dot per workout: done ink, missed ember, planned outlined) or the month
// grid (today volt, the selected day ink) with a legend, then the day in the
// Home's row style. Between timed sessions, gaps of an hour or more from
// 07:00 to 21:00 show as "פנוי" rows whose "קביעה" opens the schedule form at
// that date and time (lib/schedule.ts freeSlots). Tapping a session edits it
// (as before); swipe or long-press for edit / client card / mark done.

import { useState } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Check from "lucide-react-native/icons/check";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import MessageCircle from "lucide-react-native/icons/message-circle";
import Pencil from "lucide-react-native/icons/pencil";
import Plus from "lucide-react-native/icons/plus";
import User from "lucide-react-native/icons/user";

import { qk } from "@/lib/queryKeys";
import { RoleGate } from "@/components/RoleGate";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useRosterClients, type RosterClient } from "@/lib/useRoster";
import { usePullToRefresh } from "@/lib/usePullToRefresh";
import {
  addDays,
  addMonths,
  DEFAULT_TIME_ZONE,
  formatDisplayDate,
  isBeforeToday,
  todayISO,
  weekStartOf,
  weekdayOf,
} from "@/lib/dates";
import { buildWhatsAppReminderLink } from "@/lib/whatsapp";
import { ltr } from "@/lib/i18n";
import { freeSlots, type FreeSlot } from "@/lib/schedule";
import { localMinutesNow, minutesOf, weekdayLetter } from "@/components/home/format";
import { ActionRow } from "@/components/ui/ActionRow";
import {
  AppText,
  Button,
  Card,
  Chip,
  colors,
  Display,
  IconButton,
  ListCard,
  Num,
  Segmented,
} from "@/components/ui";

type ViewMode = "week" | "month";

type Workout = {
  id: string;
  scheduled_date: string;
  scheduled_time: string | null;
  status: "scheduled" | "completed";
  client_id: string | null;
  managed_client_id: string | null;
  template_id: string | null;
  notes: string | null;
  with_trainer: boolean;
};

type DerivedStatus = "completed" | "missed" | "today" | "upcoming";

/** A session counts as "next" until 10 minutes after its start (as on Home). */
const NEXT_GRACE_MINUTES = 10;
const WEEK_DOTS = 3;

function subjectKey(clientId: string | null, managedClientId: string | null) {
  return clientId ?? `m:${managedClientId}`;
}

function derivedStatus(w: Workout): DerivedStatus {
  if (w.status === "completed") return "completed";
  if (isBeforeToday(w.scheduled_date)) return "missed";
  if (w.scheduled_date === todayISO()) return "today";
  return "upcoming";
}

function localeName(locale: string) {
  return locale === "he" ? "he" : "en";
}

function fmt(dateISO: string, locale: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(localeName(locale), { ...options, timeZone: DEFAULT_TIME_ZONE }).format(
    new Date(`${dateISO}T12:00:00Z`),
  );
}

/** "ספטמבר – אוקטובר 2026", "ספטמבר 2026", "דצמבר 2026 – ינואר 2027". */
function spanLabel(from: string, to: string, locale: string) {
  const month = (d: string) => fmt(d, locale, { month: "long" });
  if (from.slice(0, 7) === to.slice(0, 7)) return `${month(from)} ${from.slice(0, 4)}`;
  if (from.slice(0, 4) === to.slice(0, 4)) return `${month(from)} – ${month(to)} ${to.slice(0, 4)}`;
  return `${month(from)} ${from.slice(0, 4)} – ${month(to)} ${to.slice(0, 4)}`;
}

/** "27.9" */
function dayMonth(dateISO: string) {
  return `${Number(dateISO.slice(8, 10))}.${Number(dateISO.slice(5, 7))}`;
}

export default function ScheduleHomeScreen() {
  return (
    <RoleGate role="trainer">
      <ScheduleHomeScreenBody />
    </RoleGate>
  );
}

function ScheduleHomeScreenBody() {
  const { t, i18n } = useTranslation();
  const { session, profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const lang = i18n.language;

  const trainerId = session!.user.id;
  const today = todayISO();

  const [mode, setMode] = useState<ViewMode>("week");
  const [selectedDate, setSelectedDate] = useState(today);

  const weekStart = weekStartOf(selectedDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const monthStart = `${selectedDate.slice(0, 7)}-01`;
  const [monthYear, monthNum] = monthStart.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(monthYear, monthNum, 0)).getUTCDate();
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => addDays(monthStart, i));

  const rangeStart = mode === "week" ? weekDays[0] : monthDays[0];
  const rangeEnd = mode === "week" ? weekDays[6] : monthDays[monthDays.length - 1];

  const workouts = useQuery({
    // The "scheduled-trainer" PREFIX is load-bearing: six mutations across the
    // app invalidate ["scheduled-trainer"], and TanStack matches partially, by
    // element. V14 renamed this key to "scheduled-trainer-range", which is a
    // different first element — so none of those six matched and the calendar
    // never refreshed after scheduling/editing/deleting. Keep the range in
    // later elements, never fused into the first one.
    queryKey: qk.scheduledTrainer.range(rangeStart, rangeEnd),
    queryFn: async (): Promise<Workout[]> => {
      const { data, error } = await supabase
        .from("scheduled_workouts")
        .select("id, scheduled_date, scheduled_time, status, client_id, managed_client_id, template_id, notes, with_trainer")
        .eq("trainer_id", trainerId)
        .gte("scheduled_date", rangeStart)
        .lte("scheduled_date", rangeEnd)
        .order("scheduled_time", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });

  const roster = useRosterClients(trainerId);
  const rosterByKey = new Map((roster.data ?? []).map((c) => [c.kind === "app" ? c.refId : `m:${c.refId}`, c]));

  const templateIds = [...new Set((workouts.data ?? []).map((w) => w.template_id).filter(Boolean) as string[])];
  const templates = useQuery({
    // Same prefix rule as the workouts key above: template mutations invalidate
    // ["templates"], and a first element of "templates-by-ids" never matches
    // it — so a renamed template kept showing its old name here.
    queryKey: qk.templates.byIds(templateIds),
    enabled: templateIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("workout_templates").select("id, name").in("id", templateIds);
      if (error) throw error;
      const map = new Map<string, string>();
      data?.forEach((tpl) => map.set(tpl.id, tpl.name));
      return map;
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

  const byDay = new Map<string, Workout[]>();
  (workouts.data ?? []).forEach((w) => {
    const list = byDay.get(w.scheduled_date) ?? [];
    list.push(w);
    byDay.set(w.scheduled_date, list);
  });

  const dayItems = byDay.get(selectedDate) ?? [];
  const timed = dayItems.filter((w) => w.scheduled_time);
  const untimed = dayItems.filter((w) => !w.scheduled_time);
  const nowMin = localMinutesNow();
  const isToday = selectedDate === today;
  const nextId = isToday
    ? timed.find((w) => w.status === "scheduled" && minutesOf(w.scheduled_time!) >= nowMin - NEXT_GRACE_MINUTES)?.id
    : undefined;
  const slots =
    selectedDate < today ? [] : freeSlots(timed.map((w) => w.scheduled_time!), isToday ? nowMin : 0);

  // Sessions and free slots in time order; untimed sessions last.
  type Line = { kind: "session"; w: Workout } | { kind: "free"; slot: FreeSlot };
  const lines: Line[] = [
    ...timed.map((w): Line => ({ kind: "session", w })),
    ...slots.map((slot): Line => ({ kind: "free", slot })),
  ].sort((a, b) => {
    const ta = a.kind === "session" ? a.w.scheduled_time!.slice(0, 5) : a.slot.start;
    const tb = b.kind === "session" ? b.w.scheduled_time!.slice(0, 5) : b.slot.start;
    return ta.localeCompare(tb);
  });
  untimed.forEach((w) => lines.push({ kind: "session", w }));

  const refresh = usePullToRefresh([qk.scheduledTrainer.all, qk.roster.all, qk.templates.all]);

  function schedule(date: string, time?: string) {
    router.push({ pathname: "/schedule/new", params: time ? { date, time } : { date } });
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.chalk }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 24, gap: 18 }}
      refreshControl={<RefreshControl {...refresh} />}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
        <View style={{ flex: 1, gap: 6 }}>
          <Display size={44}>{t("schedule.home.calendarTitle")}</Display>
          <AppText size={14} tone="graphite">
            {mode === "week" ? spanLabel(weekDays[0], weekDays[6], lang) : spanLabel(monthStart, monthStart, lang)}
          </AppText>
        </View>
        <Button label={t("schedule.home.todayBtn")} variant="secondary" size={44} onPress={() => setSelectedDate(today)} />
      </View>

      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: "week", label: t("schedule.home.weekView") },
          { value: "month", label: t("schedule.home.monthView") },
        ]}
      />

      <Card style={{ padding: 10, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <IconButton
            icon={ChevronLeft}
            mirror
            variant="ghost"
            accessibilityLabel={mode === "week" ? t("schedule.home.prevWeek") : t("schedule.home.prevMonth")}
            onPress={() => setSelectedDate(mode === "week" ? addDays(selectedDate, -7) : addMonths(monthStart, -1))}
          />
          <AppText size={mode === "week" ? 15 : 17} weight="semibold" center style={{ flex: 1 }}>
            {mode === "week"
              ? ltr(`${dayMonth(weekDays[0])} – ${dayMonth(weekDays[6])}`)
              : fmt(monthStart, lang, { year: "numeric", month: "long" })}
          </AppText>
          <IconButton
            icon={ChevronRight}
            mirror
            variant="ghost"
            accessibilityLabel={mode === "week" ? t("schedule.home.nextWeek") : t("schedule.home.nextMonth")}
            onPress={() => setSelectedDate(mode === "week" ? addDays(selectedDate, 7) : addMonths(monthStart, 1))}
          />
        </View>

        {mode === "week" ? (
          <WeekStrip days={weekDays} selected={selectedDate} today={today} byDay={byDay} onSelect={setSelectedDate} />
        ) : (
          <MonthGrid monthStart={monthStart} selected={selectedDate} today={today} byDay={byDay} onSelect={setSelectedDate} />
        )}

        <Legend />
      </Card>

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <AppText size={18} weight="semibold" lineHeight={23} style={{ flexShrink: 1 }}>
            {fmt(selectedDate, lang, { weekday: "long", day: "numeric", month: "long" })}
          </AppText>
          {dayItems.length > 0 ? (
            <AppText size={14} tone="graphite">
              {t("schedule.home.count", { count: dayItems.length })}
            </AppText>
          ) : null}
        </View>

        {workouts.error ? (
          <AppText size={14} tone="ember">
            {(workouts.error as Error).message}
          </AppText>
        ) : null}

        {dayItems.length > 0 || slots.length > 0 ? (
          <ListCard>
            {lines.map((line) =>
              line.kind === "free" ? (
                <FreeRow key={`free-${line.slot.start}`} slot={line.slot} onSchedule={() => schedule(selectedDate, line.slot.start)} />
              ) : (
                <SessionRow
                  key={line.w.id}
                  w={line.w}
                  next={line.w.id === nextId}
                  client={rosterByKey.get(subjectKey(line.w.client_id, line.w.managed_client_id))}
                  templateName={
                    line.w.template_id
                      ? templates.data?.get(line.w.template_id) ?? t("schedule.home.workout")
                      : t("schedule.home.workout")
                  }
                  trainerName={profile?.display_name ?? t("schedule.home.yourTrainer")}
                  marking={markDone.isPending}
                  onEdit={() => router.push(`/schedule/${line.w.id}`)}
                  onMarkDone={() => markDone.mutate(line.w.id)}
                />
              ),
            )}
          </ListCard>
        ) : workouts.isSuccess ? (
          <Card style={{ gap: 12 }}>
            <AppText size={15} tone="graphite">
              {t("schedule.home.nothingScheduled")}
            </AppText>
          </Card>
        ) : null}

        {selectedDate >= today ? (
          <Button
            label={t("schedule.home.scheduleWorkout")}
            icon={Plus}
            variant="secondary"
            size={48}
            block
            onPress={() => schedule(selectedDate)}
          />
        ) : null}
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// The day list
// ---------------------------------------------------------------------------

function SessionRow({
  w,
  next,
  client,
  templateName,
  trainerName,
  marking,
  onEdit,
  onMarkDone,
}: {
  w: Workout;
  next: boolean;
  client?: RosterClient;
  templateName: string;
  trainerName: string;
  marking: boolean;
  onEdit: () => void;
  onMarkDone: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const status = derivedStatus(w);
  const done = status === "completed";
  const offline = client?.kind === "managed";
  const canMark = offline && !done && w.scheduled_date <= todayISO();
  const link = done
    ? null
    : buildWhatsAppReminderLink({
        phone: client?.phone ?? null,
        clientName: client?.name ?? t("schedule.home.client"),
        trainerName,
        dateLabel: formatDisplayDate(w.scheduled_date),
        timeLabel: w.scheduled_time ? w.scheduled_time.slice(0, 5) : null,
        templateName,
      });
  const openClient = client ? () => router.push(`/dashboard/${client.refId}?kind=${client.kind}`) : undefined;

  const actions = [
    { key: "edit", label: t("schedule.home.edit"), icon: Pencil, tone: "edit" as const, onPress: onEdit },
    ...(openClient
      ? [{ key: "client", label: t("schedule.home.clientCard"), icon: User, tone: "neutral" as const, onPress: openClient }]
      : []),
    ...(canMark ? [{ key: "done", label: t("trainerHome.markDone"), icon: Check, tone: "done" as const, onPress: onMarkDone }] : []),
  ];

  return (
    <ActionRow actions={actions} sheetTitle={client?.name ?? templateName}>
      <View style={{ backgroundColor: next ? colors.voltSoft : "transparent" }}>
        <Pressable
          accessibilityRole="button"
          onPress={onEdit}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingVertical: 12,
            paddingHorizontal: 14,
            minHeight: 72,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <View style={{ width: 50 }}>
            <Num size={21} weight="semibold" tone={done ? "smoke" : "ink"}>
              {w.scheduled_time ? w.scheduled_time.slice(0, 5) : "—"}
            </Num>
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
            <AppText size={16} weight="semibold" numberOfLines={1}>
              {client?.name ?? t("schedule.home.client")}
            </AppText>
            <AppText size={14} tone="graphite" numberOfLines={1}>
              {`${templateName} · ${
                offline && !done
                  ? t("trainerHome.notMarked")
                  : w.with_trainer
                    ? t("trainerHome.withTrainer")
                    : t("trainerHome.solo")
              }`}
            </AppText>
            {next || offline || w.notes ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {next ? <Chip kind="next" label={t("schedule.home.next")} /> : null}
                {offline ? <Chip kind="noApp" label={t("trainerHome.noApp")} /> : null}
              </View>
            ) : null}
            {w.notes ? (
              <AppText size={13} tone="smoke" numberOfLines={2}>
                {`"${w.notes}"`}
              </AppText>
            ) : null}
          </View>
          {done ? (
            <Chip kind="done" label={t("trainerHome.done")} />
          ) : status === "missed" ? (
            <Chip kind="missed" label={t("schedule.home.missed")} />
          ) : link ? (
            <IconButton
              icon={MessageCircle}
              accessibilityLabel={t("trainerHome.remindWhatsApp")}
              onPress={() => Linking.openURL(link)}
            />
          ) : null}
        </Pressable>
        {canMark ? (
          // Lined up under the name: 14 padding + 50 time + 12 gap.
          <View style={{ paddingStart: 76, paddingEnd: 14, paddingBottom: 14, marginTop: -4, flexDirection: "row" }}>
            <Button
              label={t("trainerHome.markDone")}
              icon={Check}
              variant="secondary"
              size={44}
              disabled={marking}
              onPress={onMarkDone}
            />
          </View>
        ) : null}
      </View>
    </ActionRow>
  );
}

function FreeRow({ slot, onSchedule }: { slot: FreeSlot; onSchedule: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 14, minHeight: 64 }}>
      <View style={{ width: 50 }}>
        <Num size={21} weight="semibold" tone="smoke">
          {slot.start}
        </Num>
      </View>
      <View
        style={{
          flex: 1,
          minHeight: 48,
          paddingStart: 14,
          paddingEnd: 6,
          borderRadius: 14,
          borderWidth: 1.5,
          borderStyle: "dashed",
          borderColor: "#C9C6BB",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <AppText size={14} tone="graphite" style={{ flexShrink: 1 }}>
          {t("schedule.home.freeUntil", { time: ltr(slot.end) })}
        </AppText>
        <Button label={t("schedule.home.book")} icon={Plus} variant="ghost" size={44} onPress={onSchedule} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Week strip, month grid, legend
// ---------------------------------------------------------------------------

function Dot({ status, onInk }: { status: DerivedStatus; onInk?: boolean }) {
  const filled = status === "completed" || status === "missed";
  const fill = status === "missed" ? colors.ember : onInk ? colors.volt : colors.ink;
  return (
    <View
      style={{
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: filled ? fill : "transparent",
        borderWidth: filled ? 0 : 1.5,
        borderColor: onInk ? colors.ash : colors.smoke,
      }}
    />
  );
}

function WeekStrip({
  days,
  selected,
  today,
  byDay,
  onSelect,
}: {
  days: string[];
  selected: string;
  today: string;
  byDay: Map<string, Workout[]>;
  onSelect: (dateISO: string) => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {days.map((d) => {
        const on = d === selected;
        const isToday = d === today;
        const items = byDay.get(d) ?? [];
        return (
          <Pressable
            key={d}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${fmt(d, i18n.language, { weekday: "long", day: "numeric", month: "long" })}, ${t(
              "schedule.home.count",
              { count: items.length },
            )}`}
            onPress={() => onSelect(d)}
            style={{
              flex: 1,
              minHeight: 76,
              borderRadius: 16,
              backgroundColor: on ? colors.ink : isToday ? colors.voltSoft : "transparent",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
            }}
          >
            <AppText size={12} weight="semibold" tone={on ? "ash" : "smoke"} center>
              {weekdayLetter(d, i18n.language)}
            </AppText>
            <Num size={21} weight="semibold" tone={on ? "white" : "ink"} center>
              {String(Number(d.slice(8, 10)))}
            </Num>
            <View style={{ height: 6, flexDirection: "row", gap: 3 }}>
              {items.slice(0, WEEK_DOTS).map((w) => (
                <Dot key={w.id} status={derivedStatus(w)} onInk={on} />
              ))}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function MonthGrid({
  monthStart,
  selected,
  today,
  byDay,
  onSelect,
}: {
  monthStart: string;
  selected: string;
  today: string;
  byDay: Map<string, Workout[]>;
  onSelect: (dateISO: string) => void;
}) {
  const { i18n } = useTranslation();
  const [y, m] = monthStart.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstWeekday = weekdayOf(monthStart);
  const cells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => addDays(monthStart, i)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const aSunday = weekStartOf(monthStart);
  const rows = Array.from({ length: cells.length / 7 }, (_, r) => cells.slice(r * 7, r * 7 + 7));

  return (
    <View>
      <View style={{ flexDirection: "row" }}>
        {Array.from({ length: 7 }, (_, i) => (
          <AppText key={i} size={12} weight="semibold" tone="smoke" center style={{ flex: 1 }}>
            {weekdayLetter(addDays(aSunday, i), i18n.language)}
          </AppText>
        ))}
      </View>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: "row" }}>
          {row.map((d, i) => {
            if (!d) return <View key={`blank-${r}-${i}`} style={{ flex: 1, height: 56 }} />;
            const on = d === selected;
            const isToday = d === today;
            const items = byDay.get(d) ?? [];
            // One dot per day: missed beats planned beats done.
            const statuses = items.map(derivedStatus);
            const dot: DerivedStatus | null = statuses.includes("missed")
              ? "missed"
              : statuses.some((s) => s !== "completed")
                ? "upcoming"
                : statuses.length > 0
                  ? "completed"
                  : null;
            return (
              <Pressable
                key={d}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => onSelect(d)}
                style={{ flex: 1, height: 56, alignItems: "center", justifyContent: "center", gap: 4 }}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: on ? colors.ink : isToday ? colors.volt : "transparent",
                  }}
                >
                  <Num size={19} weight="semibold" tone={on ? "white" : items.length > 0 || isToday ? "ink" : "smoke"} center>
                    {String(Number(d.slice(8, 10)))}
                  </Num>
                </View>
                <View style={{ height: 6 }}>{dot ? <Dot status={dot} /> : null}</View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function Legend() {
  const { t } = useTranslation();
  const item = (status: DerivedStatus, label: string) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ transform: [{ scale: 8 / 6 }] }}>
        <Dot status={status} />
      </View>
      <AppText size={12} tone="graphite">
        {label}
      </AppText>
    </View>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16 }}>
      {item("completed", t("schedule.home.legendDone"))}
      {item("missed", t("schedule.home.legendMissed"))}
      {item("upcoming", t("schedule.home.legendPlanned"))}
    </View>
  );
}
