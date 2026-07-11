// app/(tabs)/progress.tsx — the client's progress tab (V7; V10 check-in
// merged in as a follow-up so all client self-monitoring lives in one tab).
//
// Weekly check-in first (a 30-second pulse: sleep / energy / soreness /
// adherence + optional note — once per week, week_start is the Sunday of the
// current week per lib/dates.ts weekStartOf), then weigh-in tracking: log a
// weight + optional waist/chest measurements + optional private photo, see a
// weight-over-time chart, and browse past entries. Photos go to the private
// "progress-photos" Storage bucket under "<client_id>/..."; we display them
// via short-lived signed URLs.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { decode } from "base64-arraybuffer";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { DEFAULT_TIME_ZONE, formatDisplayDate, todayISO, weekStartOf } from "@/lib/dates";
import { LineChart } from "@/components/LineChart";
import { directionalTextClassName, LTR_INPUT_STYLE } from "@/lib/i18n";

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: DEFAULT_TIME_ZONE }).format(
    new Date(`${iso}T12:00:00Z`),
  );

const toNum = (v: string) => {
  const n = Number.parseFloat(v.trim());
  return v.trim() === "" || !Number.isFinite(n) ? null : n;
};

const CHECKIN_FIELDS = [
  { key: "sleep", labelKey: "checkin.fields.sleep" },
  { key: "energy", labelKey: "checkin.fields.energy" },
  { key: "soreness", labelKey: "checkin.fields.soreness" },
  { key: "adherence", labelKey: "checkin.fields.adherence" },
] as const;
type CheckinFieldKey = (typeof CHECKIN_FIELDS)[number]["key"];

