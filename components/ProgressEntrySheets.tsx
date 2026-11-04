// components/ProgressEntrySheets.tsx — V17: the trainer records an offline
// (managed) client's weigh-in and weekly check-in from the client card.
//
// 0032 lets a trainer write progress_entries and check_ins rows for their own
// managed clients, and photos under "<managed_client_id>/" in the private
// progress-photos bucket. App clients record their own (Progress tab), so
// these sheets are only offered for managed clients.
//
// Same rules as the client's Progress tab (app/(tabs)/progress.tsx): a ±0.1 kg
// stepper pre-filled with the last weight (tap the number to type), optional
// waist / chest and a photo; the check-in is four 1–5 rows and a note, one
// per week (week_start = the Sunday, lib/dates.ts weekStartOf). Unlike the
// client, the trainer can correct this week's check-in after saving it.

import { useState } from "react";
import { Image, Pressable, TextInput, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import { decode } from "base64-arraybuffer";
import Activity from "lucide-react-native/icons/activity";
import Camera from "lucide-react-native/icons/camera";
import ListChecks from "lucide-react-native/icons/list-checks";
import Minus from "lucide-react-native/icons/minus";
import Moon from "lucide-react-native/icons/moon";
import Plus from "lucide-react-native/icons/plus";
import Zap from "lucide-react-native/icons/zap";

import { qk } from "@/lib/queryKeys";
import { supabase } from "@/lib/supabase";
import { todayISO, weekStartOf } from "@/lib/dates";
import { ltr } from "@/lib/i18n";
import { formatWeight } from "@/lib/workoutSession";
import type { Database } from "@/lib/database.types";
import { shortDate } from "@/components/home/format";
import {
  AppText,
  Button,
  colors,
  fonts,
  Icon,
  Input,
  Num,
  parseTypedNumber,
  Sheet,
  type IconComponent,
} from "@/components/ui";

type CheckIn = Database["public"]["Tables"]["check_ins"]["Row"];
type FieldKey = "sleep" | "energy" | "soreness" | "adherence";

const FIELDS: { key: FieldKey; icon: IconComponent }[] = [
  { key: "sleep", icon: Moon },
  { key: "energy", icon: Zap },
  { key: "soreness", icon: Activity },
  { key: "adherence", icon: ListChecks },
];
const WEIGHT_STEP = 0.1;
/** Where the stepper starts when there's no weigh-in yet. */
const FIRST_WEIGHT = 70;

// ---------------------------------------------------------------------------
// Weigh-in
// ---------------------------------------------------------------------------

export function WeighInSheet({
  visible,
  onClose,
  managedClientId,
  last,
}: {
  visible: boolean;
  onClose: () => void;
  managedClientId: string;
  /** The client's latest weigh-in, for the stepper's start and the subtitle. */
  last: { date: string; value: number } | null;
}) {
  const { t } = useTranslation();
  return (
    <Sheet visible={visible} onClose={onClose} closeLabel={t("common.cancel")} title={t("clientCard.entry.weighInTitle")}>
      {visible ? <WeighInForm managedClientId={managedClientId} last={last} onDone={onClose} /> : null}
    </Sheet>
  );
}

function WeighInForm({
  managedClientId,
  last,
  onDone,
}: {
  managedClientId: string;
  last: { date: string; value: number } | null;
  onDone: () => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  // null = untouched: the stepper shows the last weight.
  const [weightDraft, setWeightDraft] = useState<number | null>(null);
  const [typing, setTyping] = useState<string | null>(null);
  const [waist, setWaist] = useState("");
  const [chest, setChest] = useState("");
  const [photo, setPhoto] = useState<{ uri: string; base64: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shownWeight = weightDraft ?? last?.value ?? null;

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

  const save = useMutation({
    mutationFn: async () => {
      let photoPath: string | null = null;
      if (photo) {
        // 0032's storage policy: the managed client's folder is the trainer's.
        const path = `${managedClientId}/${Date.now()}.jpg`;
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
        managed_client_id: managedClientId,
        date: todayISO(),
        weight: shownWeight,
        measurements: Object.keys(measurements).length > 0 ? measurements : null,
        photo_url: photoPath,
      });
      if (insErr) throw insErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.clientDetail.subject("managed", managedClientId) });
      queryClient.invalidateQueries({ queryKey: qk.progress.all });
      onDone();
    },
  });

  function submit() {
    if (shownWeight == null && !photo && parseTypedNumber(waist) == null && parseTypedNumber(chest) == null) {
      setError(t("progress.addSomethingFirst"));
      return;
    }
    setError(null);
    save.mutate();
  }

  return (
    <>
      <AppText size={13} tone="smoke">
        {last
          ? t("progress.lastTime", { weight: ltr(formatWeight(last.value)), date: shortDate(last.date, i18n.language) })
          : t("clientCard.entry.firstWeighIn")}
      </AppText>
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

      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Button label={t("progress.photo")} icon={Camera} variant="secondary" size={44} onPress={pickPhoto} />
        {photo ? <Image source={{ uri: photo.uri }} style={{ width: 44, height: 44, borderRadius: 12 }} /> : null}
      </View>

      {error || save.error ? (
        <AppText size={14} tone="ember">
          {error ?? (save.error as Error).message}
        </AppText>
      ) : null}
      <Button label={t("progress.save")} size={52} block loading={save.isPending} onPress={submit} />
    </>
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

// ---------------------------------------------------------------------------
// Weekly check-in
// ---------------------------------------------------------------------------

export function CheckinSheet({
  visible,
  onClose,
  managedClientId,
  current,
}: {
  visible: boolean;
  onClose: () => void;
  managedClientId: string;
  /** This week's check-in if there is one: the sheet edits it. */
  current: CheckIn | null;
}) {
  const { t } = useTranslation();
  return (
    <Sheet visible={visible} onClose={onClose} closeLabel={t("common.cancel")} title={t("clientCard.entry.checkinTitle")}>
      {visible ? <CheckinForm managedClientId={managedClientId} current={current} onDone={onClose} /> : null}
    </Sheet>
  );
}

function CheckinForm({
  managedClientId,
  current,
  onDone,
}: {
  managedClientId: string;
  current: CheckIn | null;
  onDone: () => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const week = weekStartOf();
  const [values, setValues] = useState<Record<FieldKey, number>>({
    sleep: current?.sleep ?? 3,
    energy: current?.energy ?? 3,
    soreness: current?.soreness ?? 3,
    adherence: current?.adherence ?? 3,
  });
  const [note, setNote] = useState(current?.note ?? "");

  const save = useMutation({
    mutationFn: async () => {
      const row = { ...values, note: note.trim() === "" ? null : note.trim() };
      // One per week (check_ins_managed_week_key): this week's row is edited.
      const { error } = current
        ? await supabase.from("check_ins").update(row).eq("id", current.id)
        : await supabase.from("check_ins").insert({ managed_client_id: managedClientId, week_start: week, ...row });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.checkIns.all });
      onDone();
    },
  });

  return (
    <>
      <AppText size={13} tone="smoke">
        {t("clientCard.week", { date: shortDate(week, i18n.language) })}
      </AppText>
      {FIELDS.map((f) => (
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
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={t("checkin.scoreOf", { field: t(`checkin.fields.${f.key}`), n })}
                  onPress={() => setValues((prev) => ({ ...prev, [f.key]: n }))}
                  style={({ pressed }) => ({
                    flex: 1,
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: on ? colors.ink : colors.mist,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: pressed ? 0.8 : 1,
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
      <Input
        size="md"
        value={note}
        onChangeText={setNote}
        placeholder={t("clientCard.entry.notePlaceholder")}
        accessibilityLabel={t("checkin.noteLabel")}
      />
      {save.error ? (
        <AppText size={14} tone="ember">
          {(save.error as Error).message}
        </AppText>
      ) : null}
      <Button label={t("progress.save")} size={52} block loading={save.isPending} onPress={() => save.mutate()} />
    </>
  );
}
