// app/(tabs)/exercises/index.tsx — the exercise library list.
//
// Trainers add and edit exercises; clients browse the same list read-only and
// open one to watch the video. RLS decides what each role can see.
//
// D29b: rebuilt to docs/design/screens/trainer-exercises.html — title, the
// "תבניות | תרגילים" switch (trainers: this tab is the Library), search, muscle
// filter chips and rows with a thumbnail (volt play mark when there's a video).

import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { LucideProps } from "lucide-react-native";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Dumbbell from "lucide-react-native/icons/dumbbell";
import Play from "lucide-react-native/icons/play";
import Plus from "lucide-react-native/icons/plus";
import Search from "lucide-react-native/icons/search";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { ltr } from "@/lib/i18n";
import { MUSCLE_KEYS, muscleKeyOf } from "@/components/ExerciseForm";
import {
  AppText,
  Card,
  colors,
  Display,
  Icon,
  IconButton,
  Input,
  ListCard,
  Segmented,
  SelectChip,
} from "@/components/ui";

export default function ExercisesListScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const isTrainer = profile?.role === "trainer";
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [muscle, setMuscle] = useState<string | null>(null);

  const { data, error, isSuccess } = useQuery({
    queryKey: ["exercises"],
    queryFn: async () => {
      const { data, error } = await supabase.from("exercises").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter(
      (e) => (!q || e.name.toLowerCase().includes(q)) && (!muscle || muscleKeyOf(e.muscle_group) === muscle),
    );
  }, [data, search, muscle]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.chalk }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 24, gap: 18 }}
    >
      <View style={{ paddingHorizontal: 20, gap: 18 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
          <Display size={44}>{isTrainer ? t("exercises.library.title") : t("exercises.library.clientTitle")}</Display>
          {isTrainer ? (
            <IconButton
              icon={Plus}
              variant="primary"
              size={48}
              shape="square"
              accessibilityLabel={t("exercises.library.newExercise")}
              onPress={() => router.push("/exercises/new")}
            />
          ) : null}
        </View>

        {isTrainer ? (
          <Segmented
            value="exercises"
            onChange={(v) => {
              if (v === "templates") router.navigate("/templates");
            }}
            options={[
              { value: "templates", label: t("exercises.library.templatesTab") },
              { value: "exercises", label: t("exercises.library.exercisesTab") },
            ]}
          />
        ) : null}

        <Input
          size="md"
          leadingIcon={Search}
          value={search}
          onChangeText={setSearch}
          placeholder={t("exercises.library.search")}
          accessibilityLabel={t("exercises.library.search")}
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
      >
        <SelectChip label={t("exercises.library.all")} selected={muscle === null} onPress={() => setMuscle(null)} />
        {MUSCLE_KEYS.filter((k) => k !== "other").map((k) => (
          <SelectChip
            key={k}
            label={t(`exercises.muscles.${k}`)}
            selected={muscle === k}
            onPress={() => setMuscle(muscle === k ? null : k)}
          />
        ))}
      </ScrollView>

      <View style={{ paddingHorizontal: 20 }}>
        {error ? (
          <AppText size={14} tone="ember">
            {(error as Error).message}
          </AppText>
        ) : null}

        {shown.length > 0 ? (
          <ListCard>
            {shown.map((e) => {
              const scheme =
                e.default_sets != null || e.default_reps != null
                  ? `${e.default_sets ?? "—"} × ${e.default_reps ?? "—"}`
                  : null;
              const sub = [e.muscle_group, scheme ? ltr(scheme) : null].filter(Boolean).join(" · ");
              return (
                <Pressable
                  key={e.id}
                  accessibilityRole="button"
                  onPress={() => router.push(`/exercises/${e.id}`)}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    minHeight: 76,
                    backgroundColor: pressed ? colors.chalk : undefined,
                  })}
                >
                  <View
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 14,
                      backgroundColor: e.video_url ? colors.ink : colors.mist,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {e.video_url ? (
                      <Icon icon={FilledPlay} size={22} color={colors.volt} />
                    ) : (
                      <Icon icon={Dumbbell} size={22} color={colors.graphite} />
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <AppText size={16} weight="semibold" numberOfLines={1}>
                      {e.name}
                    </AppText>
                    {sub ? (
                      <AppText size={13} tone="graphite" numberOfLines={1}>
                        {sub}
                      </AppText>
                    ) : null}
                  </View>
                  <Icon icon={ChevronRight} size={20} color={colors.smoke} mirror />
                </Pressable>
              );
            })}
          </ListCard>
        ) : isSuccess ? (
          <Card style={{ gap: 4 }}>
            <AppText size={16} weight="semibold">
              {(data ?? []).length === 0 ? t("exercises.list.emptyTitle") : t("exercises.library.noMatches")}
            </AppText>
            {(data ?? []).length === 0 ? (
              <AppText size={14} tone="graphite">
                {isTrainer ? t("exercises.list.emptyHintTrainer") : t("exercises.list.emptyHintClient")}
              </AppText>
            ) : null}
          </Card>
        ) : null}
      </View>
    </ScrollView>
  );
}

/** The video mark is a filled triangle in the reference. */
function FilledPlay(props: LucideProps) {
  return <Play {...props} fill={props.color} />;
}
