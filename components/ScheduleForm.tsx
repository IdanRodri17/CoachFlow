// components/ScheduleForm.tsx — shared body for creating/editing a scheduled
// workout. Used by schedule/new.tsx and schedule/[id].tsx.
//
// Designed to be FAST and forgiving (the trainer is often in a hurry):
//   - Client: pick one from the roster OR just type a one-off name (which the
//     screen turns into an offline client). One of the two is required.
//   - Template: OPTIONAL and recommended — schedule now, add it later.
//   - Time: OPTIONAL ("Any time").
// It returns a clean payload; the screen does the DB work.

import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { addDays, todayISO } from "@/lib/dates";
import type { RosterClient } from "@/lib/useRoster";
import { DateChips } from "@/components/DateChips";
import { TimeChips } from "@/components/TimeChips";

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
  // When set, repeat on these weekdays (0=Sun..6=Sat) for `count` weeks/months
  // from `date`.
  repeat?: { days: number[]; count: number; unit: "weeks" | "months" };
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type ScheduleFormInitial = {
  client?: ClientRef;
  templateId?: string | null;
  date?: string;
  time?: string | null;
  note?: string | null;
};

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
  footer?: React.ReactNode;
  allowRepeat?: boolean; // show the "repeat weekly" option (creating, not editing)
}) {
  const [selected, setSelected] = useState<ClientRef | null>(initial?.client ?? null);
  const [newName, setNewName] = useState("");
  const [templateId, setTemplateId] = useState<string | null>(initial?.templateId ?? null);
  const [date, setDate] = useState(initial?.date ?? addDays(todayISO(), 1));
  const [time, setTime] = useState<string | null>(initial?.time ?? null);
  const [note, setNote] = useState(initial?.note ?? "");
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [repeatCount, setRepeatCount] = useState(4);
  const [repeatUnit, setRepeatUnit] = useState<"weeks" | "months">("weeks");
  const [validationError, setValidationError] = useState<string | null>(null);

  // Typing a new name takes precedence over a roster selection.
  const usingNewName = newName.trim().length > 0;

  function handleSubmit() {
    let client: ClientChoice | null = null;
    if (usingNewName) client = { mode: "new", name: newName.trim() };
    else if (selected) client = { mode: "existing", kind: selected.kind, refId: selected.refId };

    if (!client) {
      setValidationError("Pick a client, or type a one-off name.");
      return;
    }
    setValidationError(null);
    onSubmit({
      client,
      templateId,
      date,
      time,
      note: note.trim().length > 0 ? note.trim() : null,
      repeat:
        allowRepeat && repeatDays.length > 0
          ? { days: repeatDays, count: repeatCount, unit: repeatUnit }
          : undefined,
    });
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["bottom"]}>
      <ScrollView contentContainerClassName="px-6 py-6" keyboardShouldPersistTaps="handled">
        {/* Client */}
        <Section label="Client">
          {loadingRoster ? (
            <ActivityIndicator />
          ) : roster.length > 0 ? (
            <View className="gap-2">
              {roster.map((c) => (
                <SelectRow
                  key={`${c.kind}-${c.refId}`}
                  label={c.name}
                  tag={c.kind === "managed" ? "offline" : undefined}
                  selected={!usingNewName && selected?.kind === c.kind && selected?.refId === c.refId}
                  onPress={() => {
                    setSelected({ kind: c.kind, refId: c.refId });
                    setNewName("");
                  }}
                />
              ))}
            </View>
          ) : (
            <Text className="text-sm text-slate-400">No saved clients — type a name below.</Text>
          )}
          <TextInput
            className="mt-2 rounded-xl border border-slate-300 px-4 py-3 text-base text-slate-900"
            placeholder="Or type a one-off client name"
            placeholderTextColor="#94a3b8"
            autoCapitalize="words"
            value={newName}
            onChangeText={(t) => {
              setNewName(t);
              if (t.trim().length > 0) setSelected(null);
            }}
            editable={!submitting}
          />
        </Section>

        {/* Template (optional, recommended) */}
        <Section label="Template">
          <Text className="-mt-1 mb-2 text-xs text-slate-400">
            Recommended — but you can skip it and add it later.
          </Text>
          {loadingTemplates ? (
            <ActivityIndicator />
          ) : templates.length > 0 ? (
            <View className="gap-2">
              {templates.map((t) => (
                <SelectRow
                  key={t.id}
                  label={t.name}
                  selected={templateId === t.id}
                  // Tap again to clear (no template).
                  onPress={() => setTemplateId((prev) => (prev === t.id ? null : t.id))}
                />
              ))}
            </View>
          ) : (
            <Text className="text-sm text-slate-400">No templates yet — build one in the Templates tab.</Text>
          )}
        </Section>

        {/* Date */}
        <Section label="Date">
          <DateChips value={date} onChange={setDate} />
        </Section>

        {/* Repeat weekly (create only) */}
        {allowRepeat ? (
          <Section label="Repeat weekly (optional)">
            <Text className="-mt-1 mb-2 text-xs text-slate-400">
              Pick weekdays to repeat from the date above. Leave empty for a one-off.
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {WEEKDAYS.map((w, i) => {
                const on = repeatDays.includes(i);
                return (
                  <Pressable
                    key={i}
                    onPress={() =>
                      setRepeatDays((prev) => (on ? prev.filter((d) => d !== i) : [...prev, i]))
                    }
                    className={`rounded-lg border px-3 py-2 ${
                      on ? "border-slate-900 bg-slate-900" : "border-slate-300"
                    }`}
                  >
                    <Text className={`text-sm font-semibold ${on ? "text-white" : "text-slate-700"}`}>
                      {w}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {repeatDays.length > 0 ? (
              <View className="mt-3 gap-3">
                <View className="flex-row items-center gap-3">
                  <Text className="text-sm text-slate-600">For</Text>
                  <Pressable
                    onPress={() => setRepeatCount((c) => Math.max(1, c - 1))}
                    className="h-9 w-9 items-center justify-center rounded-lg border border-slate-300 active:bg-slate-100"
                  >
                    <Text className="text-lg text-slate-700">−</Text>
                  </Pressable>
                  <Text className="w-6 text-center text-base font-semibold text-slate-900">{repeatCount}</Text>
                  <Pressable
                    onPress={() => setRepeatCount((c) => Math.min(12, c + 1))}
                    className="h-9 w-9 items-center justify-center rounded-lg border border-slate-300 active:bg-slate-100"
                  >
                    <Text className="text-lg text-slate-700">+</Text>
                  </Pressable>
                </View>
                <View className="flex-row gap-2">
                  {(["weeks", "months"] as const).map((u) => {
                    const on = repeatUnit === u;
                    return (
                      <Pressable
                        key={u}
                        onPress={() => setRepeatUnit(u)}
                        className={`rounded-lg border px-4 py-2 ${
                          on ? "border-slate-900 bg-slate-900" : "border-slate-300"
                        }`}
                      >
                        <Text className={`text-sm font-semibold ${on ? "text-white" : "text-slate-700"}`}>
                          {u}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </Section>
        ) : null}

        {/* Time (optional) */}
        <Section label="Time">
          <TimeChips value={time} onChange={setTime} />
        </Section>

        {/* Note */}
        <Section label="Note (optional)">
          <TextInput
            className="rounded-xl border border-slate-300 px-4 py-3 text-base text-slate-900"
            placeholder="e.g. Today's lighter — focus on form."
            placeholderTextColor="#94a3b8"
            value={note}
            onChangeText={setNote}
            editable={!submitting}
            multiline
          />
        </Section>

        {validationError || errorMessage ? (
          <Text className="mb-3 text-sm text-red-600">{validationError ?? errorMessage}</Text>
        ) : null}

        <Pressable
          className="mt-1 items-center rounded-xl bg-slate-900 px-4 py-3 active:opacity-80"
          disabled={submitting}
          onPress={handleSubmit}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-base font-semibold text-white">{submitLabel}</Text>
          )}
        </Pressable>

        {footer ? <View className="mt-4">{footer}</View> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="mb-6">
      <Text className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{label}</Text>
      {children}
    </View>
  );
}

function SelectRow({
  label,
  tag,
  selected,
  onPress,
}: {
  label: string;
  tag?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center justify-between rounded-xl border px-4 py-3 ${
        selected ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white"
      }`}
    >
      <View className="flex-row items-center gap-2">
        <Text className="text-base font-medium text-slate-900">{label}</Text>
        {tag ? (
          <Text className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{tag}</Text>
        ) : null}
      </View>
      {selected ? <Text className="text-base font-bold text-slate-900">✓</Text> : null}
    </Pressable>
  );
}
