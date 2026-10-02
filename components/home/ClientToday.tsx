// components/home/ClientToday.tsx — D22: the client's Home, "היום"
// (docs/design/screens/client-today.html).
//
// Top to bottom: date + greeting + sessions left in the package; this week as
// seven circles (done ✓ ink, today volt, planned outlined, rest plain —
// derived from this week's scheduled workouts, missed shown in ember); the
// dark hero card for today's workout (or the next one on a rest day); "הבא
// בתור" with ±1 day for solo workouts (the existing shift rules); the weekly
// check-in nudge. A client with no trainer yet gets the join card first.
//
// Nothing here is stored or faked: statuses are derived on read (SRS §4.1),
// the streak comes from client_streaks, sessions left from packages.
//
// The trainer's name isn't readable by clients yet (my_trainer(), main B1), so
// the copy says "your trainer" for now.

import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Link, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { LucideProps } from "lucide-react-native";
import Activity from "lucide-react-native/icons/activity";
import Calendar from "lucide-react-native/icons/calendar";
import Check from "lucide-react-native/icons/check";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Clock from "lucide-react-native/icons/clock";
import Flame from "lucide-react-native/icons/flame";
import MessageSquare from "lucide-react-native/icons/message-square";
import Play from "lucide-react-native/icons/play";
import User from "lucide-react-native/icons/user";
import Users from "lucide-react-native/icons/users";
import UserPlus from "lucide-react-native/icons/user-plus";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { addDays, todayISO, weekStartOf } from "@/lib/dates";
import { ltr } from "@/lib/i18n";
import {
  AppText,
  Button,
  Card,
  Chip,
  colors,
  Display,
  Icon,
  IconButton,
  ListCard,
  Num,
  type IconComponent,
} from "@/components/ui";

import { firstName, greetingKey, longDate, shortDate, weekdayLetter } from "./format";

type Upcoming = {
  id: string;
  scheduled_date: string;
  scheduled_time: string | null;
  status: "scheduled" | "completed";
  with_trainer: boolean;
  notes: string | null;
  template_id: string | null;
  template_name: string;
};

