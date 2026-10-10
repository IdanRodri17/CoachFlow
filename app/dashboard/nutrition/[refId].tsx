// app/dashboard/nutrition/[refId].tsx — D26a: the trainer's AI nutrition
// assistant for one client, moved out of the client card into its own screen
// (docs/design/screens/trainer-nutrition.html).
//
// Daily targets (calories + protein/carbs/fat, with a hint comparing the
// calories the macros add up to — protein×4 + carbs×4 + fat×9), preference
// chips, meals a day, "יצירת תפריט". The result shows as meal rows with kcal
// (lib/nutritionPlan.ts reads the plain text), then "שמירה ושיתוף" saves it to
// nutrition_plans — the client's Nutrition tab shows the latest — or
// "יצירה מחדש". Same V15 edge function (it only calls Claude; saving is this
// screen's own RLS-protected insert) and the same table. The function has no
// meals-a-day or diet fields, so both ride in its `preferences` text; the
// targets jsonb also keeps them (diet, meals) to pre-fill the next plan.
// Both client kinds: an offline client has no app, so it's just "שמירה".

import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import Info from "lucide-react-native/icons/info";
import Repeat from "lucide-react-native/icons/repeat";
import Share from "lucide-react-native/icons/share";
import Sparkles from "lucide-react-native/icons/sparkles";

import { qk } from "@/lib/queryKeys";
import { RoleGate } from "@/components/RoleGate";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { toDateString } from "@/lib/dates";
import { ltr } from "@/lib/i18n";
import { parsePlan } from "@/lib/nutritionPlan";
import { useRosterClients } from "@/lib/useRoster";
import { firstName, formatMoney } from "@/components/home/format";
import {
  AppText,
  Button,
  Card,
  Chip,
  colors,
  Divider,
  FieldLabel,
  Icon,
  IconButton,
  Input,
  Num,
  parseTypedNumber,
  Segmented,
  SelectChip,
} from "@/components/ui";

const DIETS = ["vegetarian", "vegan", "kosher", "glutenFree", "lactoseFree", "nutFree"] as const;
type Diet = (typeof DIETS)[number];
const MEAL_COUNTS = ["3", "4", "5"] as const;
type MealCount = (typeof MEAL_COUNTS)[number];

type SavedTargets = {
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  preferences?: string | null;
  diet?: string[];
  meals?: number;
};

export default function TrainerNutritionScreen() {
  return (
    <RoleGate role="trainer">
      <TrainerNutritionBody />
    </RoleGate>
  );
}

