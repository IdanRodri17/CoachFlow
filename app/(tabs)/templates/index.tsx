// app/(tabs)/templates/index.tsx — the trainer's workout templates.
// Trainer-only (the tab is hidden for clients; we also guard here for safety).
//
// D29a: rebuilt to docs/design/screens/trainer-templates.html — the Library
// title with "+", the "תבניות | תרגילים" switch, search, and one card per
// template: exercise count and estimated minutes (Σ sets × (40 s + rest), as
// on the client's Today), its muscle groups, how many clients have upcoming
// workouts with it, and "קביעה" (the schedule form with this template
// already picked). Swipe, long-press or "⋯" for edit / duplicate / delete.

import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import CalendarPlus from "lucide-react-native/icons/calendar-plus";
import Copy from "lucide-react-native/icons/copy";
import EllipsisVertical from "lucide-react-native/icons/ellipsis-vertical";
import Pencil from "lucide-react-native/icons/pencil";
import Plus from "lucide-react-native/icons/plus";
import Search from "lucide-react-native/icons/search";
import Trash from "lucide-react-native/icons/trash";
import Users from "lucide-react-native/icons/users";

import { qk } from "@/lib/queryKeys";
import { RoleGate } from "@/components/RoleGate";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { muscleKeyOf } from "@/components/ExerciseForm";
import { ActionRow } from "@/components/ui/ActionRow";
import {
  AppText,
  Button,
  Card,
  Chip,
  colors,
  Display,
  Divider,
  Icon,
  IconButton,
  Input,
  Segmented,
} from "@/components/ui";

type TemplateCard = {
  id: string;
  name: string;
  exercises: number;
  minutes: number;
  muscles: string[];
  clients: number;
};

export default function TemplatesListScreen() {
  return (
    <RoleGate role="trainer">
      <TemplatesListScreenBody />
    </RoleGate>
  );
}