export function ClientToday() {
  const { session, profile } = useAuth();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const clientId = session!.user.id;
  const today = todayISO();
  const weekStart = weekStartOf(today);
  const lang = i18n.language;

  // Today onward, with template names (same key and shape as before, so the
  // workout screen's invalidation still refreshes it).
  const upcoming = useQuery({
    queryKey: ["scheduled-client"],
    queryFn: async (): Promise<Upcoming[]> => {
      const { data: sws, error } = await supabase
        .from("scheduled_workouts")
        .select("*")
        .eq("client_id", clientId)
        .gte("scheduled_date", today)
        .order("scheduled_date")
        .order("scheduled_time", { ascending: true, nullsFirst: false });
      if (error) throw error;
      const tplIds = [...new Set(sws.map((s) => s.template_id).filter(Boolean) as string[])];
      const names = new Map<string, string>();
      if (tplIds.length > 0) {
        const { data } = await supabase.from("workout_templates").select("id, name").in("id", tplIds);
        data?.forEach((tpl) => names.set(tpl.id, tpl.name));
      }
      return sws.map((s) => ({
        ...s,
        template_name: s.template_id ? names.get(s.template_id) ?? "Workout" : "Workout",
      }));
    },
  });

  // This week (Sun–Sat), for the strip.
  const week = useQuery({
    queryKey: ["scheduled-client", "week", weekStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scheduled_workouts")
        .select("id, scheduled_date, status")
        .eq("client_id", clientId)
        .gte("scheduled_date", weekStart)
        .lte("scheduled_date", addDays(weekStart, 6));
      if (error) throw error;
      return data;
    },
  });

  const trainerLinks = useQuery({
    queryKey: ["my-trainer-links", clientId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("trainer_clients")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId);
      if (error) throw error;
      return count ?? 0;
    },
  });

  // Same key and shape as the Profile tab's package query.
  const pkg = useQuery({
    queryKey: ["package", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("packages")
        .select("total_sessions, used_sessions")
        .eq("client_id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const streak = useQuery({
    queryKey: ["client-streak", clientId],
    queryFn: async () => {
      const { data, error } = await supabase.from("client_streaks").select("current_streak").eq("client_id", clientId);
      if (error) throw error;
      return Math.max(0, ...data.map((r) => r.current_streak));
    },
  });

  // "Under check-ins", so submitting one on Progress refreshes this too.
  const checkedIn = useQuery({
    queryKey: ["check-ins", clientId, "week", weekStart],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("check_ins")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("week_start", weekStart);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
  });

  const shift = useMutation({
    mutationFn: async ({ id, date }: { id: string; date: string }) => {
      const { error } = await supabase.from("scheduled_workouts").update({ scheduled_date: date }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["scheduled-client"] }),
  });
  function shiftDay(s: Upcoming, delta: number) {
    const next = addDays(s.scheduled_date, delta);
    if (delta < 0 && next < today) return; // never before today
    shift.mutate({ id: s.id, date: next });
  }

  const all = upcoming.data ?? [];
  const hero =
    all.find((s) => s.scheduled_date === today && s.status !== "completed") ??
    all.find((s) => s.scheduled_date === today) ??
    all.find((s) => s.scheduled_date > today && s.status !== "completed");
  const upNext = all.filter((s) => s.id !== hero?.id && s.status !== "completed").slice(0, 4);
  const left = pkg.data ? pkg.data.total_sessions - pkg.data.used_sessions : null;
  const hasTrainer = (trainerLinks.data ?? 0) > 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.chalk }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 24, gap: 22 }}
    >
      <View style={{ gap: 6 }}>
        <AppText size={14} weight="medium" tone="smoke">
          {longDate(today, lang)}
        </AppText>
        <Display size={44}>{t(greetingKey(), { name: firstName(profile?.display_name ?? "") })}</Display>
        {left != null && left > 0 ? (
          <AppText size={15} tone="graphite">
            {t("today.sessionsLeft", { count: left })}
          </AppText>
        ) : null}
      </View>

      {trainerLinks.data === 0 ? (
        <Link href="/join" asChild>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
          >
            <Card style={{ flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 2, borderColor: colors.ink }}>
              <IconBox icon={UserPlus} bg={colors.volt} fg={colors.ink} />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText size={16} weight="semibold">
                  {t("home.joinTrainerTitle")}
                </AppText>
                <AppText size={14} tone="graphite">
                  {t("home.joinTrainerHint")}
                </AppText>
              </View>
              <Icon icon={ChevronRight} size={20} color={colors.graphite} mirror />
            </Card>
          </Pressable>
        </Link>
      ) : null}

      <WeekStrip weekStart={weekStart} today={today} rows={week.data ?? []} streak={streak.data ?? 0} />

      {hero ? (
        <HeroCard
          item={hero}
          isToday={hero.scheduled_date === today}
          onStart={() => router.push(`/workout/${hero.id}`)}
          onMoveDay={() => shiftDay(hero, 1)}
          moving={shift.isPending}
        />
      ) : upcoming.isSuccess ? (
        <Card>
          <AppText size={16} weight="semibold">
            {t("today.noWorkouts")}
          </AppText>
          <AppText size={14} tone="graphite" style={{ marginTop: 4 }}>
            {t("today.noWorkoutsHint")}
          </AppText>
        </Card>
      ) : null}

      {upNext.length > 0 ? (
        <View style={{ gap: 10 }}>
          <View style={{ minHeight: 32, justifyContent: "center" }}>
            <AppText size={18} weight="semibold" lineHeight={23}>
              {t("today.upNext")}
            </AppText>
          </View>
          <ListCard inset={16}>
            {upNext.map((s) => (
              <UpNextRow
                key={s.id}
                item={s}
                today={today}
                busy={shift.isPending}
                onOpen={() => router.push(`/workout/${s.id}`)}
                onEarlier={() => shiftDay(s, -1)}
                onLater={() => shiftDay(s, 1)}
              />
            ))}
          </ListCard>
        </View>
      ) : null}

      {hasTrainer && checkedIn.data === false ? (
        <Link href="/progress" asChild>
          <Pressable accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
            <Card style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <IconBox icon={Activity} bg={colors.voltSoft} fg={colors.voltInk} />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText size={16} weight="semibold">
                  {t("today.checkinTitle")}
                </AppText>
                <AppText size={14} tone="graphite">
                  {t("today.checkinHint")}
                </AppText>
              </View>
              <Icon icon={ChevronRight} size={20} color={colors.graphite} mirror />
            </Card>
          </Pressable>
        </Link>
      ) : null}
    </ScrollView>
  );
}

