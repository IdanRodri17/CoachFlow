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

import { isValidVideoUrl } from "@/lib/video";

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

  function handleSubmit() {
    if (name.trim().length === 0) {
      setValidationError("Name is required.");
      return;
    }
    // video_url is optional, but if present it must be a YouTube/Vimeo link.
    if (videoUrl.trim().length > 0 && !isValidVideoUrl(videoUrl)) {
      setValidationError("Video URL must be a YouTube or Vimeo link.");
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

      <Labeled label="Name *">
        <Input value={name} onChangeText={setName} placeholder="e.g. Back Squat" editable={!submitting} />
      </Labeled>

      <Labeled label="Muscle group">
        <Input value={muscleGroup} onChangeText={setMuscleGroup} placeholder="e.g. legs" editable={!submitting} />
      </Labeled>

      <Labeled label="Description">
        <Input
          value={description}
          onChangeText={setDescription}
          placeholder="Cues, setup, notes…"
          editable={!submitting}
          multiline
        />
      </Labeled>

      <Labeled label="Demo video URL (YouTube or Vimeo)">
        <Input
          value={videoUrl}
          onChangeText={setVideoUrl}
          placeholder="https://youtube.com/watch?v=…"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          editable={!submitting}
        />
      </Labeled>

      <Labeled label="Thumbnail URL (optional)">
        <Input
          value={thumbnailUrl}
          onChangeText={setThumbnailUrl}
          placeholder="https://…"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          editable={!submitting}
        />
      </Labeled>

      <View className="flex-row gap-3">
        <View className="flex-1">
          <Labeled label="Default sets">
            <Input value={defaultSets} onChangeText={setDefaultSets} placeholder="4" keyboardType="number-pad" editable={!submitting} />
          </Labeled>
        </View>
        <View className="flex-1">
          <Labeled label="Default reps">
            <Input value={defaultReps} onChangeText={setDefaultReps} placeholder="8" keyboardType="number-pad" editable={!submitting} />
          </Labeled>
        </View>
      </View>

      {validationError || errorMessage ? (
        <Text className="mb-3 text-sm text-red-600">{validationError ?? errorMessage}</Text>
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
