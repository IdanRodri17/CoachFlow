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

import { useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, Redirect, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useRosterClients } from "@/lib/useRoster";
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
import { isRTL } from "@/lib/i18n";

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

export default function ScheduleHomeScreen() {
  const { t, i18n } = useTranslation();
  const { session, profile } = useAuth();
  const router = useRouter();

  if (profile && profile.role !== "trainer") return <Redirect href="/" />;
  const trainerId = session!.user.id;

  const [mode, setMode] = useState<ViewMode>("week");
  const [selectedDate, setSelectedDate] = useState(todayISO());

  const weekStart = weekStartOf(selectedDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const monthStart = `${selectedDate.slice(0, 7)}-01`;
  const [monthYear, monthNum] = monthStart.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(monthYear, monthNum, 0)).getUTCDate();
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => addDays(monthStart, i));

  const rangeStart = mode === "week" ? weekDays[0] : monthDays[0];
  const rangeEnd = mode === "week" ? weekDays[6] : monthDays[monthDays.length - 1];

  const workouts = useQuery({
    queryKey: ["scheduled-trainer-range", rangeStart, rangeEnd],
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
    queryKey: ["templates-by-ids", templateIds.join(",")],
    enabled: templateIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("workout_templates").select("id, name").in("id", templateIds);
      if (error) throw error;
      const map = new Map<string, string>();
      data?.forEach((tpl) => map.set(tpl.id, tpl.name));
      return map;
    },
  });

  const byDay = new Map<string, Workout[]>();
  (workouts.data ?? []).forEach((w) => {
    const list = byDay.get(w.scheduled_date) ?? [];
    list.push(w);
    byDay.set(w.scheduled_date, list);
  });

  function dotColor(dateISO: string): string | null {
    const items = byDay.get(dateISO);
    if (!items || items.length === 0) return null;
    if (items.some((w) => derivedStatus(w) === "missed")) return "bg-red-500";
    if (items.every((w) => derivedStatus(w) === "completed")) return "bg-emerald-500";
    return "bg-slate-400";
  }

  const dayItems = byDay.get(selectedDate) ?? [];

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["bottom"]}>
      <View className="flex-row items-center gap-2 px-6 pt-4">
        <ModeBtn label={t("schedule.home.weekView")} active={mode === "week"} onPress={() => setMode("week")} />
        <ModeBtn label={t("schedule.home.monthView")} active={mode === "month"} onPress={() => setMode("month")} />
        <View className="flex-1" />
        <Pressable
          className="items-center justify-center rounded-lg border border-slate-300 px-3 py-2 active:bg-slate-100"
          onPress={() => setSelectedDate(todayISO())}
        >
          <Text className="text-sm font-semibold text-slate-700">{t("schedule.home.todayBtn")}</Text>
        </Pressable>
      </View>

      {mode === "week" ? (
        <WeekStrip
          days={weekDays}
          selected={selectedDate}
          onSelect={setSelectedDate}
          dotColor={dotColor}
          onPrev={() => setSelectedDate(addDays(selectedDate, -7))}
          onNext={() => setSelectedDate(addDays(selectedDate, 7))}
          locale={i18n.language}
        />
      ) : (
        <MonthGrid
          monthStart={monthStart}
          selected={selectedDate}
          onSelect={setSelectedDate}
          dotColor={dotColor}
          onPrev={() => setSelectedDate(addMonths(monthStart, -1))}
          onNext={() => setSelectedDate(addMonths(monthStart, 1))}
          locale={i18n.language}
        />
      )}

      <ScrollView contentContainerClassName="px-6 pb-6 pt-4">
        <Text className="w-full text-left text-lg font-bold text-slate-900">
          {formatDisplayDate(selectedDate, localeName(i18n.language))}
        </Text>

        <Pressable
          className="mt-3 items-center self-start rounded-xl bg-slate-900 px-4 py-2.5 active:opacity-80"
          onPress={() => router.push("/schedule/new")}
        >
          <Text className="text-sm font-semibold text-white">{t("schedule.home.scheduleWorkout")}</Text>
        </Pressable>

        {workouts.isLoading ? (
          <ActivityIndicator className="mt-6" />
        ) : workouts.error ? (
          <Text className="mt-4 w-full text-left text-sm text-red-600">{(workouts.error as Error).message}</Text>
        ) : dayItems.length > 0 ? (
          <View className="mt-4 gap-2">
            {dayItems.map((w) => {
              const status = derivedStatus(w);
              const client = rosterByKey.get(subjectKey(w.client_id, w.managed_client_id));
              const clientName = client?.name ?? t("schedule.home.client");
              const templateName = w.template_id
                ? templates.data?.get(w.template_id) ?? t("schedule.home.workout")
                : t("schedule.home.workout");
              const whatsappLink = buildWhatsAppReminderLink({
                phone: client?.phone ?? null,
                clientName,
                trainerName: profile?.display_name ?? t("schedule.home.yourTrainer"),
                dateLabel: formatDisplayDate(w.scheduled_date),
                timeLabel: w.scheduled_time ? w.scheduled_time.slice(0, 5) : null,
                templateName,
              });
              const badgeClass =
                status === "completed"
                  ? "bg-emerald-100 text-emerald-700"
                  : status === "missed"
                    ? "bg-red-100 text-red-700"
                    : "bg-amber-100 text-amber-700";
              const badgeLabel =
                status === "completed"
                  ? t("home.doneToday")
                  : status === "missed"
                    ? t("home.overdue")
                    : status === "today"
                      ? t("home.dueToday")
                      : null;
              return (
                <View key={w.id} className="rounded-xl border border-slate-200 px-4 py-3">
                  <Link href={`/schedule/${w.id}`} asChild>
                    <Pressable className="active:opacity-70">
                      <View className="flex-row items-center justify-between gap-2">
                        <Text className="flex-1 text-left text-base font-semibold text-slate-900">
                          {templateName}
                        </Text>
                        {badgeLabel ? (
                          <Text className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badgeClass}`}>
                            {badgeLabel}
                          </Text>
                        ) : null}
                      </View>
                      <Text className="mt-0.5 w-full text-left text-sm text-slate-500">
                        {clientName}
                        {w.scheduled_time ? ` · ${w.scheduled_time.slice(0, 5)}` : ""}
                      </Text>
                      {client?.kind === "managed" ? (
                        <Text className="mt-1 self-start rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                          {t("schedule.home.offline")}
                        </Text>
                      ) : null}
                      {w.notes ? (
                        <Text className="mt-1 w-full text-left text-sm text-slate-400">“{w.notes}”</Text>
                      ) : null}
                    </Pressable>
                  </Link>
                  {whatsappLink ? (
                    <Pressable
                      className="mt-2 items-center self-start rounded-lg border border-emerald-300 px-3 py-1.5 active:bg-emerald-50"
                      onPress={() => Linking.openURL(whatsappLink)}
                    >
                      <Text className="text-xs font-semibold text-emerald-700">
                        {t("schedule.home.remindOnWhatsApp")}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : (
          <Text className="mt-4 w-full text-left text-sm text-slate-400">{t("schedule.home.nothingScheduled")}</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ModeBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-lg border px-3 py-2 ${active ? "border-slate-900 bg-slate-900" : "border-slate-300 bg-white"}`}
    >
      <Text className={`text-sm font-semibold ${active ? "text-white" : "text-slate-700"}`}>{label}</Text>
    </Pressable>
  );
}

function WeekStrip({
  days,
  selected,
  onSelect,
  dotColor,
  onPrev,
  onNext,
  locale,
}: {
  days: string[];
  selected: string;
  onSelect: (dateISO: string) => void;
  dotColor: (dateISO: string) => string | null;
  onPrev: () => void;
  onNext: () => void;
  locale: string;
}) {
  const fmt = (dateISO: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(localeName(locale), { ...options, timeZone: DEFAULT_TIME_ZONE }).format(
      new Date(`${dateISO}T12:00:00Z`),
    );

  return (
    <View className="mt-4 flex-row items-center px-2">
      <Pressable onPress={onPrev} className="h-9 w-9 items-center justify-center rounded-lg active:bg-slate-100">
        <Text className="text-lg text-slate-400">{isRTL() ? "›" : "‹"}</Text>
      </Pressable>
      <View className="flex-1 flex-row justify-between">
        {days.map((d) => {
          const selectedDay = d === selected;
          const isToday = d === todayISO();
          const dot = dotColor(d);
          return (
            <Pressable
              key={d}
              onPress={() => onSelect(d)}
              className={`items-center rounded-xl px-2 py-2 ${
                selectedDay ? "bg-slate-900" : isToday ? "bg-slate-100" : ""
              }`}
            >
              <Text className={`text-xs ${selectedDay ? "text-slate-300" : "text-slate-400"}`}>
                {fmt(d, { weekday: "short" })}
              </Text>
              <Text className={`mt-0.5 text-base font-semibold ${selectedDay ? "text-white" : "text-slate-900"}`}>
                {fmt(d, { day: "numeric" })}
              </Text>
              <View className={`mt-1 h-1.5 w-1.5 rounded-full ${dot ?? "bg-transparent"}`} />
            </Pressable>
          );
        })}
      </View>
      <Pressable onPress={onNext} className="h-9 w-9 items-center justify-center rounded-lg active:bg-slate-100">
        <Text className="text-lg text-slate-400">{isRTL() ? "‹" : "›"}</Text>
      </Pressable>
    </View>
  );
}

function MonthGrid({
  monthStart,
  selected,
  onSelect,
  dotColor,
  onPrev,
  onNext,
  locale,
}: {
  monthStart: string;
  selected: string;
  onSelect: (dateISO: string) => void;
  dotColor: (dateISO: string) => string | null;
  onPrev: () => void;
  onNext: () => void;
  locale: string;
}) {
  const [y, m] = monthStart.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstWeekday = weekdayOf(monthStart);
  const cells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => addDays(monthStart, i)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const fmt = (dateISO: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(localeName(locale), { ...options, timeZone: DEFAULT_TIME_ZONE }).format(
      new Date(`${dateISO}T12:00:00Z`),
    );

  const aSunday = weekStartOf(monthStart);
  const weekdayLabels = Array.from({ length: 7 }, (_, i) => fmt(addDays(aSunday, i), { weekday: "narrow" }));

  return (
    <View className="mt-4 px-4">
      <View className="flex-row items-center justify-between px-2">
        <Pressable onPress={onPrev} className="h-9 w-9 items-center justify-center rounded-lg active:bg-slate-100">
          <Text className="text-lg text-slate-400">{isRTL() ? "›" : "‹"}</Text>
        </Pressable>
        <Text className="text-base font-bold text-slate-900">{fmt(monthStart, { year: "numeric", month: "long" })}</Text>
        <Pressable onPress={onNext} className="h-9 w-9 items-center justify-center rounded-lg active:bg-slate-100">
          <Text className="text-lg text-slate-400">{isRTL() ? "‹" : "›"}</Text>
        </Pressable>
      </View>
      <View className="mt-2 flex-row">
        {weekdayLabels.map((w, i) => (
          <Text key={i} className="flex-1 text-center text-xs font-medium text-slate-400">
            {w}
          </Text>
        ))}
      </View>
      <View className="mt-1 flex-row flex-wrap">
        {cells.map((d, i) => {
          if (!d) return <View key={`blank-${i}`} style={{ width: "14.28%" }} className="items-center py-2" />;
          const selectedDay = d === selected;
          const isToday = d === todayISO();
          const dot = dotColor(d);
          return (
            <Pressable key={d} style={{ width: "14.28%" }} className="items-center py-1" onPress={() => onSelect(d)}>
              <View
                className={`h-9 w-9 items-center justify-center rounded-full ${
                  selectedDay ? "bg-slate-900" : isToday ? "bg-slate-100" : ""
                }`}
              >
                <Text className={`text-sm font-semibold ${selectedDay ? "text-white" : "text-slate-900"}`}>
                  {fmt(d, { day: "numeric" })}
                </Text>
              </View>
              <View className={`mt-0.5 h-1.5 w-1.5 rounded-full ${dot ?? "bg-transparent"}`} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