function IconBox({ icon, bg, fg }: { icon: IconComponent; bg: string; fg: string }) {
  return (
    <View
      style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}
    >
      <Icon icon={icon} size={22} color={fg} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// This week
// ---------------------------------------------------------------------------
function WeekStrip({
  weekStart,
  today,
  rows,
  streak,
}: {
  weekStart: string;
  today: string;
  rows: { scheduled_date: string; status: "scheduled" | "completed" }[];
  streak: number;
}) {
  const { t, i18n } = useTranslation();
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <AppText size={18} weight="semibold" lineHeight={23}>
          {t("today.thisWeek")}
        </AppText>
        {streak > 0 ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Icon icon={Flame} size={18} />
            <AppText size={15} weight="semibold">
              {t("today.streak", { count: streak })}
            </AppText>
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        {days.map((d) => {
          const dayRows = rows.filter((r) => r.scheduled_date === d);
          const done = dayRows.some((r) => r.status === "completed");
          const planned = dayRows.some((r) => r.status === "scheduled");
          const isToday = d === today;
          const missed = !done && planned && d < today;
          const letter = weekdayLetter(d, i18n.language);
          const num = String(Number(d.slice(8, 10)));
          const label = done
            ? "today.dayDone"
            : isToday
              ? planned
                ? "today.dayToday"
                : "today.dayTodayRest"
              : missed
                ? "today.dayMissed"
                : planned
                  ? "today.dayPlanned"
                  : "today.dayRest";
          return (
            <View
              key={d}
              accessible
              accessibilityLabel={t(label, { day: letter, date: num })}
              style={{ alignItems: "center", gap: 6 }}
            >
              <AppText size={12} weight="semibold" tone={isToday ? "ink" : "smoke"} center>
                {letter}
              </AppText>
              <View
                style={
                  isToday
                    ? {
                        width: 48,
                        height: 48,
                        margin: -4,
                        borderRadius: 24,
                        borderWidth: 2,
                        borderColor: colors.ink,
                        padding: 2,
                      }
                    : undefined
                }
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: done ? colors.ink : isToday ? colors.volt : "transparent",
                    borderWidth: !done && !isToday && (planned || missed) ? 1.5 : 0,
                    borderColor: missed ? colors.ember : colors.ink,
                  }}
                >
                  {done ? (
                    <Icon icon={Check} size={20} color={colors.volt} strokeWidth={2.6} />
                  ) : (
                    <Num
                      size={19}
                      weight={isToday || planned ? "bold" : "semibold"}
                      tone={isToday || planned ? "ink" : missed ? "ember" : "smoke"}
                      center
                    >
                      {num}
                    </Num>
                  )}
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// The dark hero card
// ---------------------------------------------------------------------------
function HeroCard({
  item,
  isToday,
  onStart,
  onMoveDay,
  moving,
}: {
  item: Upcoming;
  isToday: boolean;
  onStart: () => void;
  onMoveDay: () => void;
  moving: boolean;
}) {
  const { t, i18n } = useTranslation();
  const done = item.status === "completed";

  const preview = useQuery({
    queryKey: ["template-preview", item.template_id],
    enabled: !!item.template_id,
    queryFn: async () => {
      const { data: tes, error } = await supabase
        .from("template_exercises")
        .select("exercise_id, position, target_sets, target_reps, rest_seconds")
        .eq("template_id", item.template_id!)
        .order("position");
      if (error) throw error;
      const ids = tes.map((te) => te.exercise_id);
      const names = new Map<string, string>();
      if (ids.length > 0) {
        const { data } = await supabase.from("exercises").select("id, name").in("id", ids);
        data?.forEach((e) => names.set(e.id, e.name));
      }
      return tes.map((te) => ({ ...te, name: names.get(te.exercise_id) ?? "" }));
    },
  });

  const exercises = preview.data ?? [];
  // Σ sets × (40 s of work + the rest), to the nearest 5 minutes.
  const seconds = exercises.reduce((sum, e) => sum + (e.target_sets ?? 1) * (40 + (e.rest_seconds ?? 60)), 0);
  const minutes = Math.max(5, Math.round(seconds / 60 / 5) * 5);
  const shown = exercises.slice(0, 3);
  const more = exercises.length - shown.length;

  return (
    <View style={{ backgroundColor: colors.ink, borderRadius: 28, padding: 20, gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        <View style={{ flex: 1, gap: 8 }}>
          <AppText size={14} weight="medium" tone="ash">
            {isToday ? t("today.todaysWorkout") : `${t("today.nextWorkout")} · ${shortDate(item.scheduled_date, i18n.language)}`}
          </AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {done ? <Chip kind="done" label={t("today.done")} /> : null}
            <DarkChip icon={item.with_trainer ? Users : User} label={item.with_trainer ? t("today.withTrainer") : t("today.solo")} />
            {item.scheduled_time ? <DarkChip icon={Clock} label={ltr(item.scheduled_time.slice(0, 5))} /> : null}
          </View>
        </View>
        {!item.with_trainer && !done ? (
          <IconButton
            icon={Calendar}
            variant="dark"
            accessibilityLabel={t("today.moveDay")}
            onPress={onMoveDay}
            disabled={moving}
          />
        ) : null}
      </View>

      <View style={{ gap: 6 }}>
        <Display size={46} tone="bone">
          {item.template_name}
        </Display>
        {exercises.length > 0 ? (
          <AppText size={15} tone="ash">
            {t("today.exercisesMinutes", { count: exercises.length, minutes })}
          </AppText>
        ) : null}
      </View>

      {item.notes ? (
        <View style={{ backgroundColor: colors.iron3, borderRadius: 16, padding: 12, flexDirection: "row", gap: 10 }}>
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: colors.volt,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon icon={MessageSquare} size={16} color={colors.ink} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText size={13} tone="ash">
              {t("today.noteFromTrainer")}
            </AppText>
            <AppText size={15} lineHeight={22} tone="bone">
              {`"${item.notes}"`}
            </AppText>
          </View>
        </View>
      ) : null}

      {shown.length > 0 ? (
        <View style={{ gap: 2 }}>
          {shown.map((e) => (
            <View
              key={`${e.exercise_id}-${e.position}`}
              style={{ height: 28, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.volt }} />
                <AppText size={15} tone="bone" numberOfLines={1} style={{ flex: 1 }}>
                  {e.name}
                </AppText>
              </View>
              <Num size={17} weight="semibold" tone="ash">
                {`${e.target_sets ?? 1} × ${e.target_reps ?? "—"}`}
              </Num>
            </View>
          ))}
          {more > 0 ? (
            <View style={{ height: 24, justifyContent: "center", paddingStart: 16 }}>
              <AppText size={14} tone="ash">
                {t("today.moreExercises", { count: more })}
              </AppText>
            </View>
          ) : null}
        </View>
      ) : null}

      {done ? (
        <Button label={t("today.viewWorkout")} variant="dark" size={56} block onPress={onStart} />
      ) : (
        <Button label={t("today.startWorkout")} variant="accent" size={64} icon={FilledPlay} block onPress={onStart} />
      )}
    </View>
  );
}

/** The start icon is a filled triangle in the reference. */
function FilledPlay(props: LucideProps) {
  return <Play {...props} fill={props.color} />;
}

function DarkChip({ icon, label }: { icon: IconComponent; label: string }) {
  return (
    <View
      style={{
        height: 26,
        paddingHorizontal: 10,
        borderRadius: 13,
        backgroundColor: colors.iron3,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
      }}
    >
      <Icon icon={icon} size={14} color={colors.ash} strokeWidth={2.4} />
      <AppText size={13} weight="semibold" lineHeight={17} tone="ash">
        {label}
      </AppText>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Up next
// ---------------------------------------------------------------------------
function UpNextRow({
  item,
  today,
  busy,
  onOpen,
  onEarlier,
  onLater,
}: {
  item: Upcoming;
  today: string;
  busy: boolean;
  onOpen: () => void;
  onEarlier: () => void;
  onLater: () => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, paddingHorizontal: 16, minHeight: 72 }}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        style={({ pressed }) => ({ flex: 1, flexDirection: "row", alignItems: "center", gap: 14, opacity: pressed ? 0.7 : 1 })}
      >
        <View style={{ width: 44, alignItems: "center", gap: 2 }}>
          <AppText size={12} weight="semibold" tone="smoke" center>
            {weekdayLetter(item.scheduled_date, i18n.language)}
          </AppText>
          <Num size={22} weight="semibold" center>
            {shortDate(item.scheduled_date, i18n.language)}
          </Num>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          <AppText size={16} weight="semibold" numberOfLines={1}>
            {item.template_name}
          </AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            <Chip
              kind={item.with_trainer ? "trainer" : "solo"}
              label={item.with_trainer ? t("today.withTrainer") : t("today.solo")}
            />
            {item.scheduled_time ? <Chip kind="neutral" icon={Clock} label={ltr(item.scheduled_time.slice(0, 5))} /> : null}
          </View>
        </View>
      </Pressable>
      {!item.with_trainer ? (
        <View style={{ flexDirection: "row", gap: 6 }}>
          <IconButton
            icon={ChevronLeft}
            mirror
            accessibilityLabel={t("today.dayEarlier")}
            onPress={onEarlier}
            disabled={busy || addDays(item.scheduled_date, -1) < today}
          />
          <IconButton icon={ChevronRight} mirror accessibilityLabel={t("today.dayLater")} onPress={onLater} disabled={busy} />
        </View>
      ) : null}
    </View>
  );
}
