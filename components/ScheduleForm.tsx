// components/ScheduleForm.tsx — shared body for creating/editing a scheduled
// workout. Used by schedule/new.tsx and schedule/[id].tsx.
//
// Designed to be FAST and forgiving (the trainer is often in a hurry):
//   - Client: pick one from the roster OR type a one-off name (which the screen
//     turns into an offline client). One of the two is required.
//   - Template: optional — "אימון חופשי" schedules without one.
//   - Time: optional ("כל שעה").
// It returns a clean payload; the screen does the DB work.
//
// D24b: rebuilt to docs/design/screens/trainer-new-session.html — client
// avatars (+ "אחר"), עם המאמן | עצמאי, template radio rows with exercise
// counts, date chips (+ "תאריך אחר"), time chips with the trainer's booked
// times crossed out, weekday toggles + 4 weeks / 8 weeks / 3 months, note
// chips + text, and a sticky footer with the summary and "קביעת N אימונים".
// N comes from lib/schedule.ts expandScheduleDates(), the same rule
// schedule/new.tsx inserts with, so the button never promises a different count.
// Props and payload are unchanged.

import { useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Calendar from "lucide-react-native/icons/calendar";
import CalendarPlus from "lucide-react-native/icons/calendar-plus";
import Check from "lucide-react-native/icons/check";
import Plus from "lucide-react-native/icons/plus";
import User from "lucide-react-native/icons/user";
import Users from "lucide-react-native/icons/users";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { addDays, todayISO } from "@/lib/dates";
import { expandScheduleDates } from "@/lib/schedule";
import type { RosterClient } from "@/lib/useRoster";
import { DateChips } from "@/components/DateChips";
import { TimeChips } from "@/components/TimeChips";
import { firstName, shortDate, weekdayLetter } from "@/components/home/format";
import {
  AppText,
  Avatar,
  Button,
  colors,
  Icon,
  Input,
  ListCard,
  Segmented,
  SelectChip,
} from "@/components/ui";

type ClientRef = { kind: "app" | "managed"; refId: string };

export type ClientChoice =
  | { mode: "existing"; kind: "app" | "managed"; refId: string }
  | { mode: "new"; name: string };

export type SchedulePayload = {
  client: ClientChoice;
  templateId: string | null;
  date: string;
  time: string | null;
  note: string | null;
  // true = a fixed session with the trainer (client can't move it);
  // false = a solo workout the client can shift.
  withTrainer: boolean;
  // When set, repeat on these weekdays (0=Sun..6=Sat) for `count` weeks/months
  // from `date`.
  repeat?: { days: number[]; count: number; unit: "weeks" | "months" };
};

export type ScheduleFormInitial = {
  client?: ClientRef;
  templateId?: string | null;
  date?: string;
  time?: string | null;
  note?: string | null;
  withTrainer?: boolean;
};

const WEEKDAY_KEYS = [
  "schedule.form.weekday.sun",
  "schedule.form.weekday.mon",
  "schedule.form.weekday.tue",
  "schedule.form.weekday.wed",
  "schedule.form.weekday.thu",
  "schedule.form.weekday.fri",
  "schedule.form.weekday.sat",
];

const DURATIONS = {
  w4: { count: 4, unit: "weeks" },
  w8: { count: 8, unit: "weeks" },
  m3: { count: 3, unit: "months" },
} as const;
type Duration = keyof typeof DURATIONS;

const NOTE_CHIPS = ["noteLight", "noteTechnique", "noteWarmup"] as const;


export function ScheduleForm({
  roster,
  templates,
  loadingRoster,
  loadingTemplates,
  initial,
  submitLabel,
  submitting,
  errorMessage,
  onSubmit,
  footer,
  allowRepeat,
}: {
  roster: RosterClient[];
  templates: { id: string; name: string }[];
  loadingRoster: boolean;
  loadingTemplates: boolean;
  initial?: ScheduleFormInitial;
  submitLabel: string;
  submitting: boolean;
  errorMessage?: string | null;
  onSubmit: (payload: SchedulePayload) => void;
  footer?: ReactNode;
  allowRepeat?: boolean; // show the "repeat weekly" option (creating, not editing)
}) {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const lang = i18n.language;
  const today = todayISO();

  const [selected, setSelected] = useState<ClientRef | null>(initial?.client ?? null);
  const [showNewName, setShowNewName] = useState(false);
  const [newName, setNewName] = useState("");
  const [templateId, setTemplateId] = useState<string | null>(initial?.templateId ?? null);
  const [date, setDate] = useState(initial?.date ?? addDays(today, 1));
  const [time, setTime] = useState<string | null>(initial?.time ? initial.time.slice(0, 5) : null);
  const [noteChips, setNoteChips] = useState<string[]>([]);
  const [note, setNote] = useState(initial?.note ?? "");
  const [withTrainer, setWithTrainer] = useState(initial?.withTrainer ?? true);
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [duration, setDuration] = useState<Duration>("w4");
  const [validationError, setValidationError] = useState<string | null>(null);

  const quickDates = [0, 1, 2, 3].map((i) => addDays(today, i));
  const [showOtherDate, setShowOtherDate] = useState(!quickDates.includes(date));

  // The trainer's sessions on the chosen day, for "תפוס" (under
  // "scheduled-trainer", so every schedule change refreshes it).
  const busy = useQuery({
    queryKey: ["scheduled-trainer", "day", date],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scheduled_workouts")
        .select("scheduled_time")
        .eq("trainer_id", session!.user.id)
        .eq("scheduled_date", date)
        .not("scheduled_time", "is", null);
      if (error) throw error;
      return data.map((r) => (r.scheduled_time as string).slice(0, 5));
    },
  });
  // Editing: the session's own time isn't "booked" against itself.
  const ownTime = initial?.date === date && initial?.time ? initial.time.slice(0, 5) : null;
  const busyTimes = (busy.data ?? []).filter((x) => x !== ownTime);

  const counts = useQuery({
    queryKey: ["templates", "exercise-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("template_exercises").select("template_id");
      if (error) throw error;
      const m = new Map<string, number>();
      data.forEach((r) => m.set(r.template_id, (m.get(r.template_id) ?? 0) + 1));
      return m;
    },
  });

  const usingNewName = showNewName && newName.trim().length > 0;
  const repeat =
    allowRepeat && repeatDays.length > 0
      ? { days: [...repeatDays].sort((a, b) => a - b), ...DURATIONS[duration] }
      : undefined;
  const dates = expandScheduleDates(date, repeat);

  function handleSubmit() {
    let client: ClientChoice | null = null;
    if (usingNewName) client = { mode: "new", name: newName.trim() };
    else if (selected) client = { mode: "existing", kind: selected.kind, refId: selected.refId };
    if (!client) {
      setValidationError(t("schedule.form.pickClientError"));
      return;
    }
    setValidationError(null);
    const fullNote = [...noteChips.map((k) => t(`sessionForm.${k}`)), note.trim()].filter(Boolean).join(" · ");
    onSubmit({
      client,
      templateId,
      date,
      time,
      note: fullNote.length > 0 ? fullNote : null,
      withTrainer,
      repeat,
    });
  }

  // "16 אימונים · ימי א׳ וה׳ ב-09:30 · עד 22.11" / "ו׳ 2.10 · 09:30"
  const dayNames = (repeat?.days ?? []).map((d) => t(WEEKDAY_KEYS[d]));
  const joinedDays =
    dayNames.length > 1
      ? `${dayNames.slice(0, -1).join(", ")}${t("sessionForm.and")}${dayNames[dayNames.length - 1]}`
      : dayNames[0];
  const summary = repeat
    ? [
        t("sessionForm.sessions", { count: dates.length }),
        [t("sessionForm.onDays", { days: joinedDays }), time ? t("sessionForm.at", { time }) : null]
          .filter(Boolean)
          .join(" "),
        t("sessionForm.until", { date: shortDate(dates[dates.length - 1], lang) }),
      ].join(" · ")
    : [`${weekdayLetter(date, lang)} ${shortDate(date, lang)}`, time].filter(Boolean).join(" · ");

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.chalk }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 24, gap: 22 }}
      >
        {/* Client */}
        <Section title={t("sessionForm.client")}>
          {loadingRoster ? null : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 6, paddingTop: 4 }}
            >
              {roster.map((c) => {
                const on = !usingNewName && selected?.kind === c.kind && selected?.refId === c.refId;
                return (
                  <Pressable
                    key={`${c.kind}-${c.refId}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={c.name}
                    onPress={() => {
                      setSelected({ kind: c.kind, refId: c.refId });
                      setShowNewName(false);
                      setNewName("");
                    }}
                    style={{ width: 62, alignItems: "center", gap: 6 }}
                  >
                    <View>
                      <Avatar id={c.refId} name={c.name} size={52} />
                      {on ? (
                        <View
                          style={{
                            position: "absolute",
                            top: -2,
                            end: -2,
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                            backgroundColor: colors.volt,
                            borderWidth: 2,
                            borderColor: colors.chalk,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Icon icon={Check} size={12} strokeWidth={3} />
                        </View>
                      ) : null}
                    </View>
                    <AppText size={13} weight={on ? "semibold" : "medium"} center numberOfLines={1}>
                      {firstName(c.name)}
                    </AppText>
                  </Pressable>
                );
              })}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: showNewName }}
                onPress={() => {
                  setShowNewName(true);
                  setSelected(null);
                }}
                style={{ width: 62, alignItems: "center", gap: 6 }}
              >
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 26,
                    borderWidth: 1.5,
                    borderStyle: "dashed",
                    borderColor: showNewName ? colors.ink : colors.ash,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon icon={Plus} size={22} color={colors.graphite} />
                </View>
                <AppText size={13} weight="medium" tone="graphite" center>
                  {t("sessionForm.other")}
                </AppText>
              </Pressable>
            </ScrollView>
          )}
          {showNewName ? (
            <View style={{ paddingHorizontal: 20 }}>
              <Input
                size="md"
                value={newName}
                onChangeText={setNewName}
                placeholder={t("sessionForm.oneOffPlaceholder")}
                autoCapitalize="words"
                autoFocus
                editable={!submitting}
                accessibilityLabel={t("sessionForm.oneOffPlaceholder")}
              />
            </View>
          ) : null}
        </Section>

        {/* Type */}
        <Section title={t("sessionForm.type")}>
          <View style={{ paddingHorizontal: 20, gap: 10 }}>
            <Segmented
              size="lg"
              value={withTrainer ? "with" : "solo"}
              onChange={(v) => setWithTrainer(v === "with")}
              options={[
                { value: "with", label: t("sessionForm.withTrainer"), icon: Users },
                { value: "solo", label: t("sessionForm.solo"), icon: User },
              ]}
            />
            <AppText size={13} tone="graphite">
              {withTrainer ? t("sessionForm.withTrainerHint") : t("sessionForm.soloHint")}
            </AppText>
          </View>
        </Section>

        {/* Workout */}
        <Section title={t("sessionForm.workout")}>
          <View style={{ paddingHorizontal: 20 }}>
            {loadingTemplates ? null : (
              <ListCard inset={16}>
                {[...templates.map((tpl) => ({ id: tpl.id as string | null, name: tpl.name })), { id: null, name: "" }].map(
                  (row) => {
                    const on = templateId === row.id;
                    const count = row.id ? counts.data?.get(row.id) ?? 0 : null;
                    return (
                      <Pressable
                        key={row.id ?? "free"}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: on }}
                        onPress={() => setTemplateId(row.id)}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 12,
                          minHeight: 56,
                          paddingHorizontal: 16,
                          backgroundColor: on ? colors.chalk : undefined,
                        }}
                      >
                        <View
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                            borderWidth: on ? 7 : 2,
                            borderColor: on ? colors.ink : colors.ash,
                          }}
                        />
                        <AppText size={16} weight={on ? "semibold" : "medium"} style={{ flex: 1 }} numberOfLines={1}>
                          {row.id ? row.name : t("sessionForm.free")}
                        </AppText>
                        <AppText size={13} tone="graphite">
                          {row.id ? t("sessionForm.exercises", { count: count ?? 0 }) : t("sessionForm.noTemplate")}
                        </AppText>
                      </Pressable>
                    );
                  },
                )}
              </ListCard>
            )}
          </View>
        </Section>

        {/* When */}
        <Section title={t("sessionForm.when")}>
          <View style={{ paddingHorizontal: 20, gap: 12 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {quickDates.map((d, i) => (
                <SelectChip
                  key={d}
                  label={
                    i === 0
                      ? t("sessionForm.today", { date: shortDate(d, lang) })
                      : i === 1
                        ? t("sessionForm.tomorrow", { date: shortDate(d, lang) })
                        : `${weekdayLetter(d, lang)} ${shortDate(d, lang)}`
                  }
                  selected={date === d && !showOtherDate}
                  onPress={() => {
                    setDate(d);
                    setShowOtherDate(false);
                  }}
                />
              ))}
              <SelectChip
                label={t("sessionForm.otherDate")}
                icon={Calendar}
                selected={showOtherDate}
                onPress={() => setShowOtherDate((v) => !v)}
              />
            </View>
            {showOtherDate ? <DateChips value={date} onChange={setDate} /> : null}
            <TimeChips value={time} onChange={setTime} busy={busyTimes} />
          </View>
        </Section>

        {/* Repeats weekly (create only) */}
        {allowRepeat ? (
          <Section title={t("sessionForm.repeat")}>
            <View style={{ paddingHorizontal: 20, gap: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                {WEEKDAY_KEYS.map((key, i) => {
                  const on = repeatDays.includes(i);
                  return (
                    <Pressable
                      key={key}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => setRepeatDays((prev) => (on ? prev.filter((d) => d !== i) : [...prev, i]))}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        borderWidth: on ? 0 : 1,
                        borderColor: colors.lineStrong,
                        backgroundColor: on ? colors.ink : colors.paper,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <AppText size={15} weight="semibold" tone={on ? "white" : "ink"} center>
                        {t(key)}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
              <Segmented
                value={duration}
                onChange={setDuration}
                options={[
                  { value: "w4", label: t("sessionForm.weeks4") },
                  { value: "w8", label: t("sessionForm.weeks8") },
                  { value: "m3", label: t("sessionForm.months3") },
                ]}
              />
            </View>
          </Section>
        ) : null}

        {/* Note */}
        <Section title={t("sessionForm.note")}>
          <View style={{ paddingHorizontal: 20, gap: 8 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {NOTE_CHIPS.map((k) => {
                const on = noteChips.includes(k);
                return (
                  <SelectChip
                    key={k}
                    label={t(`sessionForm.${k}`)}
                    selected={on}
                    onPress={() => setNoteChips((prev) => (on ? prev.filter((x) => x !== k) : [...prev, k]))}
                  />
                );
              })}
            </View>
            <Input
              size="md"
              value={note}
              onChangeText={setNote}
              placeholder={t("sessionForm.notePlaceholder")}
              editable={!submitting}
              accessibilityLabel={t("sessionForm.note")}
            />
            <AppText size={13} tone="graphite">
              {t("sessionForm.noteHint")}
            </AppText>
          </View>
        </Section>

        {footer ? <View style={{ paddingHorizontal: 20 }}>{footer}</View> : null}
      </ScrollView>

      {/* Sticky footer: the summary + the one button */}
      <View
        style={{
          backgroundColor: colors.paper,
          borderTopWidth: 1,
          borderTopColor: colors.line,
          paddingTop: 14,
          paddingHorizontal: 20,
          paddingBottom: Math.max(insets.bottom, 16) + 8,
          gap: 10,
        }}
      >
        {validationError || errorMessage ? (
          <AppText size={14} tone="ember" center>
            {validationError ?? errorMessage}
          </AppText>
        ) : (
          <AppText size={14} tone="graphite" center numberOfLines={2}>
            {summary}
          </AppText>
        )}
        <Button
          label={repeat ? t("sessionForm.submitMany", { count: dates.length }) : submitLabel}
          icon={CalendarPlus}
          size={56}
          block
          loading={submitting}
          onPress={handleSubmit}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <View style={{ paddingHorizontal: 20 }}>
        <AppText size={15} weight="semibold" tone="graphite">
          {title}
        </AppText>
      </View>
      {children}
    </View>
  );
}
