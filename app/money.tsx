// app/money.tsx — V13b: all-clients monthly money summary.
//
// Opened by tapping the Home money card. Month by month (current + up to 12
// back), the aggregate across ALL clients — reads the same trainer_monthly_money
// view as the Home card (0014_money.sql), just more rows. No new SQL: months
// with zero scheduled_workouts activity simply never appear as a row (the
// view is grouped from scheduled_workouts), so there's nothing to filter out
// in app code either. Per-client breakdown/export is deliberately out of
// scope for now.

import { Redirect } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { DEFAULT_TIME_ZONE, todayISO } from "@/lib/dates";
import { formatMoney, MoneyStat } from "@/app/(tabs)/index";

function monthLabel(monthISO: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "he" ? "he" : "en", {
    year: "numeric",
    month: "long",
    timeZone: DEFAULT_TIME_ZONE,
  }).format(new Date(`${monthISO}T12:00:00Z`));
}

export default function MoneyScreen() {
  const { t, i18n } = useTranslation();
  const { session, profile } = useAuth();

  if (profile && profile.role !== "trainer") return <Redirect href="/" />;
  const trainerId = session!.user.id;
  const currentMonthKey = `${todayISO().slice(0, 7)}-01`;

  const history = useQuery({
    queryKey: ["trainer-monthly-money-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trainer_monthly_money")
        .select("*")
        .eq("trainer_id", trainerId)
        .order("month", { ascending: false })
        .limit(13);
      if (error) throw error;
      return data;
    },
  });

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["bottom"]}>
      <ScrollView contentContainerClassName="px-6 py-6">
        <Text className="w-full text-left text-2xl font-bold text-slate-900">{t("money.title")}</Text>

        {history.error ? (
          <Text className="mt-3 w-full text-left text-sm text-red-600">
            {(history.error as Error).message}
          </Text>
        ) : history.data && history.data.length > 0 ? (
          <View className="mt-4 gap-3">
            {history.data.map((row) => {
              const isCurrent = row.month === currentMonthKey;
              return (
                <View
                  key={row.month}
                  className={`rounded-2xl border p-4 ${isCurrent ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}
                >
                  <Text className="w-full text-left text-base font-bold text-slate-900">
                    {monthLabel(row.month, i18n.language)}
                  </Text>
                  <Text className="mt-0.5 w-full text-left text-xs text-slate-400">
                    {t("money.sessionsCompleted", { count: row.sessions_completed })}
                  </Text>
                  <View className="mt-3 flex-row gap-4">
                    <MoneyStat label={t("money.earned")} value={formatMoney(row.earned, i18n.language)} />
                    <MoneyStat label={t("money.collected")} value={formatMoney(row.paid_amount, i18n.language)} />
                    <MoneyStat
                      label={t("money.outstanding")}
                      value={formatMoney(row.unpaid, i18n.language)}
                      accent
                    />
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <Text className="mt-4 w-full text-left text-sm text-slate-400">{t("money.noHistoryYet")}</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