function TrainerNutritionBody() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refId, kind: kindParam } = useLocalSearchParams<{ refId: string; kind?: string }>();
  const kind: "app" | "managed" = kindParam === "managed" ? "managed" : "app";
  const { session } = useAuth();
  const trainerId = session!.user.id;

  const roster = useRosterClients(trainerId);
  const client = (roster.data ?? []).find((c) => c.kind === kind && c.refId === refId);

  const latest = useQuery({
    queryKey: qk.nutritionPlan.subject(kind, refId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nutrition_plans")
        .select("*")
        .eq("trainer_id", trainerId)
        .eq(kind === "app" ? "client_id" : "managed_client_id", refId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.chalk }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: insets.bottom + 30, gap: 18 }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <View style={{ height: 52, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <IconButton
          icon={ChevronLeft}
          mirror
          iconSize={22}
          accessibilityLabel={t("common.back")}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/clients"))}
        />
        <View style={{ flex: 1, minWidth: 0, alignItems: "center" }}>
          <AppText size={17} weight="semibold" center numberOfLines={1}>
            {t("nutritionAi.title")}
          </AppText>
          {client ? (
            <AppText size={13} weight="medium" tone="smoke" center numberOfLines={1}>
              {client.name}
            </AppText>
          ) : null}
        </View>
        <View style={{ width: 44 }} />
      </View>

      {latest.error ? (
        <AppText size={14} tone="ember">
          {(latest.error as Error).message}
        </AppText>
      ) : null}

      {/* Rendered once the last plan is known, so its targets pre-fill the form. */}
      {latest.isSuccess ? (
        <PlanForm
          key={latest.data?.id ?? "new"}
          kind={kind}
          refId={refId}
          trainerId={trainerId}
          clientName={client ? firstName(client.name) : null}
          saved={latest.data ?? null}
          onSaved={() => (router.canGoBack() ? router.back() : router.replace("/clients"))}
        />
      ) : null}
    </ScrollView>
  );
}

function PlanForm({
  kind,
  refId,
  trainerId,
  clientName,
  saved,
  onSaved,
}: {
  kind: "app" | "managed";
  refId: string;
  trainerId: string;
  clientName: string | null;
  saved: { plan_markdown: string; targets: unknown; created_at: string } | null;
  onSaved: () => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const prev = (saved?.targets ?? {}) as SavedTargets;
  const str = (n: number | undefined) => (n != null && Number.isFinite(n) ? String(n) : "");

  const [calories, setCalories] = useState(str(prev.calories));
  const [protein, setProtein] = useState(str(prev.protein_g));
  const [carbs, setCarbs] = useState(str(prev.carbs_g));
  const [fat, setFat] = useState(str(prev.fat_g));
  const [diets, setDiets] = useState<Diet[]>(
    (prev.diet ?? []).filter((d): d is Diet => (DIETS as readonly string[]).includes(d)),
  );
  const [note, setNote] = useState(prev.preferences ?? "");
  const [meals, setMeals] = useState<MealCount>(
    MEAL_COUNTS.find((m) => Number(m) === prev.meals) ?? "4",
  );
  const [suggestion, setSuggestion] = useState<string | null>(null);

  const kcal = parseTypedNumber(calories);
  const p = parseTypedNumber(protein);
  const c = parseTypedNumber(carbs);
  const f = parseTypedNumber(fat);
  const ready = kcal != null && p != null && c != null && f != null;
  const fmt = (n: number) => ltr(formatMoney(n, i18n.language));

  // protein and carbs 4 kcal a gram, fat 9 — "close" within 5% (at least 50).
  let hint = t("nutritionAi.macroHintEmpty");
  if (p != null && c != null && f != null) {
    const fromMacros = Math.round(p * 4 + c * 4 + f * 9);
    const diff = kcal != null ? fromMacros - kcal : 0;
    hint =
      kcal == null
        ? t("nutritionAi.macroHintOnly", { kcal: fmt(fromMacros) })
        : Math.abs(diff) <= Math.max(50, kcal * 0.05)
          ? t("nutritionAi.macroHintClose", { kcal: fmt(fromMacros) })
          : t(diff > 0 ? "nutritionAi.macroHintOver" : "nutritionAi.macroHintUnder", {
              kcal: fmt(fromMacros),
              diff: fmt(Math.abs(diff)),
            });
  }

  const preferencesText = () =>
    [
      diets.map((d) => t(`nutritionAi.diet.${d}`)).join(", "),
      t("nutritionAi.mealsPrompt", { count: Number(meals) }),
      note.trim(),
    ]
      .filter(Boolean)
      .join(". ");

  const suggest = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("nutrition-suggest", {
        body: { calories: kcal, protein_g: p, carbs_g: c, fat_g: f, preferences: preferencesText(), locale: i18n.language },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data.plan_markdown as string;
    },
    onSuccess: (plan) => setSuggestion(plan),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!suggestion) return;
      const targets = {
        calories: kcal,
        protein_g: p,
        carbs_g: c,
        fat_g: f,
        preferences: note.trim() || null,
        diet: diets,
        meals: Number(meals),
      };
      const subject = kind === "app" ? { client_id: refId } : { managed_client_id: refId };
      const { error } = await supabase
        .from("nutrition_plans")
        .insert({ trainer_id: trainerId, ...subject, targets, plan_markdown: suggestion });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.nutritionPlan.subject(kind, refId) });
      onSaved();
    },
  });

  const shown = suggestion ?? saved?.plan_markdown ?? null;
  const savedOn = saved ? toDateString(new Date(saved.created_at)) : null;
  const macroInput = { height: 48, minHeight: 48 };

  return (
    <>
      <Card style={{ padding: 14, gap: 16 }}>
        <AppText size={18} weight="semibold" lineHeight={23}>
          {t("nutritionAi.targetsTitle")}
        </AppText>
        <View style={{ gap: 8 }}>
          <FieldLabel>{t("nutritionAi.calories")}</FieldLabel>
          <Input
            size="md"
            ltr="start"
            keyboardType="number-pad"
            value={calories}
            onChangeText={setCalories}
            suffix={t("nutrition.kcal")}
            accessibilityLabel={t("nutritionAi.calories")}
          />
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(
            [
              ["protein", protein, setProtein],
              ["carbs", carbs, setCarbs],
              ["fat", fat, setFat],
            ] as const
          ).map(([key, value, set]) => (
            <View key={key} style={{ flex: 1, minWidth: 0, gap: 8 }}>
              <FieldLabel>{t(`nutrition.${key}`)}</FieldLabel>
              <Input
                size="md"
                ltr="start"
                keyboardType="number-pad"
                value={value}
                onChangeText={set}
                suffix={t("nutrition.grams")}
                containerStyle={macroInput}
                accessibilityLabel={t(`nutrition.${key}`)}
              />
            </View>
          ))}
        </View>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
          <View style={{ paddingTop: 1 }}>
            <Icon icon={Info} size={16} color={colors.graphite} />
          </View>
          <AppText size={13} tone="graphite" style={{ flex: 1 }}>
            {hint}
          </AppText>
        </View>
      </Card>

      <Card style={{ padding: 14, gap: 16 }}>
        <AppText size={18} weight="semibold" lineHeight={23}>
          {t("nutritionAi.prefsTitle")}
        </AppText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {DIETS.map((d) => (
            <SelectChip
              key={d}
              label={t(`nutritionAi.diet.${d}`)}
              selected={diets.includes(d)}
              onPress={() => setDiets((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))}
            />
          ))}
        </View>
        <Input
          size="md"
          value={note}
          onChangeText={setNote}
          maxLength={160}
          placeholder={t("nutritionAi.notePlaceholder")}
          accessibilityLabel={t("nutritionAi.notePlaceholder")}
        />
        <View style={{ gap: 8 }}>
          <FieldLabel>{t("nutritionAi.mealsPerDay")}</FieldLabel>
          <Segmented
            value={meals}
            onChange={setMeals}
            options={MEAL_COUNTS.map((m) => ({ value: m, label: ltr(m) }))}
          />
        </View>
      </Card>

      {!suggestion ? (
        <Button
          label={t("nutritionAi.generate")}
          icon={Sparkles}
          variant="accent"
          size={56}
          block
          loading={suggest.isPending}
          disabled={!ready || suggest.isPending}
          onPress={() => suggest.mutate()}
        />
      ) : null}
      {suggest.error ? (
        <AppText size={14} tone="ember">
          {(suggest.error as Error).message}
        </AppText>
      ) : null}

      {shown ? (
        <Card style={{ padding: 14, gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingBottom: 4 }}>
            <AppText size={18} weight="semibold" lineHeight={23} style={{ flexShrink: 1 }}>
              {suggestion ? t("nutritionAi.resultTitle") : t("nutritionAi.savedTitle")}
            </AppText>
            {suggestion ? (
              <Chip kind="done" icon={Sparkles} label={t("nutritionAi.justCreated")} />
            ) : savedOn ? (
              <Chip
                kind="neutral"
                label={t("nutritionAi.savedOn", { date: `${Number(savedOn.slice(8, 10))}.${Number(savedOn.slice(5, 7))}` })}
              />
            ) : null}
          </View>
          <MealRows plan={shown} />
          {suggestion ? (
            <View style={{ gap: 10, paddingTop: 12 }}>
              <Button
                label={
                  kind === "app" && clientName
                    ? t("nutritionAi.saveShare", { name: clientName })
                    : t("nutritionAi.saveOnly")
                }
                icon={Share}
                size={52}
                block
                loading={save.isPending}
                disabled={save.isPending || suggest.isPending}
                onPress={() => save.mutate()}
              />
              <Button
                label={t("nutritionAi.regenerate")}
                icon={Repeat}
                variant="secondary"
                size={48}
                block
                loading={suggest.isPending}
                disabled={save.isPending || suggest.isPending || !ready}
                onPress={() => suggest.mutate()}
              />
              {save.error ? (
                <AppText size={14} tone="ember">
                  {(save.error as Error).message}
                </AppText>
              ) : null}
            </View>
          ) : null}
        </Card>
      ) : null}

      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        <View style={{ paddingTop: 1 }}>
          <Icon icon={Info} size={18} color={colors.smoke} />
        </View>
        <AppText size={13} lineHeight={20} tone="graphite" style={{ flex: 1 }}>
          {kind === "app" && clientName
            ? t("nutritionAi.disclaimerName", { name: clientName })
            : t("nutritionAi.disclaimer")}
        </AppText>
      </View>
    </>
  );
}

/** The plan as meal rows: name · food · kcal, hairlines between. Falls back to
 * the plain text when nothing reads as a meal. */
function MealRows({ plan }: { plan: string }) {
  const { t } = useTranslation();
  const { meals } = parsePlan(plan);
  if (meals.length === 0) {
    return (
      <AppText size={15} lineHeight={22}>
        {plan}
      </AppText>
    );
  }
  return (
    <View>
      {meals.map((m, i) => (
        <View key={i}>
          {i > 0 ? <Divider inset={0} /> : null}
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12 }}>
            <AppText size={13} weight="semibold" tone="graphite" style={{ width: 64, paddingTop: 2 }}>
              {m.title}
            </AppText>
            <AppText size={15} lineHeight={22} style={{ flex: 1 }}>
              {m.items.join(", ")}
            </AppText>
            {m.kcal != null ? (
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 3 }}>
                <Num size={18} weight="semibold">
                  {String(m.kcal)}
                </Num>
                <AppText size={12} tone="graphite">
                  {t("nutrition.kcal")}
                </AppText>
              </View>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}
