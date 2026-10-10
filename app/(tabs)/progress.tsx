// app/(tabs)/progress.tsx — the client's progress tab (V7; V10 check-in
// merged in as a follow-up so all client self-monitoring lives in one tab).
//
// Weekly check-in first (a 30-second pulse: sleep / energy / soreness /
// adherence + optional note — once per week, week_start is the Sunday of the
// current week per lib/dates.ts weekStartOf), then weigh-in tracking: log a
// weight + optional waist/chest measurements + optional private photo, see a
// weight-over-time chart. Photos go to the private "progress-photos" Storage
// bucket under "<client_id>/..."; we display them via short-lived signed URLs.
//
// D28a: rebuilt to docs/design/screens/client-progress.html — the check-in
// as four rows of 1–5 with end labels; the weigh-in as a ±0.1 stepper
// pre-filled with the last weight (tap the number to type), so the same
// weight again is one tap, with measurements and photo as icon buttons; the
// weight chart (last 10, newest at the start edge) with the change since the
// first of them; "השיאים שלי" (the latest PR per exercise, top 3); badges,
// moved here from Profile, the locked ones saying how far they are.

import { useState } from "react";
import { Image, Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import { decode } from "base64-arraybuffer";
import Activity from "lucide-react-native/icons/activity";
import ArrowDown from "lucide-react-native/icons/arrow-down";
import ArrowUp from "lucide-react-native/icons/arrow-up";
import Calendar from "lucide-react-native/icons/calendar";
import Camera from "lucide-react-native/icons/camera";
import Clock from "lucide-react-native/icons/clock";
import Flame from "lucide-react-native/icons/flame";
import ListChecks from "lucide-react-native/icons/list-checks";
import Minus from "lucide-react-native/icons/minus";
import Moon from "lucide-react-native/icons/moon";
import Plus from "lucide-react-native/icons/plus";
import Ruler from "lucide-react-native/icons/ruler";
import Star from "lucide-react-native/icons/star";
import Trophy from "lucide-react-native/icons/trophy";
import Zap from "lucide-react-native/icons/zap";

import { qk } from "@/lib/queryKeys";
import { clientStreakQuery } from "@/lib/queries";
import { RoleGate } from "@/components/RoleGate";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { addDays, daysBetween, todayISO, toDateString, weekStartOf } from "@/lib/dates";
import { ltr } from "@/lib/i18n";
import { trainerFirstName, useMyTrainer } from "@/lib/useMyTrainer";
import { formatWeight } from "@/lib/workoutSession";
import type { BadgeType } from "@/lib/badges";
import { LineChart } from "@/components/LineChart";
import { monthName } from "@/components/home/format";
import {
  AppText,
  Button,
  Card,
  Chip,
  colors,
  Display,
  Divider,
  fonts,
  Icon,
  IconButton,
  Input,
  Num,
  parseTypedNumber,
  Sheet,
  type IconComponent,
} from "@/components/ui";

const CHECKIN_FIELDS: { key: "sleep" | "energy" | "soreness" | "adherence"; icon: IconComponent }[] = [
  { key: "sleep", icon: Moon },
  { key: "energy", icon: Zap },
  { key: "soreness", icon: Activity },
  { key: "adherence", icon: ListChecks },
];
type CheckinFieldKey = (typeof CHECKIN_FIELDS)[number]["key"];

const CHART_POINTS = 10;
const WEIGHT_STEP = 0.1;
/** Where the stepper starts when there's no weigh-in yet. */
const FIRST_WEIGHT = 70;
const BADGES: { type: BadgeType; icon: IconComponent }[] = [
  { type: "first_workout", icon: Star },
  { type: "first_month", icon: Calendar },
  { type: "streak_10", icon: Flame },
];

/** A new photo's path in the private bucket (called when saving, not in render). */
function newPhotoPath(clientId: string): string {
  return `${clientId}/${Date.now()}.jpg`;
}

/** "2026-09-27" → "27.9" */
const dm = (iso: string) => `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}`;

export default function ProgressScreen() {
  return (
    <RoleGate role="client">
      <ProgressScreenBody />
    </RoleGate>
  );
}

function ProgressScreenBody() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const clientId = session!.user.id;
  const today = todayISO();
  const thisWeek = weekStartOf(today);
  const trainerName = trainerFirstName(useMyTrainer().data);

  const [checkin, setCheckin] = useState<Record<CheckinFieldKey, number>>({
    sleep: 3,
    energy: 3,
    soreness: 3,
    adherence: 3,
  });
  const [checkinNote, setCheckinNote] = useState("");

  // null = untouched: the stepper shows the last weight.
  const [weightDraft, setWeightDraft] = useState<number | null>(null);
  const [typing, setTyping] = useState<string | null>(null);
  const [waist, setWaist] = useState("");
  const [chest, setChest] = useState("");
  const [measuring, setMeasuring] = useState(false);
  const [photo, setPhoto] = useState<{ uri: string; base64: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  const checkins = useQuery({
    queryKey: qk.checkIns.own(clientId),
    queryFn: async () => {
      const { data, error: e } = await supabase
        .from("check_ins")
        .select("*")
        .eq("client_id", clientId)
        .order("week_start", { ascending: false })
        .limit(12);
      if (e) throw e;
      return data;
    },
  });

  const submitCheckin = useMutation({
    mutationFn: async () => {
      const { error: e } = await supabase.from("check_ins").insert({
        client_id: clientId,
        week_start: thisWeek,
        ...checkin,
        note: checkinNote.trim() === "" ? null : checkinNote.trim(),
      });
      if (e) throw e;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.checkIns.all }),
  });

  const progress = useQuery({
    queryKey: qk.progress.own(clientId),
    queryFn: async () => {
      const { data: entries, error: e } = await supabase
        .from("progress_entries")
        .select("*")
        .eq("client_id", clientId)
        .order("date", { ascending: true });
      if (e) throw e;
      // Signed URLs for any photos.
      const paths = entries.map((x) => x.photo_url).filter(Boolean) as string[];
      const signed = new Map<string, string>();
      if (paths.length > 0) {
        const { data: urls } = await supabase.storage.from("progress-photos").createSignedUrls(paths, 3600);
        urls?.forEach((u) => {
          if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
        });
      }
      return { entries, signed };
    },
  });

  // The latest PR per exercise, newest first.
  const prs = useQuery({
    queryKey: qk.progress.prs(clientId),
    queryFn: async () => {
      const { data, error: e } = await supabase
        .from("set_logs")
        .select("exercise_id, weight, reps, workout_logs!inner(client_id, completed_at)")
        .eq("is_pr", true)
        .eq("workout_logs.client_id", clientId);
      if (e) throw e;
      const rows = data
        .map((r) => ({
          exerciseId: r.exercise_id,
          weight: r.weight,
          reps: r.reps,
          at: (r.workout_logs as unknown as { completed_at: string }).completed_at,
        }))
        .sort((a, b) => b.at.localeCompare(a.at));
      const latest = rows.filter((r, i) => rows.findIndex((x) => x.exerciseId === r.exerciseId) === i).slice(0, 3);
      const names = new Map<string, string>();
      if (latest.length > 0) {
        const { data: exs } = await supabase
          .from("exercises")
          .select("id, name")
          .in("id", latest.map((r) => r.exerciseId));
        exs?.forEach((x) => names.set(x.id, x.name));
      }
      return latest.map((r) => ({ ...r, name: names.get(r.exerciseId) ?? "—" }));
    },
  });

  const badges = useQuery({
    queryKey: qk.badges.own(clientId),
    queryFn: async () => {
      const { data, error: e } = await supabase
        .from("badges")
        .select("type, earned_at")
        .eq("client_id", clientId)
        .order("earned_at", { ascending: true });
      if (e) throw e;
      return data;
    },
  });
  const streak = useQuery(clientStreakQuery(clientId));
  const firstWorkout = useQuery({
    queryKey: qk.badges.firstWorkout(clientId),
    queryFn: async () => {
      const { data, error: e } = await supabase
        .from("workout_logs")
        .select("completed_at")
        .eq("client_id", clientId)
        .order("completed_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (e) throw e;
      return data?.completed_at ?? null;
    },
  });

  const entries = progress.data?.entries ?? [];
  const weighed = entries.filter((e) => e.weight != null);
  const last = weighed[weighed.length - 1];
  const lastWeight = last ? Number(last.weight) : null;
  const shownWeight = weightDraft ?? lastWeight;
  const chart = weighed.slice(-CHART_POINTS).map((e) => ({ label: dm(e.date), value: Number(e.weight) }));
  const delta = chart.length > 1 ? Math.round((chart[chart.length - 1].value - chart[0].value) * 10) / 10 : null;
  const firstShown = weighed.slice(-CHART_POINTS)[0];
  const photos = entries.filter((e) => e.photo_url && progress.data?.signed.get(e.photo_url)).slice(-8).reverse();

  function stepWeight(dir: 1 | -1) {
    setTyping(null);
    const base = shownWeight ?? FIRST_WEIGHT - dir * WEIGHT_STEP;
    setWeightDraft(Math.max(0, Math.round((base + dir * WEIGHT_STEP) * 10) / 10));
  }

  async function pickPhoto() {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError(t("progress.photoPermission"));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.5, base64: true });
    if (!res.canceled && res.assets[0]?.base64) setPhoto({ uri: res.assets[0].uri, base64: res.assets[0].base64 });
  }

  const addEntry = useMutation({
    mutationFn: async () => {
      let photoPath: string | null = null;
      if (photo) {
        const path = newPhotoPath(clientId);
        const { error: upErr } = await supabase.storage
          .from("progress-photos")
          .upload(path, decode(photo.base64), { contentType: "image/jpeg" });
        if (upErr) throw upErr;
        photoPath = path;
      }
      const measurements: Record<string, number> = {};
      const w = parseTypedNumber(waist);
      const c = parseTypedNumber(chest);
      if (w != null) measurements.waist = w;
      if (c != null) measurements.chest = c;
      const { error: insErr } = await supabase.from("progress_entries").insert({
        client_id: clientId,
        date: today,
        weight: shownWeight,
        measurements: Object.keys(measurements).length > 0 ? measurements : null,
        photo_url: photoPath,
      });
      if (insErr) throw insErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.progress.all });
      setWeightDraft(null);
      setTyping(null);
      setWaist("");
      setChest("");
      setPhoto(null);
    },
  });

  function save() {
    if (shownWeight == null && !photo && parseTypedNumber(waist) == null && parseTypedNumber(chest) == null) {
      setError(t("progress.addSomethingFirst"));
      return;
    }
    setError(null);
    addEntry.mutate();
  }

  const current = checkins.data?.find((c) => c.week_start === thisWeek) ?? null;
  const values = current ?? checkin;
  const measured = parseTypedNumber(waist) != null || parseTypedNumber(chest) != null;
  const earned = new Map((badges.data ?? []).map((b) => [b.type as BadgeType, b.earned_at]));

  function badgeLeft(type: BadgeType): string {
    if (type === "streak_10") return t("progress.badgeLeft.workouts", { count: Math.max(1, 10 - (streak.data ?? 0)) });
    if (type === "first_workout") return t("progress.badgeLeft.workouts", { count: 1 });
    // first_month: 30 days after the first workout.
    if (!firstWorkout.data) return t("progress.badgeLeft.afterFirst");
    const days = 30 - daysBetween(today, toDateString(new Date(firstWorkout.data)));
    return t("progress.badgeLeft.days", { count: Math.max(1, days) });
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.chalk }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 30, gap: 20 }}
    >
      <Display size={44}>{t("progress.title")}</Display>

      {/* Weekly check-in */}
      <Card style={{ padding: 16, gap: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText size={18} weight="semibold" lineHeight={23}>
              {t("checkin.title")}
            </AppText>
            <AppText size={13} tone="smoke">
              {t("checkin.week", { range: ltr(`${dm(thisWeek)}–${dm(addDays(thisWeek, 6))}`) })}
            </AppText>
          </View>
          {current ? (
            <Chip kind="done" label={t("checkin.sent")} />
          ) : (
            <Chip kind="neutral" icon={Clock} label={t("checkin.notSent")} />
          )}
        </View>

        {CHECKIN_FIELDS.map((f) => (
          <View key={f.key} style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Icon icon={f.icon} size={18} />
                <AppText size={15} weight="semibold">
                  {t(`checkin.fields.${f.key}`)}
                </AppText>
              </View>
              <AppText size={12} tone="smoke">
                {t(`checkin.ends.${f.key}`)}
              </AppText>
            </View>
            <View accessibilityRole="radiogroup" accessibilityLabel={t(`checkin.fields.${f.key}`)} style={{ flexDirection: "row", gap: 6 }}>
              {[1, 2, 3, 4, 5].map((n) => {
                const on = values[f.key] === n;
                return (
                  <Pressable
                    key={n}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on, disabled: !!current }}
                    accessibilityLabel={t("checkin.scoreOf", { field: t(`checkin.fields.${f.key}`), n })}
                    disabled={!!current}
                    onPress={() => setCheckin((prev) => ({ ...prev, [f.key]: n }))}
                    style={({ pressed }) => ({
                      flex: 1,
                      height: 44,
                      borderRadius: 12,
                      backgroundColor: on ? colors.ink : colors.mist,
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: pressed ? 0.8 : current && !on ? 0.6 : 1,
                    })}
                  >
                    <Num size={20} weight="semibold" tone={on ? "white" : "ink"} center>
                      {n}
                    </Num>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

        {current ? (
          current.note ? (
            <AppText size={14} tone="graphite">{`"${current.note}"`}</AppText>
          ) : null
        ) : (
          <>
            <Input
              size="md"
              value={checkinNote}
              onChangeText={setCheckinNote}
              placeholder={trainerName ? t("checkin.notePlaceholderName", { name: trainerName }) : t("checkin.notePlaceholder")}
              accessibilityLabel={t("checkin.noteLabel")}
            />
            {submitCheckin.error ? (
              <AppText size={14} tone="ember">
                {(submitCheckin.error as Error).message}
              </AppText>
            ) : null}
            <Button label={t("checkin.send")} size={52} block loading={submitCheckin.isPending} onPress={() => submitCheckin.mutate()} />
          </>
        )}
      </Card>

      {/* Weigh-in */}
      <Card style={{ padding: 14, gap: 16 }}>
        <View style={{ gap: 2 }}>
          <AppText size={18} weight="semibold" lineHeight={23}>
            {t("progress.weighIn")}
          </AppText>
          <AppText size={13} tone="smoke">
            {last
              ? t("progress.lastTime", { weight: ltr(formatWeight(Number(last.weight))), date: dm(last.date) })
              : t("progress.firstWeighIn")}
          </AppText>
        </View>
        <View
          accessibilityRole="adjustable"
          accessibilityLabel={t("progress.weightToday")}
          style={{
            height: 72,
            paddingHorizontal: 12,
            borderRadius: 18,
            backgroundColor: colors.chalk,
            borderWidth: typing != null ? 2 : 0,
            borderColor: colors.ink,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <StepButton icon={Minus} label={t("progress.down")} onPress={() => stepWeight(-1)} />
          {typing != null ? (
            <TextInput
              value={typing}
              onChangeText={(v) => {
                setTyping(v);
                const n = parseTypedNumber(v);
                if (n != null) setWeightDraft(Math.round(n * 10) / 10);
              }}
              onBlur={() => setTyping(null)}
              autoFocus
              selectTextOnFocus
              keyboardType="decimal-pad"
              returnKeyType="done"
              maxLength={5}
              selectionColor={colors.ink}
              style={{
                flex: 1,
                minWidth: 0,
                paddingVertical: 0,
                fontFamily: fonts.numBold,
                fontSize: 44,
                color: colors.ink,
                textAlign: "center",
                writingDirection: "ltr",
              }}
            />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityHint={t("workout.mode.tapToType")}
              onPress={() => setTyping(shownWeight != null ? formatWeight(shownWeight) : "")}
              style={{ flex: 1, flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 6 }}
            >
              <Num size={44}>{shownWeight != null ? formatWeight(shownWeight) : "—"}</Num>
              <AppText size={15} weight="medium" tone="graphite">
                {t("progress.kg")}
              </AppText>
            </Pressable>
          )}
          <StepButton icon={Plus} label={t("progress.up")} onPress={() => stepWeight(1)} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button label={t("progress.save")} size={52} block loading={addEntry.isPending} onPress={save} />
          </View>
          <SquareButton icon={Ruler} label={t("progress.measurements")} on={measured} onPress={() => setMeasuring(true)} />
          <SquareButton icon={Camera} label={t("progress.photo")} on={!!photo} onPress={pickPhoto} />
        </View>
        {photo ? <Image source={{ uri: photo.uri }} style={{ width: 56, height: 56, borderRadius: 12 }} /> : null}
        {error || addEntry.error ? (
          <AppText size={14} tone="ember">
            {error ?? (addEntry.error as Error).message}
          </AppText>
        ) : null}
      </Card>

      {/* Weight chart */}
      <Card style={{ padding: 12, gap: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText size={18} weight="semibold" lineHeight={23}>
              {t("progress.weightTitle")}
            </AppText>
            <AppText size={13} tone="smoke">
              {t("progress.lastN", { count: Math.min(CHART_POINTS, weighed.length) })}
            </AppText>
          </View>
          {lastWeight != null ? (
            <View style={{ alignItems: "flex-end", gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Num size={30}>{formatWeight(lastWeight)}</Num>
                <AppText size={14} tone="graphite">
                  {t("progress.kg")}
                </AppText>
              </View>
              {delta != null && delta !== 0 && firstShown ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                  <Icon icon={delta < 0 ? ArrowDown : ArrowUp} size={14} color={delta < 0 ? colors.voltInk : colors.graphite} />
                  <AppText size={13} weight="semibold" tone={delta < 0 ? "voltInk" : "graphite"}>
                    {t("progress.deltaSince", {
                      delta: ltr(formatWeight(Math.abs(delta))),
                      month: monthName(firstShown.date, i18n.language),
                    })}
                  </AppText>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
        <LineChart data={chart} />
        {photos.length > 0 ? (
          <>
            <Divider inset={0} />
            <AppText size={14} weight="semibold" tone="graphite">
              {t("progress.photos")}
            </AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {photos.map((e) => {
                const url = progress.data!.signed.get(e.photo_url!)!;
                return (
                  <Pressable key={e.id} accessibilityRole="imagebutton" onPress={() => setViewing(url)}>
                    <Image source={{ uri: url }} style={{ width: 64, height: 64, borderRadius: 12 }} />
                    <AppText size={11} tone="smoke" center>
                      {dm(e.date)}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        ) : null}
      </Card>

      {/* PRs */}
      <Card style={{ padding: 8, gap: 16 }}>
        <View style={{ minHeight: 32, justifyContent: "center", paddingHorizontal: 4 }}>
          <AppText size={18} weight="semibold" lineHeight={23}>
            {t("progress.prsTitle")}
          </AppText>
        </View>
        {prs.data && prs.data.length > 0 ? (
          prs.data.map((p, i) => (
            <View key={p.exerciseId}>
              {i > 0 ? <Divider inset={0} /> : null}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingHorizontal: 4 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.volt, alignItems: "center", justifyContent: "center" }}>
                  <Icon icon={Trophy} size={18} />
                </View>
                <View style={{ flex: 1, gap: 1 }}>
                  <AppText size={15} weight="semibold" numberOfLines={1}>
                    {p.name}
                  </AppText>
                  <AppText size={13} tone="smoke">
                    {dm(toDateString(new Date(p.at)))}
                  </AppText>
                </View>
                <Num size={22} weight="semibold">
                  {p.weight != null ? `${formatWeight(p.weight)} × ${p.reps ?? "—"}` : `${p.reps ?? "—"}`}
                </Num>
              </View>
            </View>
          ))
        ) : prs.isSuccess ? (
          <AppText size={14} tone="graphite" style={{ paddingHorizontal: 4, paddingBottom: 8 }}>
            {t("progress.noPrs")}
          </AppText>
        ) : null}
      </Card>

      {/* Badges */}
      <Card style={{ padding: 14, gap: 16 }}>
        <AppText size={18} weight="semibold" lineHeight={23}>
          {t("progress.badgesTitle")}
        </AppText>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          {BADGES.map((b) => {
            const at = earned.get(b.type);
            return (
              <View key={b.type} style={{ flex: 1, alignItems: "center", gap: 6 }}>
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 18,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: at ? colors.ink : "transparent",
                    borderWidth: at ? 0 : 1.5,
                    borderStyle: "dashed",
                    borderColor: "#A9A69C",
                  }}
                >
                  <Icon icon={b.icon} size={26} color={at ? colors.volt : colors.smoke} />
                </View>
                <AppText size={14} weight="semibold" center>
                  {t(`progress.badge.${b.type}`)}
                </AppText>
                <AppText size={12} tone="smoke" center>
                  {at ? dm(toDateString(new Date(at))) : badgeLeft(b.type)}
                </AppText>
              </View>
            );
          })}
        </View>
      </Card>

      <Sheet visible={measuring} onClose={() => setMeasuring(false)} closeLabel={t("common.cancel")} title={t("progress.measurementsTitle")}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1, gap: 8 }}>
            <AppText size={14} weight="semibold" tone="graphite">
              {t("progress.waist")}
            </AppText>
            <Input size="md" ltr="start" suffix={t("progress.cm")} value={waist} onChangeText={setWaist} keyboardType="decimal-pad" maxLength={5} />
          </View>
          <View style={{ flex: 1, gap: 8 }}>
            <AppText size={14} weight="semibold" tone="graphite">
              {t("progress.chest")}
            </AppText>
            <Input size="md" ltr="start" suffix={t("progress.cm")} value={chest} onChangeText={setChest} keyboardType="decimal-pad" maxLength={5} />
          </View>
        </View>
        <AppText size={13} tone="graphite">
          {t("progress.measurementsHint")}
        </AppText>
        <Button label={t("progress.done")} size={52} block onPress={() => setMeasuring(false)} />
      </Sheet>

      <Modal visible={viewing != null} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.cancel")}
          onPress={() => setViewing(null)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.9)", alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          {viewing ? (
            <Image source={{ uri: viewing }} style={{ width: "100%", aspectRatio: 1, borderRadius: 16 }} resizeMode="contain" />
          ) : null}
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

function StepButton({ icon, label, onPress }: { icon: IconComponent; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 48,
        height: 48,
        borderRadius: 14,
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.lineStrong,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Icon icon={icon} size={22} />
    </Pressable>
  );
}

function SquareButton({ icon, label, on, onPress }: { icon: IconComponent; label: string; on: boolean; onPress: () => void }) {
  return (
    <IconButton
      icon={icon}
      accessibilityLabel={label}
      variant={on ? "primary" : "paper"}
      size={48}
      shape="square"
      onPress={onPress}
    />
  );
}
