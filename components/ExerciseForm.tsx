// components/ExerciseForm.tsx — the trainer's add/edit form for an exercise.
//
// Shared by the "new exercise" and "edit exercise" screens so the fields and
// validation live in one place. It keeps its own local text state, validates on
// submit, and calls onSubmit with a clean, DB-ready payload (numbers parsed,
// blanks turned into null).

import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";

import { isValidVideoUrl } from "@/lib/video";
import { directionalTextClassName, LTR_INPUT_STYLE } from "@/lib/i18n";

// The cleaned shape we hand back to the screen (ready for supabase insert/update).
export type ExerciseInput = {
  name: string;
  description: string | null;
  muscle_group: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  default_sets: number | null;
  default_reps: number | null;
};

// Pre-fill values when editing (all optional / strings for the text inputs).
export type ExerciseFormInitial = {
  name?: string;
  description?: string | null;
  muscle_group?: string | null;
  video_url?: string | null;
  thumbnail_url?: string | null;
  default_sets?: number | null;
  default_reps?: number | null;
};

function toText(value: string | number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

// Empty string -> null; otherwise the trimmed string.
function nullable(value: string): string | null {
  const v = value.trim();
  return v.length === 0 ? null : v;
}

// Empty -> null; otherwise a parsed non-negative integer (or null if not a number).
function toIntOrNull(value: string): number | null {
  const v = value.trim();
  if (v.length === 0) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

export function ExerciseForm({
  initial,
  submitLabel,
  submitting,
  onSubmit,
  errorMessage,
  header,
  footer,
}: {
  initial?: ExerciseFormInitial;
  submitLabel: string;
  submitting: boolean;
  onSubmit: (input: ExerciseInput) => void;
  errorMessage?: string | null;
  // Optional content rendered inside the scroll view, above the fields / below
  // the submit button (e.g. a video preview header, a delete button footer).
  header?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const [name, setName] = useState(toText(initial?.name));
  const [description, setDescription] = useState(toText(initial?.description));
  const [muscleGroup, setMuscleGroup] = useState(toText(initial?.muscle_group));
  const [videoUrl, setVideoUrl] = useState(toText(initial?.video_url));
  const [thumbnailUrl, setThumbnailUrl] = useState(toText(initial?.thumbnail_url));
  const [defaultSets, setDefaultSets] = useState(toText(initial?.default_sets));
  const [defaultReps, setDefaultReps] = useState(toText(initial?.default_reps));
  const [validationError, setValidationError] = useState<string | null>(null);
  const { t } = useTranslation();

  function handleSubmit() {
    if (name.trim().length === 0) {
      setValidationError(t("exercises.form.nameRequired"));
      return;
    }
    // video_url is optional, but if present it must be a YouTube/Vimeo link.
    if (videoUrl.trim().length > 0 && !isValidVideoUrl(videoUrl)) {
      setValidationError(t("exercises.form.videoUrlInvalid"));
      return;
    }
    setValidationError(null);
    onSubmit({
      name: name.trim(),
      description: nullable(description),
      muscle_group: nullable(muscleGroup),
      video_url: nullable(videoUrl),
      thumbnail_url: nullable(thumbnailUrl),
      default_sets: toIntOrNull(defaultSets),
      default_reps: toIntOrNull(defaultReps),
    });
  }

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerClassName="px-6 py-6"
      keyboardShouldPersistTaps="handled"
    >
      {header ? <View className="mb-5">{header}</View> : null}

      <Labeled label={t("exercises.form.nameLabel")}>
        <Input
          value={name}
          onChangeText={setName}
          placeholder={t("exercises.form.namePlaceholder")}
          editable={!submitting}
          className={directionalTextClassName()}
        />
      </Labeled>

      <Labeled label={t("exercises.form.muscleGroupLabel")}>
        <Input
          value={muscleGroup}
          onChangeText={setMuscleGroup}
          placeholder={t("exercises.form.muscleGroupPlaceholder")}
          editable={!submitting}
          className={directionalTextClassName()}
        />
      </Labeled>

      <Labeled label={t("exercises.form.descriptionLabel")}>
        <Input
          value={description}
          onChangeText={setDescription}
          placeholder={t("exercises.form.descriptionPlaceholder")}
          editable={!submitting}
          multiline
          className={directionalTextClassName()}
        />
      </Labeled>

      <Labeled label={t("exercises.form.videoUrlLabel")}>
        <Input
          value={videoUrl}
          onChangeText={setVideoUrl}
          placeholder="https://youtube.com/watch?v=…"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          editable={!submitting}
          style={LTR_INPUT_STYLE}
        />
      </Labeled>

      <Labeled label={t("exercises.form.thumbnailUrlLabel")}>
        <Input
          value={thumbnailUrl}
          onChangeText={setThumbnailUrl}
          placeholder="https://…"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          editable={!submitting}
          style={LTR_INPUT_STYLE}
        />
      </Labeled>

      <View className="flex-row gap-3">
        <View className="flex-1">
          <Labeled label={t("exercises.form.defaultSetsLabel")}>
            <Input
              value={defaultSets}
              onChangeText={setDefaultSets}
              placeholder="4"
              keyboardType="number-pad"
              editable={!submitting}
              style={LTR_INPUT_STYLE}
            />
          </Labeled>
        </View>
        <View className="flex-1">
          <Labeled label={t("exercises.form.defaultRepsLabel")}>
            <Input
              value={defaultReps}
              onChangeText={setDefaultReps}
              placeholder="8"
              keyboardType="number-pad"
              editable={!submitting}
              style={LTR_INPUT_STYLE}
            />
          </Labeled>
        </View>
      </View>

      {validationError || errorMessage ? (
        <Text className="mb-3 w-full text-left text-sm text-red-600">{validationError ?? errorMessage}</Text>
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
  );
}

// --- small presentational helpers ---
function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="mb-4">
      <Text className="mb-2 w-full text-left text-sm font-medium text-slate-700">{label}</Text>
      {children}
    </View>
  );
}

function Input({ className, ...props }: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      placeholderTextColor="#94a3b8"
      className={`rounded-xl border border-slate-300 px-4 py-3 text-base text-slate-900 ${className ?? ""}`}
      {...props}
    />
  );
}
