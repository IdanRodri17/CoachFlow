// components/ExerciseForm.tsx — the trainer's add/edit form for an exercise.
//
// Shared by the "new exercise" and "edit exercise" screens so the fields and
// validation live in one place. It keeps its own local state, validates on
// submit, and calls onSubmit with a clean, DB-ready payload (numbers parsed,
// blanks turned into null).
//
// D29b: rebuilt to docs/design/screens/trainer-exercise-edit.html — name,
// muscle group as chips (+ "אחר" → free text), the video link with a preview
// block, default sets / reps as mini steppers, cues (the description) and
// one save button. The props and the payload are unchanged; thumbnail_url has
// no field in the design, so an existing value is passed through untouched.

import { useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { LucideProps } from "lucide-react-native";
import Play from "lucide-react-native/icons/play";
import Plus from "lucide-react-native/icons/plus";

import i18next from "@/lib/i18n";
import { isValidVideoUrl, parseVideoUrl } from "@/lib/video";
import {
  AppText,
  Button,
  colors,
  FieldLabel,
  fonts,
  Icon,
  Input,
  SelectChip,
  Stepper,
} from "@/components/ui";

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

// Pre-fill values when editing.
export type ExerciseFormInitial = {
  name?: string;
  description?: string | null;
  muscle_group?: string | null;
  video_url?: string | null;
  thumbnail_url?: string | null;
  default_sets?: number | null;
  default_reps?: number | null;
};

/** The design's muscle-group chips. The DB keeps free text (the label in the
 * trainer's language, as before); these keys only drive the chips and the
 * list's filter. */
export const MUSCLE_KEYS = ["legs", "glutes", "back", "chest", "shoulders", "arms", "core", "other"] as const;
export type MuscleKey = (typeof MUSCLE_KEYS)[number];

/** Which chip a stored muscle_group belongs to, in either language. */
export function muscleKeyOf(value: string | null | undefined): MuscleKey | null {
  const v = value?.trim().toLowerCase();
  if (!v) return null;
  for (const k of MUSCLE_KEYS) {
    if (k === "other") continue;
    for (const lng of ["he", "en"]) {
      if (i18next.t(`exercises.muscles.${k}`, { lng }).toLowerCase() === v) return k;
    }
  }
  return "other";
}

function nullable(value: string): string | null {
  const v = value.trim();
  return v.length === 0 ? null : v;
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
  // the submit button (e.g. a video player header, a delete button footer).
  header?: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  const initialKey = muscleKeyOf(initial?.muscle_group);
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [muscle, setMuscle] = useState<MuscleKey | null>(initialKey);
  const [otherMuscle, setOtherMuscle] = useState(initialKey === "other" ? (initial?.muscle_group ?? "") : "");
  const [videoUrl, setVideoUrl] = useState(initial?.video_url ?? "");
  const [sets, setSets] = useState<number | null>(initial?.default_sets ?? null);
  const [reps, setReps] = useState<number | null>(initial?.default_reps ?? null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const video = parseVideoUrl(videoUrl);

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
    const muscleGroup =
      muscle === null ? null : muscle === "other" ? nullable(otherMuscle) : t(`exercises.muscles.${muscle}`);
    onSubmit({
      name: name.trim(),
      description: nullable(description),
      muscle_group: muscleGroup,
      video_url: nullable(videoUrl),
      thumbnail_url: initial?.thumbnail_url ?? null,
      default_sets: sets,
      default_reps: reps,
    });
  }

  // − below 1 clears the default; + from empty starts at 1.
  const step = (v: number | null, d: number) => {
    const next = (v ?? 0) + d;
    return next < 1 ? null : next;
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.chalk }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 30, gap: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        {header ? <View>{header}</View> : null}

        <View style={{ gap: 8 }}>
          <FieldLabel>{t("exercises.edit.name")}</FieldLabel>
          <Input
            size="md"
            value={name}
            onChangeText={setName}
            placeholder={t("exercises.form.namePlaceholder")}
            editable={!submitting}
            accessibilityLabel={t("exercises.edit.name")}
          />
        </View>

        <View style={{ gap: 8 }}>
          <FieldLabel>{t("exercises.edit.muscleGroup")}</FieldLabel>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {MUSCLE_KEYS.map((k) => (
              <SelectChip
                key={k}
                label={t(`exercises.muscles.${k}`)}
                icon={k === "other" ? Plus : undefined}
                selected={muscle === k}
                disabled={submitting}
                onPress={() => setMuscle(muscle === k ? null : k)}
              />
            ))}
          </View>
          {muscle === "other" ? (
            <Input
              size="md"
              value={otherMuscle}
              onChangeText={setOtherMuscle}
              placeholder={t("exercises.edit.otherPlaceholder")}
              editable={!submitting}
              accessibilityLabel={t("exercises.edit.otherPlaceholder")}
            />
          ) : null}
        </View>

        <View style={{ gap: 10 }}>
          <View style={{ gap: 8 }}>
            <FieldLabel>{t("exercises.edit.video")}</FieldLabel>
            <Input
              size="md"
              ltr
              value={videoUrl}
              onChangeText={setVideoUrl}
              placeholder="youtube.com/watch?v=…"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              editable={!submitting}
              accessibilityLabel={t("exercises.edit.video")}
            />
          </View>
          {video ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => Linking.openURL(videoUrl.trim())}
              style={({ pressed }) => ({
                height: 170,
                borderRadius: 18,
                backgroundColor: colors.ink,
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: colors.volt,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingStart: 4,
                }}
              >
                <Icon icon={FilledPlay} size={26} color={colors.ink} />
              </View>
              <AppText size={13} tone="ash" center>
                {t("exercises.edit.preview", { source: video.provider === "youtube" ? "YouTube" : "Vimeo" })}
              </AppText>
            </Pressable>
          ) : null}
        </View>

        <View style={{ gap: 8 }}>
          <FieldLabel>{t("exercises.edit.defaults")}</FieldLabel>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
              <AppText size={13} weight="semibold" tone="graphite">
                {t("exercises.edit.sets")}
              </AppText>
              <Stepper
                value={sets ?? "—"}
                onDecrement={() => setSets((v) => step(v, -1))}
                onIncrement={() => setSets((v) => step(v, 1))}
                decrementLabel={t("exercises.edit.decrease")}
                incrementLabel={t("exercises.edit.increase")}
                background={colors.mist}
              />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
              <AppText size={13} weight="semibold" tone="graphite">
                {t("exercises.edit.reps")}
              </AppText>
              <Stepper
                value={reps ?? "—"}
                onDecrement={() => setReps((v) => step(v, -1))}
                onIncrement={() => setReps((v) => step(v, 1))}
                decrementLabel={t("exercises.edit.decrease")}
                incrementLabel={t("exercises.edit.increase")}
                background={colors.mist}
              />
            </View>
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <FieldLabel>{t("exercises.edit.cues")}</FieldLabel>
          <Input
            size="md"
            multiline
            value={description}
            onChangeText={setDescription}
            placeholder={t("exercises.form.descriptionPlaceholder")}
            editable={!submitting}
            accessibilityLabel={t("exercises.edit.cues")}
            style={{ minHeight: 72, fontSize: 16, lineHeight: 24, fontFamily: fonts.regular }}
          />
        </View>

        {validationError || errorMessage ? (
          <AppText size={14} tone="ember">
            {validationError ?? errorMessage}
          </AppText>
        ) : null}

        <Button label={submitLabel} size={56} block loading={submitting} onPress={handleSubmit} />

        {footer ? <View>{footer}</View> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** The play mark is a filled triangle in the reference. */
function FilledPlay(props: LucideProps) {
  return <Play {...props} fill={props.color} />;
}
