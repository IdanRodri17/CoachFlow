// components/TemplateBuilder.tsx — the trainer's create/edit screen body for a
// workout template. Shared by the "new template" and "edit template" screens.
//
// It manages local state for:
//   - the template fields (name, description, notes)
//   - an ORDERED list of exercises, each with target sets/reps/weight/rest
// You add exercises via a modal picker (the exercise library), reorder them with
// up/down arrows, remove them, and edit each one's targets inline. On save it
// hands the screen a clean payload (numbers parsed, order = array order).

import { useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";

// --- payload handed back to the screen on save ---
export type TemplateExerciseInput = {
  exercise_id: string;
  target_sets: number | null;
  target_reps: number | null;
  target_weight: number | null;
  rest_seconds: number | null;
};
export type TemplateInput = {
  name: string;
  description: string | null;
  notes: string | null;
  items: TemplateExerciseInput[]; // display order; position = index on save
};

// --- pre-fill values when editing ---
export type TemplateBuilderInitial = {
  name?: string;
  description?: string | null;
  notes?: string | null;
  items?: {
    exercise_id: string;
    exercise_name: string;
    target_sets: number | null;
    target_reps: number | null;
    target_weight: number | null;
    rest_seconds: number | null;
  }[];
};

// local row state — inputs are kept as strings, parsed on submit
type BuilderItem = {
  key: string;
  exercise_id: string;
  exercise_name: string;
  target_sets: string;
  target_reps: string;
  target_weight: string;
  rest_seconds: string;
};

const num = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
const nullable = (v: string) => (v.trim().length === 0 ? null : v.trim());
const toInt = (v: string) => {
  const n = Number.parseInt(v.trim(), 10);
  return v.trim() === "" || !Number.isFinite(n) ? null : n;
};
const toNum = (v: string) => {
  const n = Number.parseFloat(v.trim());
  return v.trim() === "" || !Number.isFinite(n) ? null : n;
};

export function TemplateBuilder({
  initial,
  submitLabel,
  submitting,
  onSubmit,
  errorMessage,
  footer,
}: {
  initial?: TemplateBuilderInitial;
  submitLabel: string;
  submitting: boolean;
  onSubmit: (input: TemplateInput) => void;
  errorMessage?: string | null;
  footer?: React.ReactNode;
}) {
  const keyCounter = useRef(0);
  const nextKey = () => String(keyCounter.current++);

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [items, setItems] = useState<BuilderItem[]>(
    (initial?.items ?? []).map((it) => ({
      key: nextKey(),
      exercise_id: it.exercise_id,
      exercise_name: it.exercise_name,
      target_sets: num(it.target_sets),
      target_reps: num(it.target_reps),
      target_weight: num(it.target_weight),
      rest_seconds: num(it.rest_seconds),
    })),
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  function addExercise(ex: { id: string; name: string; default_sets: number | null; default_reps: number | null }) {
    setItems((prev) => [
      ...prev,
      {
        key: nextKey(),
        exercise_id: ex.id,
        exercise_name: ex.name,
        target_sets: num(ex.default_sets),
        target_reps: num(ex.default_reps),
        target_weight: "",
        rest_seconds: "",
      },
    ]);
    setPickerOpen(false);
  }

  function updateItem(key: string, field: keyof BuilderItem, value: string) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, [field]: value } : it)));
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((it) => it.key !== key));
  }

  function move(index: number, dir: -1 | 1) {
    setItems((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function handleSubmit() {
    if (name.trim().length === 0) {
      setValidationError("Template name is required.");
      return;
    }
    if (items.length === 0) {
      setValidationError("Add at least one exercise.");
      return;
    }
    setValidationError(null);
    onSubmit({
      name: name.trim(),
      description: nullable(description),
      notes: nullable(notes),
      items: items.map((it) => ({
        exercise_id: it.exercise_id,
        target_sets: toInt(it.target_sets),
        target_reps: toInt(it.target_reps),
        target_weight: toNum(it.target_weight),
        rest_seconds: toInt(it.rest_seconds),
      })),
    });
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["bottom"]}>
      <ScrollView contentContainerClassName="px-6 py-6" keyboardShouldPersistTaps="handled">
        {/* Template fields */}
        <Field label="Template name *">
          <Input value={name} onChangeText={setName} placeholder="e.g. Full Body A" editable={!submitting} />
        </Field>
        <Field label="Description">
          <Input value={description} onChangeText={setDescription} placeholder="Who it's for, focus…" editable={!submitting} />
        </Field>
        <Field label="Notes (shown to the client later)">
          <Input value={notes} onChangeText={setNotes} placeholder="e.g. Focus on form over weight." editable={!submitting} multiline />
        </Field>

        {/* Exercises */}
        <Text className="mb-2 mt-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Exercises ({items.length})
        </Text>

        {items.map((it, index) => (
          <View key={it.key} className="mb-3 rounded-xl border border-slate-200 bg-white p-3">
            <View className="mb-2 flex-row items-center justify-between">
              <Text className="flex-1 text-base font-semibold text-slate-900">
                {index + 1}. {it.exercise_name}
              </Text>
              <View className="flex-row items-center gap-1">
                <IconBtn label="↑" onPress={() => move(index, -1)} disabled={submitting || index === 0} />
                <IconBtn label="↓" onPress={() => move(index, 1)} disabled={submitting || index === items.length - 1} />
                <IconBtn label="✕" danger onPress={() => removeItem(it.key)} disabled={submitting} />
              </View>
            </View>
            <View className="flex-row gap-2">
              <Mini label="Sets" value={it.target_sets} onChangeText={(v) => updateItem(it.key, "target_sets", v)} editable={!submitting} />
              <Mini label="Reps" value={it.target_reps} onChangeText={(v) => updateItem(it.key, "target_reps", v)} editable={!submitting} />
              <Mini label="Weight" value={it.target_weight} onChangeText={(v) => updateItem(it.key, "target_weight", v)} editable={!submitting} decimal />
              <Mini label="Rest s" value={it.rest_seconds} onChangeText={(v) => updateItem(it.key, "rest_seconds", v)} editable={!submitting} />
            </View>
          </View>
        ))}

        <Pressable
          className="mb-2 items-center rounded-xl border border-slate-300 px-4 py-3 active:bg-slate-50"
          disabled={submitting}
          onPress={() => setPickerOpen(true)}
        >
          <Text className="text-base font-semibold text-slate-700">+ Add exercise</Text>
        </Pressable>

        {validationError || errorMessage ? (
          <Text className="mb-3 mt-1 text-sm text-red-600">{validationError ?? errorMessage}</Text>
        ) : null}

        <Pressable
          className="mt-2 items-center rounded-xl bg-slate-900 px-4 py-3 active:opacity-80"
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

      <ExercisePickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={addExercise}
      />
    </SafeAreaView>
  );
}

// A modal listing the trainer's exercise library to pick from.
function ExercisePickerModal({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (ex: { id: string; name: string; default_sets: number | null; default_reps: number | null }) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["exercises"],
    queryFn: async () => {
      const { data, error } = await supabase.from("exercises").select("*").order("name");
      if (error) throw error;
      return data;
    },
    enabled: visible, // only fetch when the modal is open
  });

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-row items-center justify-between border-b border-slate-200 px-6 py-4">
          <Text className="text-lg font-bold text-slate-900">Pick an exercise</Text>
          <Pressable onPress={onClose} className="active:opacity-60">
            <Text className="text-base font-semibold text-slate-500">Close</Text>
          </Pressable>
        </View>

        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator />
          </View>
        ) : (
          <FlatList
            data={data ?? []}
            keyExtractor={(item) => item.id}
            contentContainerClassName="p-4 gap-2"
            ListEmptyComponent={
              <Text className="px-2 py-8 text-center text-sm text-slate-400">
                No exercises in your library yet — add some in the Exercises tab first.
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable
                className="rounded-xl border border-slate-200 px-4 py-3 active:bg-slate-50"
                onPress={() => onPick(item)}
              >
                <Text className="text-base font-semibold text-slate-900">{item.name}</Text>
                {item.muscle_group ? (
                  <Text className="mt-0.5 text-sm text-slate-500">{item.muscle_group}</Text>
                ) : null}
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

// --- small presentational helpers ---
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="mb-4">
      <Text className="mb-2 text-sm font-medium text-slate-700">{label}</Text>
      {children}
    </View>
  );
}

function Input(props: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      placeholderTextColor="#94a3b8"
      className="rounded-xl border border-slate-300 px-4 py-3 text-base text-slate-900"
      {...props}
    />
  );
}

function Mini({
  label,
  decimal,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string; decimal?: boolean }) {
  return (
    <View className="flex-1">
      <Text className="mb-1 text-center text-xs text-slate-400">{label}</Text>
      <TextInput
        placeholderTextColor="#cbd5e1"
        placeholder="—"
        keyboardType={decimal ? "decimal-pad" : "number-pad"}
        className="rounded-lg border border-slate-300 px-2 py-2 text-center text-base text-slate-900"
        {...props}
      />
    </View>
  );
}

function IconBtn({
  label,
  onPress,
  disabled,
  danger,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`h-8 w-8 items-center justify-center rounded-lg border ${
        disabled ? "border-slate-200" : danger ? "border-red-300" : "border-slate-300 active:bg-slate-100"
      }`}
    >
      <Text className={`text-base ${disabled ? "text-slate-300" : danger ? "text-red-600" : "text-slate-700"}`}>
        {label}
      </Text>
    </Pressable>
  );
}
