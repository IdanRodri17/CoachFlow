// app/money.tsx — V13b: all-clients monthly money summary.
//
// Opened by tapping the Home money card. Month by month, the aggregate across
// ALL clients — reads the same trainer_monthly_money view as the Home card
// (0014_money.sql), just more rows. Months with no scheduled_workouts never
// appear as a row in the view; the chart and table show them as zero.
//
// D27: rebuilt to docs/design/screens/trainer-money.html — the month hero
// (earned so far, a meter to the projection, collected + outstanding), the
// last six months as a column chart (the current month topped by its
// projection), "לא שולם" per client with "שולם" (marks every completed,
// unpaid session of that client paid) and a WhatsApp reminder, and the month
// table. The hero, chart and table come from trainer_monthly_money; the
// per-client list from lib/queries.ts owedQuery (completed unpaid × price).

import { Linking, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Check from "lucide-react-native/icons/check";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import MessageCircle from "lucide-react-native/icons/message-circle";

import { qk } from "@/lib/queryKeys";
import { owedQuery } from "@/lib/queries";
import { RoleGate } from "@/components/RoleGate";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { addMonths, DEFAULT_TIME_ZONE, todayISO } from "@/lib/dates";
import { ltr } from "@/lib/i18n";
import { useRosterClients } from "@/lib/useRoster";
import { usePullToRefresh } from "@/lib/usePullToRefresh";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { ColumnChart } from "@/components/ColumnChart";
import { firstName, formatMoney } from "@/components/home/format";
import { AppText, Avatar, Button, Card, colors, IconButton, ListCard, Meter, Num } from "@/components/ui";

const MONTHS = 6;

function fmtMonth(monthISO: string, locale: string, month: "long" | "short", year?: boolean) {
  return new Intl.DateTimeFormat(locale === "he" ? "he" : "en", {
    month,
    year: year ? "numeric" : undefined,
    timeZone: DEFAULT_TIME_ZONE,
  }).format(new Date(`${monthISO}T12:00:00Z`));
}

export default function MoneyScreen() {
  return (
    <RoleGate role="trainer">
      <MoneyScreenBody />
    </RoleGate>
  );
}

function MoneyScreenBody() {
  const { t, i18n } = useTranslation();
  const { session, profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const lang = i18n.language;
  const money = (n: number) => ltr(`₪${formatMoney(n, lang)}`);

  const trainerId = session!.user.id;
  const currentMonthKey = `${todayISO().slice(0, 7)}-01`;

  const history = useQuery({
    queryKey: qk.money.history,
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

  const roster = useRosterClients(trainerId);
  const owed = useQuery(owedQuery(trainerId));

  // "שולם": every completed, unpaid session of this client becomes paid.
  const markPaid = useMutation({
    mutationFn: async (key: string) => {
      let q = supabase
        .from("scheduled_workouts")
        .update({ paid: true })
        .eq("trainer_id", trainerId)
        .eq("status", "completed")
        .eq("paid", false);
      q = key.startsWith("m:") ? q.eq("managed_client_id", key.slice(2)) : q.eq("client_id", key);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.money.all });
      queryClient.invalidateQueries({ queryKey: qk.scheduledTrainer.owed });
      queryClient.invalidateQueries({ queryKey: qk.clientDetail.all });
    },
  });

  const refresh = usePullToRefresh([qk.money.all, qk.scheduledTrainer.owed, qk.roster.all]);

  // The last six months, oldest first; months missing from the view are zero.
  const rows = history.data ?? [];
  const months = Array.from({ length: MONTHS }, (_, i) => addMonths(currentMonthKey, i - (MONTHS - 1)));
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  const current = byMonth.get(currentMonthKey);
  const earned = current?.earned ?? 0;
  const projected = Math.max(current?.projected ?? 0, earned);

  const owedRows = [...(owed.data ?? new Map()).entries()]
    .filter(([, o]) => o.amount > 0)
    .map(([key, o]) => ({
      key,
      ...o,
      client: (roster.data ?? []).find((c) => (c.kind === "app" ? c.refId : `m:${c.refId}`) === key),
    }))
    .sort((a, b) => b.amount - a.amount);
  const owedTotal = owedRows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.chalk }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 30, gap: 18 }}
      refreshControl={<RefreshControl {...refresh} />}
    >
      <View style={{ height: 52, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <IconButton
          icon={ChevronLeft}
          mirror
          iconSize={22}
          accessibilityLabel={t("common.back")}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        />
        <AppText size={17} weight="semibold" center style={{ flex: 1 }}>
          {t("money.title")}
        </AppText>
        <View style={{ width: 44 }} />
      </View>

      {history.error ? (
        <AppText size={14} tone="ember">
          {(history.error as Error).message}
        </AppText>
      ) : null}

      {/* This month so far */}
      <Card style={{ padding: 12, gap: 16 }}>
        <AppText size={14} weight="medium" tone="graphite">
          {t("money.soFar", { month: fmtMonth(currentMonthKey, lang, "long", true) })}
        </AppText>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10 }}>
          <Num size={52}>{money(earned)}</Num>
          <AppText size={15} tone="graphite">
            {t("money.earnedLabel")}
          </AppText>
        </View>
        <Meter value={projected > 0 ? earned / projected : 0} height={10} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <AppText size={13} tone="graphite">
            {t("money.sessionsDone", { count: current?.sessions_completed ?? 0 })}
          </AppText>
          <AppText size={13} tone="graphite">
            {`${t("money.projectedLabel")} `}
            <AppText size={13} weight="semibold">
              {money(projected)}
            </AppText>
          </AppText>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1, gap: 4, padding: 12, borderRadius: 14, backgroundColor: colors.chalk }}>
            <AppText size={13} tone="graphite">
              {t("money.collected")}
            </AppText>
            <Num size={26}>{money(current?.paid_amount ?? 0)}</Num>
          </View>
          <View style={{ flex: 1, gap: 4, padding: 12, borderRadius: 14, backgroundColor: colors.goldSoft }}>
            <AppText size={13} weight="semibold" tone="gold">
              {t("money.outstanding")}
            </AppText>
            <Num size={26} tone="gold">
              {money(current?.unpaid ?? 0)}
            </Num>
          </View>
        </View>
        {current && current.clients_without_price > 0 ? (
          <AppText size={13} tone="smoke">
            {t("money.noPrice", { count: current.clients_without_price })}
          </AppText>
        ) : null}
      </Card>

      {/* Six months */}
      <Card style={{ padding: 12, gap: 16 }}>
        <View style={{ gap: 2 }}>
          <AppText size={18} weight="semibold" lineHeight={23}>
            {t("money.byMonthChart")}
          </AppText>
          <AppText size={13} tone="smoke">
            {t("money.chartHint", { count: MONTHS })}
          </AppText>
        </View>
        <ColumnChart
          accessibilityLabel={t("money.chartLabel", {
            from: fmtMonth(months[0], lang, "long"),
            to: fmtMonth(months[MONTHS - 1], lang, "long"),
          })}
          format={(n) => formatMoney(n, lang)}
          columns={months.map((m) => {
            const r = byMonth.get(m);
            const isCurrent = m === currentMonthKey;
            return {
              label: fmtMonth(m, lang, "short"),
              value: r?.earned ?? 0,
              cap: isCurrent ? Math.max(0, projected - earned) : undefined,
              current: isCurrent,
            };
          })}
        />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <Legend color={colors.ink} label={t("money.earnedLabel")} />
          <Legend color={colors.lineStrong} label={t("money.projectedLabel")} />
        </View>
      </Card>

      {/* Not paid, per client */}
      {owedRows.length > 0 ? (
        <View style={{ gap: 10 }}>
          <View style={{ minHeight: 32, justifyContent: "center" }}>
            <AppText size={18} weight="semibold" lineHeight={23}>
              {t("money.unpaidTitle")}
              <AppText size={18} weight="medium" tone="smoke">{` · ${money(owedTotal)}`}</AppText>
            </AppText>
          </View>
          <ListCard>
            {owedRows.map((r) => {
              const name = r.client?.name ?? "—";
              const wa = r.client?.phone
                ? buildWhatsAppLink(
                    r.client.phone,
                    t("money.waReminder", {
                      name: firstName(name),
                      count: r.count,
                      amount: `₪${formatMoney(r.amount, lang)}`,
                      trainer: profile?.display_name ?? "",
                    }),
                  )
                : null;
              return (
                <View
                  key={r.key}
                  style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, minHeight: 72 }}
                >
                  <Avatar id={r.client?.refId ?? r.key} name={name} size={40} />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <AppText size={16} weight="semibold" numberOfLines={1}>
                      {name}
                    </AppText>
                    <AppText size={13} tone="graphite">
                      {`${t("money.sessions", { count: r.count })} · `}
                      <AppText size={13} weight="bold" tone="gold">
                        {money(r.amount)}
                      </AppText>
                    </AppText>
                  </View>
                  <Button
                    label={t("money.markPaid")}
                    icon={Check}
                    variant="secondary"
                    size={44}
                    disabled={markPaid.isPending}
                    onPress={() => markPaid.mutate(r.key)}
                  />
                  {wa ? (
                    <IconButton
                      icon={MessageCircle}
                      accessibilityLabel={t("money.waReminderLabel")}
                      onPress={() => Linking.openURL(wa)}
                    />
                  ) : null}
                </View>
              );
            })}
          </ListCard>
        </View>
      ) : null}

      {/* The table */}
      <Card style={{ padding: 8, gap: 16 }}>
        <View style={{ paddingHorizontal: 4, paddingTop: 4 }}>
          <AppText size={18} weight="semibold" lineHeight={23}>
            {t("money.byMonth")}
          </AppText>
        </View>
        <View>
          <TableRow
            header
            cells={[t("money.colMonth"), t("money.colSessions"), t("money.colEarned"), t("money.colUnpaid")]}
          />
          {[...months].reverse().map((m) => {
            const r = byMonth.get(m);
            const unpaid = r?.unpaid ?? 0;
            return (
              <TableRow
                key={m}
                bold={m === currentMonthKey}
                cells={[
                  fmtMonth(m, lang, "short"),
                  String(r?.sessions_completed ?? 0),
                  money(r?.earned ?? 0),
                  unpaid > 0 ? money(unpaid) : "—",
                ]}
                unpaid={unpaid > 0}
              />
            );
          })}
        </View>
      </Card>
    </ScrollView>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} />
      <AppText size={12} tone="graphite">
        {label}
      </AppText>
    </View>
  );
}

function TableRow({
  cells,
  header,
  bold,
  unpaid,
}: {
  cells: string[];
  header?: boolean;
  bold?: boolean;
  unpaid?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        borderBottomWidth: 1,
        borderBottomColor: header ? colors.line : colors.mist,
        paddingVertical: header ? 10 : 12,
      }}
    >
      {cells.map((c, i) =>
        header || i === 0 ? (
          <AppText
            key={i}
            size={header ? 13 : 15}
            weight={header || bold ? "semibold" : "regular"}
            tone={header ? "graphite" : "ink"}
            style={{ flex: i === 0 ? 1.1 : 1, paddingHorizontal: 8 }}
          >
            {c}
          </AppText>
        ) : (
          <Num
            key={i}
            size={17}
            weight={bold ? "bold" : "semibold"}
            tone={i === 3 ? (unpaid ? "gold" : "smoke") : "ink"}
            style={{ flex: 1, paddingHorizontal: 8 }}
          >
            {c}
          </Num>
        ),
      )}
    </View>
  );
}
