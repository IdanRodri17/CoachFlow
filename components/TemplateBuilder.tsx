// components/TemplateBuilder.tsx — the trainer's create/edit screen body for a
// workout template. Shared by the "new template" and "edit template" screens.
//
// D29a: rebuilt to docs/design/screens/trainer-template-edit.html — "שמירה" in
// the header, the template name, the note to clients, then the exercises as
// one card of rows: each row shows its scheme ("4 × 8 · 50 ק״ג · מנוחה 2:00");
// tapping it opens it in place with 2×2 mini steppers (sets, reps, weight —
// tap the number to type it — and rest ±15 s), move up / down and remove. A
// dashed "הוספת תרגיל" opens the library in a sheet.
//
// The reference reorders by dragging a grip; we have no drag library, so the
// open row has move up / down buttons instead.
//
// The props and the payload are unchanged: the screens own the queries and
// the save, this component hands them a clean payload (order = array order).
// The description field isn't on the design: an existing one is kept as is.

import { useMemo, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import ArrowDown from "lucide-react-native/icons/arrow-down";
import ArrowUp from "lucide-react-native/icons/arrow-up";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import ChevronUp from "lucide-react-native/icons/chevron-up";
import Info from "lucide-react-native/icons/info";
import Plus from "lucide-react-native/icons/plus";
import Search from "lucide-react-native/icons/search";
import Trash from "lucide-react-native/icons/trash";

import { qk } from "@/lib/queryKeys";
import { supabase } from "@/lib/supabase";
import { ltr } from "@/lib/i18n";
import { formatClock, formatWeight, stepWeight } from "@/lib/workoutSession";
import { muscleKeyOf } from "@/components/ExerciseForm";
import {
  AppText,
  Button,
  colors,
  Divider,
  FieldLabel,
  fonts,
  Icon,
  IconButton,
  Input,
  ListCard,
  Num,
  Sheet,
  Stepper,
} from "@/components/ui";

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

type BuilderItem = {
  key: string;
  exercise_id: string;
  exercise_name: string;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  rest: number | null;
};

const REST_STEP = 15;
/** Where an empty field starts on its first "+". */
const START = { sets: 3, reps: 10, rest: 60 };

/** Row keys only need to be unique; a module counter keeps refs out of render. */
let keySeq = 0;
const nextKey = () => String(keySeq++);

const nullable = (v: string) => (v.trim().length === 0 ? null : v.trim());
/** ±1 on a count; an empty one starts at its default, and can't go below 1. */
const stepCount = (v: number | null, d: 1 | -1, start: number) => (v == null ? (d > 0 ? start : null) : Math.max(1, v + d));

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
  footer?: ReactNode;
}) {
  const { t } = useTranslation();

  const [name, setName] = useState(initial?.name ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [items, setItems] = useState<BuilderItem[]>(() =>
    (initial?.items ?? []).map((it) => ({
      key: nextKey(),
      exercise_id: it.exercise_id,
      exercise_name: it.exercise_name,
      sets: it.target_sets,
      reps: it.target_reps,
      weight: it.target_weight,
      rest: it.rest_seconds,
    })),
  );
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const isEdit = initial != null;

  function addExercise(ex: { id: string; name: string; default_sets: number | null; default_reps: number | null }) {
    const key = nextKey();
    setItems((prev) => [
      ...prev,
      {
        key,
        exercise_id: ex.id,
        exercise_name: ex.name,
        sets: ex.default_sets,
        reps: ex.default_reps,
        weight: null,
        rest: null,
      },
    ]);
    setOpenKey(key);
    setPickerOpen(false);
  }

  function update(key: string, patch: Partial<BuilderItem>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }

  function remove(key: string) {
    setItems((prev) => prev.filter((it) => it.key !== key));
    setOpenKey(null);
  }

  function move(index: number, dir: -1 | 1) {
    setItems((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function handleSubmit() {
    if (name.trim().length === 0) {
      setValidationError(t("templates.form.nameRequired"));
      return;
    }
    if (items.length === 0) {
      setValidationError(t("templates.form.addAtLeastOneExercise"));
      return;
    }
    setValidationError(null);
    onSubmit({
      name: name.trim(),
      description: nullable(initial?.description ?? ""),
      notes: nullable(notes),
      items: items.map((it) => ({
        exercise_id: it.exercise_id,
        target_sets: it.sets,
        target_reps: it.reps,
        target_weight: it.weight,
        rest_seconds: it.rest,
      })),
    });
  }

  const error = validationError ?? errorMessage ?? null;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Button
              label={t("templates.builder.save")}
              accessibilityLabel={submitLabel}
              size={44}
              loading={submitting}
              onPress={handleSubmit}
            />
          ),
        }}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.chalk }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 30, gap: 18 }}
        keyboardShouldPersistTaps="handled"
      >
        {error ? (
          <AppText size={14} tone="ember">
            {error}
          </AppText>
        ) : null}

        <View style={{ gap: 8 }}>
          <FieldLabel>{t("templates.builder.name")}</FieldLabel>
          <Input
            size="md"
            value={name}
            onChangeText={setName}
            placeholder={t("templates.form.templateNamePlaceholder")}
            editable={!submitting}
            accessibilityLabel={t("templates.builder.name")}
          />
        </View>

        <View style={{ gap: 8 }}>
          <FieldLabel>{t("templates.builder.noteToClients")}</FieldLabel>
          <Input
            size="md"
            multiline
            value={notes}
            onChangeText={setNotes}
            placeholder={t("templates.form.notesPlaceholder")}
            editable={!submitting}
            accessibilityLabel={t("templates.builder.noteToClients")}
            style={{ minHeight: 48, fontSize: 16, lineHeight: 24, fontFamily: fonts.regular }}
          />
        </View>

        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <AppText size={18} weight="semibold" lineHeight={23}>
              {t("templates.builder.exercises", { count: items.length })}
            </AppText>
            {items.length > 1 ? (
              <AppText size={13} tone="smoke" style={{ flexShrink: 1 }}>
                {t("templates.builder.reorderHint")}
              </AppText>
            ) : null}
          </View>

          {items.length > 0 ? (
            <ListCard>
              {items.map((it, index) =>
                it.key === openKey ? (
                  <OpenRow
                    key={it.key}
                    item={it}
                    index={index}
                    count={items.length}
                    disabled={submitting}
                    onClose={() => setOpenKey(null)}
                    onChange={(patch) => update(it.key, patch)}
                    onMove={(dir) => move(index, dir)}
                    onRemove={() => remove(it.key)}
                  />
                ) : (
                  <ClosedRow key={it.key} item={it} index={index} onOpen={() => setOpenKey(it.key)} />
                ),
              )}
            </ListCard>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={submitting}
            onPress={() => setPickerOpen(true)}
            style={({ pressed }) => ({
              height: 56,
              borderRadius: 16,
              borderWidth: 1.5,
              borderStyle: "dashed",
              borderColor: colors.ash,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Icon icon={Plus} size={20} />
            <AppText size={16} weight="semibold">
              {t("templates.builder.add")}
            </AppText>
          </Pressable>
        </View>

        {isEdit ? (
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <View style={{ paddingTop: 2 }}>
              <Icon icon={Info} size={16} color={colors.graphite} />
            </View>
            <AppText size={13} lineHeight={20} tone="graphite" style={{ flex: 1 }}>
              {t("templates.builder.appliesHint")}
            </AppText>
          </View>
        ) : null}

        {footer ? <View style={{ marginTop: 8 }}>{footer}</View> : null}
      </ScrollView>

      <ExercisePickerSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} onPick={addExercise} />
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

function useScheme(it: BuilderItem): string {
  const { t } = useTranslation();
  return [
    ltr(`${it.sets ?? "—"} × ${it.reps ?? "—"}`),
    it.weight != null ? `${formatWeight(it.weight)} ${t("templates.builder.kg")}` : null,
    it.rest != null ? t("templates.builder.restShort", { time: ltr(formatClock(it.rest * 1000)) }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function Position({ index }: { index: number }) {
  return (
    <View style={{ width: 32, alignItems: "center" }}>
      <Num size={18} weight="semibold" tone="smoke" center>
        {index + 1}
      </Num>
    </View>
  );
}

function ClosedRow({ item, index, onOpen }: { item: BuilderItem; index: number; onOpen: () => void }) {
  const { t } = useTranslation();
  const scheme = useScheme(item);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("templates.builder.edit", { name: item.exercise_name })}
      onPress={onOpen}
      style={({ pressed }) => ({
        minHeight: 72,
        paddingVertical: 10,
        paddingStart: 4,
        paddingEnd: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: pressed ? colors.chalk : "transparent",
      })}
    >
      <Position index={index} />
      <View style={{ flex: 1, gap: 3 }}>
        <AppText size={16} weight="semibold" numberOfLines={1}>
          {item.exercise_name}
        </AppText>
        <AppText size={13} tone="graphite" numberOfLines={1}>
          {scheme}
        </AppText>
      </View>
      <View style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
        <Icon icon={ChevronDown} size={20} />
      </View>
    </Pressable>
  );
}

function OpenRow({
  item,
  index,
  count,
  disabled,
  onClose,
  onChange,
  onMove,
  onRemove,
}: {
  item: BuilderItem;
  index: number;
  count: number;
  disabled: boolean;
  onClose: () => void;
  onChange: (patch: Partial<BuilderItem>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const dec = t("templates.builder.decrease");
  const inc = t("templates.builder.increase");
  const typeHint = t("workout.mode.tapToType");
  return (
    <View
      style={{
        margin: 4,
        paddingTop: 10,
        paddingHorizontal: 14,
        paddingBottom: 16,
        gap: 12,
        borderRadius: 16,
        borderWidth: 2,
        borderColor: colors.ink,
        backgroundColor: colors.paper,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52 }}>
        <View style={{ marginStart: -10 }}>
          <Position index={index} />
        </View>
        <AppText size={16} weight="semibold" style={{ flex: 1 }}>
          {item.exercise_name}
        </AppText>
        <IconButton icon={ChevronUp} variant="ghost" accessibilityLabel={t("templates.builder.closeEdit")} onPress={onClose} />
      </View>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <MiniField label={t("templates.builder.sets")}>
          <Stepper
            value={item.sets ?? "—"}
            onDecrement={() => onChange({ sets: stepCount(item.sets, -1, START.sets) })}
            onIncrement={() => onChange({ sets: stepCount(item.sets, 1, START.sets) })}
            decrementLabel={dec}
            incrementLabel={inc}
          />
        </MiniField>
        <MiniField label={t("templates.builder.reps")}>
          <Stepper
            value={item.reps ?? "—"}
            onDecrement={() => onChange({ reps: stepCount(item.reps, -1, START.reps) })}
            onIncrement={() => onChange({ reps: stepCount(item.reps, 1, START.reps) })}
            onSet={(n) => onChange({ reps: Math.max(1, Math.round(n)) })}
            typeHint={typeHint}
            decrementLabel={dec}
            incrementLabel={inc}
          />
        </MiniField>
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <MiniField label={t("templates.builder.weight")}>
          <Stepper
            value={item.weight != null ? formatWeight(item.weight) : "—"}
            unit={item.weight != null ? t("templates.builder.kg") : undefined}
            // The workout's steps: 1 kg under 10 kg, 2.5 kg from there; 0 = no target.
            onDecrement={() => {
              if (item.weight == null) return;
              const w = stepWeight(item.weight, -1);
              onChange({ weight: w > 0 ? w : null });
            }}
            onIncrement={() => onChange({ weight: stepWeight(item.weight ?? 0, 1) })}
            onSet={(n) => onChange({ weight: n > 0 ? Math.round(n * 100) / 100 : null })}
            decimal
            typeHint={typeHint}
            decrementLabel={dec}
            incrementLabel={inc}
          />
        </MiniField>
        <MiniField label={t("templates.builder.rest")}>
          <Stepper
            value={item.rest != null ? formatClock(item.rest * 1000) : "—"}
            onDecrement={() =>
              onChange({ rest: item.rest == null ? null : Math.max(0, item.rest - REST_STEP) })
            }
            onIncrement={() => onChange({ rest: item.rest == null ? START.rest : item.rest + REST_STEP })}
            decrementLabel={dec}
            incrementLabel={inc}
          />
        </MiniField>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <View style={{ flexDirection: "row", gap: 4 }}>
          <IconButton
            icon={ArrowUp}
            variant="soft"
            accessibilityLabel={t("templates.builder.moveUp")}
            onPress={() => onMove(-1)}
            disabled={disabled || index === 0}
          />
          <IconButton
            icon={ArrowDown}
            variant="soft"
            accessibilityLabel={t("templates.builder.moveDown")}
            onPress={() => onMove(1)}
            disabled={disabled || index === count - 1}
          />
        </View>
        <Button
          label={t("templates.builder.remove")}
          icon={Trash}
          variant="danger"
          size={44}
          disabled={disabled}
          onPress={onRemove}
        />
      </View>
    </View>
  );
}

function MiniField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
      <AppText size={13} weight="semibold" tone="graphite">
        {label}
      </AppText>
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// The library, in a sheet
// ---------------------------------------------------------------------------

function ExercisePickerSheet({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (ex: { id: string; name: string; default_sets: number | null; default_reps: number | null }) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: qk.exercises.list,
    queryFn: async () => {
      const { data, error } = await supabase.from("exercises").select("*").order("name");
      if (error) throw error;
      return data;
    },
    enabled: visible, // only fetch when the sheet is open
  });

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter((e) => !q || e.name.toLowerCase().includes(q));
  }, [data, query]);

  return (
    <Sheet visible={visible} onClose={onClose} closeLabel={t("templates.builder.close")} title={t("templates.builder.pickTitle")}>
      <Input
        size="md"
        leadingIcon={Search}
        value={query}
        onChangeText={setQuery}
        placeholder={t("exercises.library.search")}
        accessibilityLabel={t("exercises.library.search")}
        autoCorrect={false}
      />
      <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
        {isLoading ? null : shown.length === 0 ? (
          <AppText size={14} tone="graphite" center style={{ paddingVertical: 24 }}>
            {t("templates.form.noExercisesInLibrary")}
          </AppText>
        ) : (
          shown.map((e, i) => {
            const key = muscleKeyOf(e.muscle_group);
            const muscle = key ? t(`exercises.muscles.${key}`) : e.muscle_group?.trim() || null;
            const scheme =
              e.default_sets != null || e.default_reps != null
                ? ltr(`${e.default_sets ?? "—"} × ${e.default_reps ?? "—"}`)
                : null;
            const sub = [muscle, scheme].filter(Boolean).join(" · ");
            return (
              <View key={e.id}>
                {i > 0 ? <Divider inset={0} /> : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setQuery("");
                    onPick(e);
                  }}
                  style={({ pressed }) => ({
                    minHeight: 60,
                    paddingVertical: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText size={16} weight="semibold" numberOfLines={1}>
                      {e.name}
                    </AppText>
                    {sub ? (
                      <AppText size={13} tone="graphite" numberOfLines={1}>
                        {sub}
                      </AppText>
                    ) : null}
                  </View>
                  <Icon icon={Plus} size={20} color={colors.graphite} />
                </Pressable>
              </View>
            );
          })
        )}
      </ScrollView>
    </Sheet>
  );
}