function TemplatesListScreenBody() {
  const router = useRouter();
  const { t } = useTranslation();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data, error, isSuccess } = useQuery({
    queryKey: qk.templates.cards,
    queryFn: async (): Promise<TemplateCard[]> => {
      const { data: tpls, error: tErr } = await supabase
        .from("workout_templates")
        .select("id, name")
        .order("created_at", { ascending: false });
      if (tErr) throw tErr;
      const ids = tpls.map((tpl) => tpl.id);
      if (ids.length === 0) return [];

      const [teRes, swRes] = await Promise.all([
        supabase.from("template_exercises").select("template_id, exercise_id, target_sets, rest_seconds").in("template_id", ids),
        // "Assigned" = has an upcoming workout with this template.
        supabase
          .from("scheduled_workouts")
          .select("template_id, client_id, managed_client_id")
          .in("template_id", ids)
          .eq("status", "scheduled")
          .gte("scheduled_date", todayISO()),
      ]);
      if (teRes.error) throw teRes.error;
      if (swRes.error) throw swRes.error;

      const exIds = [...new Set(teRes.data.map((te) => te.exercise_id))];
      const muscleOf = new Map<string, string | null>();
      if (exIds.length > 0) {
        const { data: exs, error: exErr } = await supabase.from("exercises").select("id, muscle_group").in("id", exIds);
        if (exErr) throw exErr;
        exs.forEach((e) => muscleOf.set(e.id, e.muscle_group));
      }

      return tpls.map((tpl) => {
        const tes = teRes.data.filter((te) => te.template_id === tpl.id);
        const seconds = tes.reduce((sum, te) => sum + (te.target_sets ?? 1) * (40 + (te.rest_seconds ?? 60)), 0);
        const muscles = [...new Set(tes.map((te) => muscleKeyOf(muscleOf.get(te.exercise_id))).filter(Boolean))] as string[];
        const subjects = new Set(
          swRes.data
            .filter((sw) => sw.template_id === tpl.id)
            .map((sw) => sw.client_id ?? `m:${sw.managed_client_id}`),
        );
        return {
          id: tpl.id,
          name: tpl.name,
          exercises: tes.length,
          minutes: Math.max(5, Math.round(seconds / 60 / 5) * 5),
          muscles: muscles.filter((m) => m !== "other").slice(0, 3),
          clients: subjects.size,
        };
      });
    },
  });

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [data, search]);

  const duplicate = useMutation({
    mutationFn: async (card: TemplateCard) => {
      const { data: src, error: sErr } = await supabase
        .from("workout_templates")
        .select("name, description, notes")
        .eq("id", card.id)
        .single();
      if (sErr) throw sErr;
      const { data: copy, error: cErr } = await supabase
        .from("workout_templates")
        .insert({
          trainer_id: session!.user.id,
          name: t("templates.list.copyName", { name: src.name }),
          description: src.description,
          notes: src.notes,
        })
        .select("id")
        .single();
      if (cErr) throw cErr;
      const { data: tes, error: teErr } = await supabase
        .from("template_exercises")
        .select("exercise_id, position, target_sets, target_reps, target_weight, rest_seconds")
        .eq("template_id", card.id);
      if (teErr) throw teErr;
      if (tes.length > 0) {
        const { error } = await supabase.from("template_exercises").insert(tes.map((te) => ({ ...te, template_id: copy.id })));
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.templates.all }),
    onError: (e) => Alert.alert((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      // template_exercises cascade-delete with the template.
      const { error } = await supabase.from("workout_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.templates.all }),
    onError: (e) => Alert.alert((e as Error).message),
  });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.chalk }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 24, gap: 18 }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <Display size={44}>{t("exercises.library.title")}</Display>
        <IconButton
          icon={Plus}
          variant="primary"
          size={48}
          shape="square"
          accessibilityLabel={t("templates.list.newTitle")}
          onPress={() => router.push("/templates/new")}
        />
      </View>

      <Segmented
        value="templates"
        onChange={(v) => {
          if (v === "exercises") router.navigate("/exercises");
        }}
        options={[
          { value: "templates", label: t("exercises.library.templatesTab") },
          { value: "exercises", label: t("exercises.library.exercisesTab") },
        ]}
      />

      <Input
        size="md"
        leadingIcon={Search}
        value={search}
        onChangeText={setSearch}
        placeholder={t("templates.list.search")}
        accessibilityLabel={t("templates.list.search")}
        autoCorrect={false}
        returnKeyType="search"
      />

      {error ? (
        <AppText size={14} tone="ember">
          {(error as Error).message}
        </AppText>
      ) : null}

      {isSuccess && (data ?? []).length === 0 ? (
        <Card style={{ gap: 4 }}>
          <AppText size={16} weight="semibold">
            {t("templates.list.emptyTitle")}
          </AppText>
          <AppText size={14} tone="graphite">
            {t("templates.list.emptyHint")}
          </AppText>
        </Card>
      ) : null}

      <View style={{ gap: 12 }}>
        {shown.map((card) => (
          <ActionRow
            key={card.id}
            sheetTitle={card.name}
            actions={[
              {
                key: "edit",
                label: t("templates.list.edit"),
                icon: Pencil,
                tone: "edit",
                onPress: () => router.push(`/templates/${card.id}`),
              },
              {
                key: "duplicate",
                label: t("templates.list.duplicate"),
                icon: Copy,
                tone: "neutral",
                onPress: () => duplicate.mutate(card),
              },
              {
                key: "delete",
                label: t("templates.detail.delete"),
                icon: Trash,
                tone: "delete",
                onPress: () => remove.mutate(card.id),
                confirm: {
                  title: t("templates.detail.deleteTitle"),
                  message: t("templates.detail.deleteMessage"),
                  confirmLabel: t("templates.detail.delete"),
                },
              },
            ]}
          >
            {(openMenu) => (
              <TemplateCardView
                card={card}
                onOpen={() => router.push(`/templates/${card.id}`)}
                onMenu={openMenu}
                onSchedule={() => router.push({ pathname: "/schedule/new", params: { templateId: card.id } })}
              />
            )}
          </ActionRow>
        ))}
      </View>
    </ScrollView>
  );
}

function TemplateCardView({
  card,
  onOpen,
  onMenu,
  onSchedule,
}: {
  card: TemplateCard;
  onOpen: () => void;
  onMenu: () => void;
  onSchedule: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card style={{ padding: 12, gap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          onPress={onOpen}
          style={({ pressed }) => ({ flex: 1, gap: 4, opacity: pressed ? 0.6 : 1 })}
        >
          <AppText size={18} weight="semibold" lineHeight={24}>
            {card.name}
          </AppText>
          <AppText size={14} tone="graphite">
            {card.exercises > 0
              ? t("today.exercisesMinutes", { count: card.exercises, minutes: card.minutes })
              : t("templates.list.noExercises")}
          </AppText>
        </Pressable>
        <IconButton icon={EllipsisVertical} variant="ghost" accessibilityLabel={t("templates.list.more")} onPress={onMenu} />
      </View>

      {card.muscles.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {card.muscles.map((m) => (
            <Chip key={m} kind="neutral" label={t(`exercises.muscles.${m}`)} />
          ))}
        </View>
      ) : null}

      <Divider inset={0} />

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}>
          <Icon icon={Users} size={16} color={colors.graphite} />
          <AppText size={13} tone="graphite" numberOfLines={1}>
            {t("templates.list.clients", { count: card.clients })}
          </AppText>
        </View>
        <Button label={t("templates.list.schedule")} icon={CalendarPlus} variant="secondary" size={44} onPress={onSchedule} />
      </View>
    </Card>
  );
}