export default function ProgressScreen() {
  const { t } = useTranslation();
  const { session, profile } = useAuth();
  const queryClient = useQueryClient();

  const [checkinValues, setCheckinValues] = useState<Record<CheckinFieldKey, number>>({
    sleep: 3,
    energy: 3,
    soreness: 3,
    adherence: 3,
  });
  const [checkinNote, setCheckinNote] = useState("");

  const [weight, setWeight] = useState("");
  const [waist, setWaist] = useState("");
  const [chest, setChest] = useState("");
  const [photo, setPhoto] = useState<{ uri: string; base64: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewingEntry, setViewingEntry] = useState<{
    signedUrl: string;
    date: string;
    weight: number | null;
    measurements: Record<string, unknown> | null;
  } | null>(null);

  if (profile && profile.role !== "client") return <Redirect href="/" />;
  const clientId = session!.user.id;
  const thisWeek = weekStartOf(todayISO());

  const checkinHistory = useQuery({
    queryKey: ["check-ins", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("check_ins")
        .select("*")
        .eq("client_id", clientId)
        .order("week_start", { ascending: false })
        .limit(12);
      if (error) throw error;
      return data;
    },
  });

  const submitCheckin = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("check_ins").insert({
        client_id: clientId,
        week_start: thisWeek,
        sleep: checkinValues.sleep,
        energy: checkinValues.energy,
        soreness: checkinValues.soreness,
        adherence: checkinValues.adherence,
        note: checkinNote.trim() === "" ? null : checkinNote.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["check-ins", clientId] }),
  });

  const progress = useQuery({
    queryKey: ["progress"],
    queryFn: async () => {
      const { data: entries, error } = await supabase
        .from("progress_entries")
        .select("*")
        .eq("client_id", clientId)
        .order("date", { ascending: true });
      if (error) throw error;

      // Signed URLs for any photos.
      const paths = entries.map((e) => e.photo_url).filter(Boolean) as string[];
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

  const chartData =
    progress.data?.entries
      .filter((e) => e.weight != null)
      .map((e) => ({ label: shortDate(e.date), value: Number(e.weight) })) ?? [];

  async function pickPhoto() {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError(t("progress.photoPermission"));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.5,
      base64: true,
    });
    if (!res.canceled && res.assets[0]?.base64) {
      setPhoto({ uri: res.assets[0].uri, base64: res.assets[0].base64 });
    }
  }

  const addEntry = useMutation({
    mutationFn: async () => {
      let photoPath: string | null = null;
      if (photo) {
        const path = `${clientId}/${Date.now()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from("progress-photos")
          .upload(path, decode(photo.base64), { contentType: "image/jpeg" });
        if (upErr) throw upErr;
        photoPath = path;
      }
      const measurements: Record<string, number> = {};
      const w = toNum(waist);
      const c = toNum(chest);
      if (w != null) measurements.waist = w;
      if (c != null) measurements.chest = c;

      const { error: insErr } = await supabase.from("progress_entries").insert({
        client_id: clientId,
        date: todayISO(),
        weight: toNum(weight),
        measurements: Object.keys(measurements).length > 0 ? measurements : null,
        photo_url: photoPath,
      });
      if (insErr) throw insErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["progress"] });
      setWeight("");
      setWaist("");
      setChest("");
      setPhoto(null);
    },
  });

  function handleSave() {
    if (toNum(weight) == null && !photo && toNum(waist) == null && toNum(chest) == null) {
      setError(t("progress.addSomethingFirst"));
      return;
    }
    setError(null);
    addEntry.mutate();
  }

  const currentCheckin = checkinHistory.data?.find((c) => c.week_start === thisWeek) ?? null;
  const pastCheckins = (checkinHistory.data ?? []).filter((c) => c.week_start !== thisWeek);

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["bottom"]}>
      <ScrollView contentContainerClassName="px-6 py-6" keyboardShouldPersistTaps="handled">
        {/* Weekly check-in */}
        <Text className="mb-2 w-full text-left text-sm font-semibold uppercase tracking-wide text-slate-500">
          {t("checkin.thisWeek")}
        </Text>

        {checkinHistory.isLoading ? (
          <ActivityIndicator />
        ) : currentCheckin ? (
          <View className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <Text className="w-full text-left text-sm font-semibold text-emerald-800">
              {t("checkin.checkedInThisWeek")}
            </Text>
            <View className="mt-3 gap-1.5">
              {CHECKIN_FIELDS.map((f) => (
                <Text key={f.key} className="text-sm text-emerald-900">
                  {t(f.labelKey)}: {currentCheckin[f.key]}/5
                </Text>
              ))}
            </View>
            {currentCheckin.note ? (
              <Text className="mt-2 w-full text-left text-sm text-emerald-700">
                “{currentCheckin.note}”
              </Text>
            ) : null}
          </View>
        ) : (
          <View className="rounded-2xl border border-slate-200 p-4">
            <View className="gap-4">
              {CHECKIN_FIELDS.map((f) => (
                <View key={f.key}>
                  <Text className="mb-1.5 w-full text-left text-sm font-medium text-slate-700">{t(f.labelKey)}</Text>
                  <ScaleSelector
                    value={checkinValues[f.key]}
                    onChange={(v) => setCheckinValues((prev) => ({ ...prev, [f.key]: v }))}
                  />
                </View>
              ))}
            </View>

            <Text className="mb-1.5 mt-4 w-full text-left text-sm font-medium text-slate-700">{t("checkin.noteLabel")}</Text>
            <TextInput
              className={`rounded-lg border border-slate-300 px-3 py-2 text-base text-slate-900 ${directionalTextClassName()}`}
              placeholder={t("checkin.notePlaceholder")}
              placeholderTextColor="#94a3b8"
              value={checkinNote}
              onChangeText={setCheckinNote}
              multiline
            />

            {submitCheckin.error ? (
              <Text className="mt-2 w-full text-left text-sm text-red-600">{(submitCheckin.error as Error).message}</Text>
            ) : null}

            <Pressable
              className="mt-4 items-center rounded-xl bg-slate-900 px-4 py-3 active:opacity-80"
              disabled={submitCheckin.isPending}
              onPress={() => submitCheckin.mutate()}
            >
              {submitCheckin.isPending ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text className="text-base font-semibold text-white">{t("checkin.submit")}</Text>
              )}
            </Pressable>
          </View>
        )}

        <Text className="mb-2 mt-7 w-full text-left text-sm font-semibold uppercase tracking-wide text-slate-500">
          {t("checkin.history")}
        </Text>
        {pastCheckins.length > 0 ? (
          <View className="gap-2">
            {pastCheckins.map((c) => (
              <View key={c.id} className="rounded-xl border border-slate-200 p-3">
                <Text className="w-full text-left text-sm font-semibold text-slate-900">
                  {t("checkin.weekOf", { date: formatDisplayDate(c.week_start) })}
                </Text>
                <Text className="mt-1 text-sm text-slate-500">
                  {CHECKIN_FIELDS.map((f) => `${t(f.labelKey)} ${c[f.key]}`).join(" · ")}
                </Text>
                {c.note ? (
                  <Text className="mt-1 w-full text-left text-sm text-slate-400">
                    “{c.note}”
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : (
          <Text className="w-full text-left text-sm text-slate-400">{t("checkin.noPastCheckins")}</Text>
        )}

        {/* Weight chart */}
        <Text className="mb-2 mt-7 w-full text-left text-sm font-semibold uppercase tracking-wide text-slate-500">
          {t("progress.weightOverTime")}
        </Text>
        <View className="rounded-2xl border border-slate-200 p-3">
          <LineChart data={chartData} />
        </View>

        {/* New entry */}
        <Text className="mb-2 mt-7 w-full text-left text-sm font-semibold uppercase tracking-wide text-slate-500">
          {t("progress.logToday")}
        </Text>
        <View className="flex-row gap-2">
          <Field label={t("progress.weightKg")} value={weight} onChangeText={setWeight} />
          <Field label={t("progress.waistCm")} value={waist} onChangeText={setWaist} />
          <Field label={t("progress.chestCm")} value={chest} onChangeText={setChest} />
        </View>

        <View className="mt-3 flex-row items-center gap-3">
          <Pressable
            className="rounded-xl border border-slate-300 px-4 py-3 active:bg-slate-100"
            onPress={pickPhoto}
          >
            <Text className="text-sm font-semibold text-slate-700">
              {photo ? t("progress.changePhoto") : t("progress.addPhoto")}
            </Text>
          </Pressable>
          {photo ? <Image source={{ uri: photo.uri }} className="h-12 w-12 rounded-lg" /> : null}
        </View>

        {error || addEntry.error ? (
          <Text className="mt-3 w-full text-left text-sm text-red-600">
            {error ?? (addEntry.error as Error).message}
          </Text>
        ) : null}

        <Pressable
          className="mt-4 items-center rounded-xl bg-slate-900 px-4 py-3 active:opacity-80"
          disabled={addEntry.isPending}
          onPress={handleSave}
        >
          {addEntry.isPending ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-base font-semibold text-white">{t("progress.saveEntry")}</Text>
          )}
        </Pressable>

        {/* History */}
        <Text className="mb-2 mt-7 w-full text-left text-sm font-semibold uppercase tracking-wide text-slate-500">
          {t("progress.history")}
        </Text>
        {progress.isLoading ? (
          <ActivityIndicator />
        ) : progress.data && progress.data.entries.length > 0 ? (
          <View className="gap-3">
            {[...progress.data.entries].reverse().map((e) => {
              const m = e.measurements as Record<string, unknown> | null;
              const signedUrl = e.photo_url ? progress.data!.signed.get(e.photo_url) : undefined;
              return (
                <View key={e.id} className="flex-row items-center gap-3 rounded-xl border border-slate-200 p-3">
                  {signedUrl ? (
                    <Pressable
                      onPress={() =>
                        setViewingEntry({ signedUrl, date: e.date, weight: e.weight, measurements: m })
                      }
                    >
                      <Image source={{ uri: signedUrl }} className="h-16 w-16 rounded-lg" />
                    </Pressable>
                  ) : null}
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-slate-900">{shortDate(e.date)}</Text>
                    <Text className="mt-0.5 text-base text-slate-700">
                      {e.weight != null ? t("progress.weightValue", { value: e.weight }) : "—"}
                    </Text>
                    {m ? (
                      <Text className="mt-0.5 text-sm text-slate-500">
                        {Object.entries(m)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(" · ")}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <Text className="w-full text-left text-sm text-slate-400">{t("progress.noEntriesYet")}</Text>
        )}
      </ScrollView>

      <Modal
        visible={viewingEntry !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setViewingEntry(null)}
      >
        <Pressable
          className="flex-1 items-center justify-center bg-black/90 px-6"
          onPress={() => setViewingEntry(null)}
        >
          {viewingEntry ? (
            <View className="w-full items-center">
              <Image
                source={{ uri: viewingEntry.signedUrl }}
                className="aspect-square w-full rounded-2xl"
                resizeMode="contain"
              />
              <Text className="mt-4 text-base font-semibold text-white">
                {shortDate(viewingEntry.date)}
              </Text>
              <Text className="mt-1 text-sm text-slate-200">
                {viewingEntry.weight != null
                  ? t("progress.weightValue", { value: viewingEntry.weight })
                  : "—"}
                {viewingEntry.measurements
                  ? ` · ${Object.entries(viewingEntry.measurements)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(" · ")}`
                  : ""}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
}) {
  return (
    <View className="flex-1">
      <Text className="mb-1 w-full text-left text-xs text-slate-500">{label}</Text>
      <TextInput
        className="rounded-lg border border-slate-300 px-3 py-2 text-base text-slate-900"
        style={LTR_INPUT_STYLE}
        placeholder="—"
        placeholderTextColor="#cbd5e1"
        keyboardType="decimal-pad"
        value={value}
        onChangeText={onChangeText}
      />
    </View>
  );
}

function ScaleSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View className="flex-row gap-2">
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          onPress={() => onChange(n)}
          className={`h-10 flex-1 items-center justify-center rounded-lg border ${
            n === value ? "border-slate-900 bg-slate-900" : "border-slate-300 active:bg-slate-100"
          }`}
        >
          <Text className={`text-base font-semibold ${n === value ? "text-white" : "text-slate-700"}`}>
            {n}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
