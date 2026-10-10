// app/(tabs)/nutrition.tsx — the client's AI nutrition plan tab (V15 follow-up).
//
// Was a Profile > "Nutrition plan" link out to app/nutrition-plan.tsx; promoted
// to its own first-class tab (Check-in moved into the Progress tab to make room —
// see app/(tabs)/progress.tsx).
//
// D28b: rebuilt to docs/design/screens/client-nutrition.html — "תזונה", who
// it's from and when; the daily targets the trainer set (calories + protein,
// carbs and fat tiles, from nutrition_plans.targets); the day's meals as
// cards; the disclaimer; and "שאלה ל{trainer} בוואטסאפ" (the trainer's phone
// from rpc my_trainer — hidden without one). The plan is stored as plain text
// (supabase/functions/nutrition-suggest); lib/nutritionPlan.ts reads it into
// meals with their kcal and macros, the disclaimer line moves to the footer,
// and a plan that reads as no meals shows as plain text.

import { Linking, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Info from "lucide-react-native/icons/info";
import MessageCircle from "lucide-react-native/icons/message-circle";

import { qk } from "@/lib/queryKeys";
import { RoleGate } from "@/components/RoleGate";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { toDateString } from "@/lib/dates";
import { trainerFirstName, useMyTrainer } from "@/lib/useMyTrainer";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { parsePlan, type PlanMeal } from "@/lib/nutritionPlan";
import { formatMoney } from "@/components/home/format";
import { AppText, Button, Card, colors, Display, Icon, Num } from "@/components/ui";

type Targets = { calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number };

export default function NutritionScreen() {
  return (
    <RoleGate role="client">
      <NutritionScreenBody />
    </RoleGate>
  );
}

function NutritionScreenBody() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const trainer = useMyTrainer();
  const trainerName = trainerFirstName(trainer.data);

  const nutritionPlan = useQuery({
    queryKey: qk.nutritionPlan.latest(session?.user.id),
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nutrition_plans")
        .select("plan_markdown, targets, created_at")
        .eq("client_id", session!.user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const plan = nutritionPlan.data;
  const meals = plan ? parsePlan(plan.plan_markdown).meals : [];
  const targets = (plan?.targets ?? {}) as Targets;
  const updated = plan ? toDateString(new Date(plan.created_at)) : null;
  const wa =
    trainer.data?.phone && trainerName
      ? buildWhatsAppLink(trainer.data.phone, t("nutrition.waQuestion", { name: trainerName }))
      : null;
  const num = (n: number | undefined) => (n != null && Number.isFinite(n) ? formatMoney(n, i18n.language) : "—");

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.chalk }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 30, gap: 20 }}
    >
      <View style={{ gap: 6 }}>
        <Display size={44}>{t("nutrition.title")}</Display>
        {updated ? (
          <AppText size={14} tone="graphite">
            {trainerName
              ? t("nutrition.fromTrainer", { name: trainerName, date: `${Number(updated.slice(8, 10))}.${Number(updated.slice(5, 7))}` })
              : t("nutrition.updated", { date: `${Number(updated.slice(8, 10))}.${Number(updated.slice(5, 7))}` })}
          </AppText>
        ) : null}
      </View>

      {nutritionPlan.error ? (
        <AppText size={14} tone="ember">
          {(nutritionPlan.error as Error).message}
        </AppText>
      ) : null}

      {plan ? (
        <>
          {targets.calories != null ? (
            <Card style={{ padding: 14, gap: 16 }}>
              <View style={{ gap: 2 }}>
                <AppText size={14} weight="medium" tone="graphite">
                  {t("nutrition.dailyTarget")}
                </AppText>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                  <Num size={52}>{num(targets.calories)}</Num>
                  <AppText size={16} tone="graphite">
                    {t("nutrition.kcal")}
                  </AppText>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Macro value={num(targets.protein_g)} label={t("nutrition.protein")} />
                <Macro value={num(targets.carbs_g)} label={t("nutrition.carbs")} />
                <Macro value={num(targets.fat_g)} label={t("nutrition.fat")} />
              </View>
            </Card>
          ) : null}

          <View style={{ gap: 10 }}>
            <View style={{ minHeight: 32, justifyContent: "center" }}>
              <AppText size={18} weight="semibold" lineHeight={23}>
                {t("nutrition.oneDay")}
              </AppText>
            </View>
            {meals.length > 0 ? (
              meals.map((m, i) => <MealCard key={i} meal={m} />)
            ) : (
              <Card style={{ padding: 14 }}>
                <AppText size={16} lineHeight={24}>
                  {plan.plan_markdown}
                </AppText>
              </Card>
            )}
          </View>
        </>
      ) : nutritionPlan.isSuccess ? (
        <Card style={{ gap: 4 }}>
          <AppText size={16} weight="semibold">
            {t("nutrition.noneTitle")}
          </AppText>
          <AppText size={14} tone="graphite">
            {trainerName ? t("nutrition.noneHintName", { name: trainerName }) : t("profile.nutritionPlanNoneYet")}
          </AppText>
        </Card>
      ) : null}

      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        <View style={{ paddingTop: 2 }}>
          <Icon icon={Info} size={18} color={colors.smoke} />
        </View>
        <AppText size={13} lineHeight={20} tone="graphite" style={{ flex: 1 }}>
          {t("nutrition.disclaimer")}
        </AppText>
      </View>

      {wa ? (
        <Button
          label={t("nutrition.askOnWhatsApp", { name: trainerName })}
          icon={MessageCircle}
          variant="secondary"
          size={52}
          block
          onPress={() => Linking.openURL(wa)}
        />
      ) : null}
    </ScrollView>
  );
}

function MealCard({ meal }: { meal: PlanMeal }) {
  const { t } = useTranslation();
  const hasMacros = meal.protein != null && meal.carbs != null && meal.fat != null;
  return (
    <Card style={{ padding: 14, gap: 8 }}>
      {meal.title || meal.kcal != null ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <AppText size={14} weight="semibold" tone="graphite" style={{ flexShrink: 1 }}>
            {meal.title}
          </AppText>
          {meal.kcal != null ? (
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
              <Num size={20} weight="semibold">
                {String(meal.kcal)}
              </Num>
              <AppText size={13} tone="graphite">
                {t("nutrition.kcal")}
              </AppText>
            </View>
          ) : null}
        </View>
      ) : null}
      <AppText size={16} lineHeight={24}>
        {meal.items.join(", ")}
      </AppText>
      {hasMacros ? (
        <AppText size={13} tone="graphite">
          {t("nutrition.mealMacros", { protein: meal.protein, carbs: meal.carbs, fat: meal.fat })}
        </AppText>
      ) : null}
    </Card>
  );
}

function Macro({ value, label }: { value: string; label: string }) {
  const { t } = useTranslation();
  return (
    <View style={{ flex: 1, gap: 4, padding: 12, borderRadius: 16, backgroundColor: colors.chalk }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 3 }}>
        <Num size={26}>{value}</Num>
        <AppText size={13} tone="graphite">
          {t("nutrition.grams")}
        </AppText>
      </View>
      <AppText size={13} tone="graphite">
        {label}
      </AppText>
    </View>
  );
}
