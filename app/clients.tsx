// app/clients.tsx — V14: add/manage clients.
//
// Moved off the Schedule tab (which is now a calendar, not a client-management
// hub) so scheduling stays the trainer's main focus. Reached from the tab
// bar's "מתאמנים".
//
// V18b: app clients join by INVITE, not by email. The trainer creates a
// single-use code (create_invite, 0020) and sends it on WhatsApp; the client
// types it into their own app (accept_invite) — that is the consent. The old
// add-by-email RPC let any trainer link any client without asking and is now
// revoked in the DB.
//
// D25: rebuilt to docs/design/screens/trainer-clients.html and
// trainer-add-client.html.
//   List: search, filter chips with counts (all · at risk · to pay · package
//   ending · no app), rows sorted attention-first with the next session,
//   status chips (risk and package from trainer_attention, money owed =
//   completed-unpaid sessions × the package price, no app, SMS / no phone)
//   and WhatsApp. Tap → the client card; swipe / long-press → phone, card,
//   WhatsApp. The phone still saves explicitly (V18b), now in a sheet, with
//   the same toE164IL validation, 05X… storage and saved / invalid / failed
//   states. Pending invites below (label, code, expiry, resend, cancel).
//   Add-client sheet: עם האפליקציה | בלי אפליקציה, name, phone, the hint,
//   price (pre-filled from profiles.default_price_per_session) and package
//   side by side. App client → create_invite with the price + package (B5,
//   accept_invite creates the package on consent) and WhatsApp with the code;
//   offline client → managed_clients + its package, then its card.

import { useMemo, useState } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import Info from "lucide-react-native/icons/info";
import MessageCircle from "lucide-react-native/icons/message-circle";
import Phone from "lucide-react-native/icons/phone";
import Search from "lucide-react-native/icons/search";
import Smartphone from "lucide-react-native/icons/smartphone";
import User from "lucide-react-native/icons/user";
import UserPlus from "lucide-react-native/icons/user-plus";
import X from "lucide-react-native/icons/x";

import { qk } from "@/lib/queryKeys";
import { attentionQuery } from "@/lib/queries";
import { RoleGate } from "@/components/RoleGate";
import { supabase } from "@/lib/supabase";
import { toE164IL, useAuth } from "@/lib/auth";
import { useRosterClients, type RosterClient } from "@/lib/useRoster";
import { usePullToRefresh } from "@/lib/usePullToRefresh";
import { addDays, formatDisplayDate, toDateString, todayISO } from "@/lib/dates";
import { ltr } from "@/lib/i18n";
import { buildWhatsAppInviteLink, buildWhatsAppLink } from "@/lib/whatsapp";
import { formatMoney, shortDate } from "@/components/home/format";
import { ActionRow } from "@/components/ui/ActionRow";
import {
  AppText,
  Avatar,
  Button,
  Card,
  Chip,
  colors,
  Display,
  FieldLabel,
  GroupLabel,
  Icon,
  IconButton,
  Input,
  ListCard,
  parseTypedNumber,
  Segmented,
  SelectChip,
  Sheet,
  SmartphoneOff,
} from "@/components/ui";

type Filter = "all" | "risk" | "unpaid" | "package" | "noApp";

type Row = {
  client: RosterClient;
  key: string;
  risk: string | null;
  /** Sessions left when the package is low or used up (trainer_attention). */
  packageLeft: number | null;
  usedUp: boolean;
  /** ₪ owed: completed, unpaid sessions × the package price. */
  unpaid: number;
  next: { date: string; time: string | null } | null;
};

const keyOf = (kind: "app" | "managed", refId: string) => (kind === "app" ? refId : `m:${refId}`);

/** "050-123-4567" → "0501234567" (the stored local form), or null if invalid. */
function localPhone(raw: string): string | null {
  const e164 = toE164IL(raw.trim());
  return e164 ? `0${e164.slice(4)}` : null;
}

export default function ClientsScreen() {
  return (
    <RoleGate role="trainer">
      <ClientsScreenBody />
    </RoleGate>
  );
}

function ClientsScreenBody() {
  const { t, i18n } = useTranslation();
  const { session, profile } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const trainerId = session!.user.id;
  const lang = i18n.language;

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState(false);
  const [phoneFor, setPhoneFor] = useState<RosterClient | null>(null);

  const roster = useRosterClients(trainerId);
  const attention = useQuery(attentionQuery);

  // Next session per client (client_workout_status, 0008).
  const status = useQuery({
    queryKey: qk.scheduledTrainer.clientStatus,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_workout_status")
        .select("client_id, managed_client_id, next_scheduled_date, next_scheduled_time")
        .eq("trainer_id", trainerId);
      if (error) throw error;
      return data;
    },
  });

  // Money owed per client: completed sessions not marked paid × the package's
  // price per session (no price → nothing owed is shown).
  const owed = useQuery({
    queryKey: qk.scheduledTrainer.owed,
    queryFn: async () => {
      const [unpaidRes, pkgRes] = await Promise.all([
        supabase
          .from("scheduled_workouts")
          .select("client_id, managed_client_id")
          .eq("trainer_id", trainerId)
          .eq("status", "completed")
          .eq("paid", false),
        supabase.from("packages").select("client_id, managed_client_id, price_per_session").eq("trainer_id", trainerId),
      ]);
      if (unpaidRes.error) throw unpaidRes.error;
      if (pkgRes.error) throw pkgRes.error;
      const price = new Map<string, number>();
      pkgRes.data.forEach((p) => {
        if (p.price_per_session != null) price.set(p.client_id ?? `m:${p.managed_client_id}`, p.price_per_session);
      });
      const out = new Map<string, number>();
      unpaidRes.data.forEach((w) => {
        const k = w.client_id ?? `m:${w.managed_client_id}`;
        const p = price.get(k);
        if (p != null) out.set(k, (out.get(k) ?? 0) + p);
      });
      return out;
    },
  });

  // Pending invites only: used ones have become roster rows, expired ones are
  // dead. expires_at is an instant, so comparing it to "now" in UTC is right
  // (no calendar-date logic here).
  const invites = useQuery({
    queryKey: qk.invites.byTrainer(trainerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_invites")
        .select("id, code, label, expires_at")
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const cancelInvite = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_invites").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.invites.all }),
  });

  const rows = useMemo((): Row[] => {
    const att = attention.data ?? [];
    return (roster.data ?? []).map((client) => {
      const key = keyOf(client.kind, client.refId);
      const mine = att.filter((a) => a.subject_key === key);
      const risk = mine.find((a) => a.kind === "risk")?.detail ?? null;
      const pkg = mine.find((a) => a.kind === "package_used_up" || a.kind === "package_low");
      const st = (status.data ?? []).find((s) => (s.client_id ?? `m:${s.managed_client_id}`) === key);
      return {
        client,
        key,
        risk,
        packageLeft: pkg ? (pkg.sessions_left ?? 0) : null,
        usedUp: pkg?.kind === "package_used_up",
        unpaid: owed.data?.get(key) ?? 0,
        next: st?.next_scheduled_date ? { date: st.next_scheduled_date, time: st.next_scheduled_time } : null,
      };
    });
  }, [roster.data, attention.data, status.data, owed.data]);

  const matches: Record<Filter, (r: Row) => boolean> = {
    all: () => true,
    risk: (r) => r.risk != null,
    unpaid: (r) => r.unpaid > 0,
    package: (r) => r.packageLeft != null,
    noApp: (r) => r.client.kind === "managed",
  };
  const q = search.trim().toLowerCase();
  const shown = rows
    .filter((r) => matches[filter](r) && (!q || r.client.name.toLowerCase().includes(q)))
    .sort((a, b) => {
      // Attention first: used up / at risk, then package ending, then owing.
      const rank = (r: Row) => (r.usedUp || r.risk ? 0 : r.packageLeft != null ? 1 : r.unpaid > 0 ? 2 : 3);
      const next = (r: Row) => (r.next ? `${r.next.date} ${r.next.time ?? "99"}` : "~");
      return rank(a) - rank(b) || next(a).localeCompare(next(b)) || a.client.name.localeCompare(b.client.name);
    });
  const offlineCount = rows.filter((r) => r.client.kind === "managed").length;

  const FILTERS: { value: Filter; label: string }[] = [
    { value: "all", label: t("clients.filter.all") },
    { value: "risk", label: t("clients.filter.risk") },
    { value: "unpaid", label: t("clients.filter.unpaid") },
    { value: "package", label: t("clients.filter.package") },
    { value: "noApp", label: t("clients.filter.noApp") },
  ];

  // Pull down: the roster, its statuses / money / attention (scheduled-trainer), invites.
  const refresh = usePullToRefresh([qk.roster.all, qk.scheduledTrainer.all, qk.invites.all]);

  function resend(code: string, label: string | null) {
    Linking.openURL(buildWhatsAppInviteLink({ code, label, trainerName: profile?.display_name ?? "" }));
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.chalk }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 30, gap: 18 }}
        refreshControl={<RefreshControl {...refresh} />}
      >
        <IconButton
          icon={ChevronLeft}
          mirror
          iconSize={22}
          accessibilityLabel={t("common.back")}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        />
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
          <View style={{ flex: 1, gap: 6 }}>
            <Display size={44}>{t("clients.title")}</Display>
            {rows.length > 0 ? (
              <AppText size={14} tone="graphite">
                {offlineCount > 0
                  ? `${t("clients.activeCount", { count: rows.length })} · ${t("clients.offlineCount", { count: offlineCount })}`
                  : t("clients.activeCount", { count: rows.length })}
              </AppText>
            ) : null}
          </View>
          <IconButton
            icon={UserPlus}
            variant="primary"
            size={48}
            shape="square"
            accessibilityLabel={t("clients.add.title")}
            onPress={() => setAdding(true)}
          />
        </View>

        <Input
          size="md"
          leadingIcon={Search}
          value={search}
          onChangeText={setSearch}
          placeholder={t("clients.search")}
          accessibilityLabel={t("clients.search")}
          autoCorrect={false}
          returnKeyType="search"
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={{ marginHorizontal: -20 }}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
        >
          {FILTERS.map((f) => (
            <SelectChip
              key={f.value}
              label={`${f.label} · ${rows.filter(matches[f.value]).length}`}
              selected={filter === f.value}
              onPress={() => setFilter(f.value)}
            />
          ))}
        </ScrollView>

        {roster.error ? (
          <AppText size={14} tone="ember">
            {(roster.error as Error).message}
          </AppText>
        ) : null}

        {shown.length > 0 ? (
          <ListCard>
            {shown.map((r) => (
              <ClientRow
                key={r.key}
                row={r}
                onOpen={() => router.push(`/dashboard/${r.client.refId}?kind=${r.client.kind}`)}
                onPhone={() => setPhoneFor(r.client)}
              />
            ))}
          </ListCard>
        ) : roster.isSuccess ? (
          <Card>
            <AppText size={15} tone="graphite">
              {rows.length === 0 ? t("clients.noClientsYet") : t("clients.noMatches")}
            </AppText>
          </Card>
        ) : null}

        {invites.data && invites.data.length > 0 ? (
          <View style={{ gap: 8 }}>
            <GroupLabel>{t("clients.pendingInvites")}</GroupLabel>
            <ListCard>
              {invites.data.map((inv) => (
                <View
                  key={inv.id}
                  style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 14, minHeight: 72 }}
                >
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <AppText size={16} weight="semibold" numberOfLines={1}>
                      {inv.label || t("clients.inviteNoName")}
                    </AppText>
                    <AppText size={13} tone="graphite">
                      {t("clients.inviteExpires", {
                        code: ltr(inv.code),
                        date: formatDisplayDate(toDateString(new Date(inv.expires_at)), lang === "he" ? "he" : "en"),
                      })}
                    </AppText>
                  </View>
                  <Button
                    label={t("clients.resendInvite")}
                    icon={MessageCircle}
                    variant="secondary"
                    size={44}
                    onPress={() => resend(inv.code, inv.label)}
                  />
                  <IconButton
                    icon={X}
                    accessibilityLabel={t("clients.cancelInvite")}
                    disabled={cancelInvite.isPending}
                    onPress={() => cancelInvite.mutate(inv.id)}
                  />
                </View>
              ))}
            </ListCard>
          </View>
        ) : null}
      </ScrollView>

      <AddClientSheet visible={adding} onClose={() => setAdding(false)} />
      <PhoneSheet client={phoneFor} onClose={() => setPhoneFor(null)} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// A roster row
// ---------------------------------------------------------------------------

function ClientRow({ row, onOpen, onPhone }: { row: Row; onOpen: () => void; onPhone: () => void }) {
  const { t, i18n } = useTranslation();
  const { client } = row;
  const today = todayISO();
  const wa = client.phone ? buildWhatsAppLink(client.phone, t("clients.waHello", { name: client.name.split(" ")[0] })) : null;

  let nextLine: string;
  if (row.next) {
    const day =
      row.next.date === today
        ? t("clients.today")
        : row.next.date === addDays(today, 1)
          ? t("clients.tomorrow")
          : shortDate(row.next.date, i18n.language);
    nextLine = t("clients.nextAt", { when: row.next.time ? `${day} ${ltr(row.next.time.slice(0, 5))}` : day });
  } else {
    nextLine = t("clients.noNext");
  }

  const actions = [
    { key: "card", label: t("clients.card"), icon: User, tone: "neutral" as const, onPress: onOpen },
    { key: "phone", label: t("clients.phone"), icon: Phone, tone: "edit" as const, onPress: onPhone },
    ...(wa ? [{ key: "wa", label: "WhatsApp", icon: MessageCircle, tone: "whatsapp" as const, onPress: () => Linking.openURL(wa) }] : []),
  ];

  return (
    <ActionRow actions={actions} sheetTitle={client.name}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, minHeight: 76 }}>
        <Pressable
          accessibilityRole="button"
          onPress={onOpen}
          style={({ pressed }) => ({ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 12, opacity: pressed ? 0.7 : 1 })}
        >
          <Avatar id={client.refId} name={client.name} size={44} />
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <AppText size={16} weight="semibold" numberOfLines={1}>
              {client.name}
            </AppText>
            <AppText size={14} tone={row.next ? "graphite" : "ember"} numberOfLines={1}>
              {nextLine}
            </AppText>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {row.risk ? (
                <Chip kind="risk" label={row.risk === "missed_streak" ? t("clients.chip.missedStreak") : t("clients.chip.goneQuiet")} />
              ) : null}
              {row.packageLeft != null ? (
                <Chip
                  kind={row.usedUp || row.packageLeft <= 0 ? "risk" : "lowPackage"}
                  label={
                    row.packageLeft > 0
                      ? t("clients.chip.packageLeft", { count: row.packageLeft })
                      : t("clients.chip.packageDone")
                  }
                />
              ) : null}
              {row.unpaid > 0 ? (
                <Chip kind="unpaid" label={t("clients.chip.unpaid", { amount: ltr(`₪${formatMoney(row.unpaid, i18n.language)}`) })} />
              ) : null}
              {client.kind === "managed" ? <Chip kind="noApp" label={t("trainerHome.noApp")} /> : null}
            </View>
          </View>
        </Pressable>
        {/* V18: reachability, derived from the saved phone; tap to add one. */}
        {client.phone ? (
          wa ? (
            <IconButton
              icon={MessageCircle}
              accessibilityLabel={t("clients.waTo", { name: client.name })}
              onPress={() => Linking.openURL(wa)}
            />
          ) : null
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel={t("clients.unreachable")} onPress={onPhone}>
            <Chip kind="unreachable" label={t("clients.chip.noPhone")} />
          </Pressable>
        )}
      </View>
    </ActionRow>
  );
}

// ---------------------------------------------------------------------------
// The phone sheet (V18b's explicit save, moved off the row)
// ---------------------------------------------------------------------------

function PhoneSheet({ client, onClose }: { client: RosterClient | null; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Sheet visible={client != null} onClose={onClose} closeLabel={t("common.cancel")} title={client?.name}>
      {client ? <PhoneEditor key={`${client.kind}-${client.refId}`} client={client} onDone={onClose} /> : null}
    </Sheet>
  );
}

function PhoneEditor({ client, onDone }: { client: RosterClient; onDone: () => void }) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState(client.phone ?? "");
  const [state, setState] = useState<"idle" | "invalid" | "error">("idle");

  // Trainer-entered contact phone (V11) — powers SMS reminders and WhatsApp.
  // Stored validated, in local 05X… form, or null to clear.
  const save = useMutation({
    mutationFn: async (value: string | null) => {
      if (client.kind === "app") {
        const { error } = await supabase
          .from("trainer_clients")
          .update({ contact_phone: value })
          .eq("trainer_id", session!.user.id)
          .eq("client_id", client.refId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("managed_clients").update({ phone: value }).eq("id", client.refId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.roster.all });
      onDone();
    },
    onError: () => setState("error"),
  });

  function submit() {
    const raw = phone.trim();
    if (!raw) return save.mutate(null);
    const normalized = localPhone(raw);
    if (!normalized) return setState("invalid");
    save.mutate(normalized);
  }

  return (
    <>
      <View style={{ gap: 8 }}>
        <FieldLabel>{t("clients.add.phone")}</FieldLabel>
        <Input
          size="md"
          ltr
          value={phone}
          onChangeText={(v) => {
            setPhone(v);
            setState("idle");
          }}
          placeholder="050-123-4567"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoFocus
          invalid={state === "invalid"}
          accessibilityLabel={t("clients.add.phone")}
        />
        <AppText size={13} tone={state === "idle" ? "graphite" : "ember"} lineHeight={19}>
          {state === "invalid"
            ? t("clients.invalidPhone")
            : state === "error"
              ? t("clients.phoneSaveFailed")
              : t("clients.phoneHint")}
        </AppText>
      </View>
      <Button label={t("common.save")} size={56} block loading={save.isPending} onPress={submit} />
    </>
  );
}

// ---------------------------------------------------------------------------
// The add-client sheet
// ---------------------------------------------------------------------------

function AddClientSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Sheet visible={visible} onClose={onClose} closeLabel={t("common.cancel")} title={t("clients.add.title")}>
      {visible ? <AddClientForm onDone={onClose} /> : null}
    </Sheet>
  );
}

function AddClientForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const { session, profile } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const trainerId = session!.user.id;

  const [kind, setKind] = useState<"app" | "managed">("app");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [price, setPrice] = useState(
    profile?.default_price_per_session != null ? String(profile.default_price_per_session) : "",
  );
  const [pack, setPack] = useState("");
  const [error, setError] = useState<string | null>(null);

  const priceNum = price.trim() ? parseTypedNumber(price) : null;
  const packNum = pack.trim() ? parseTypedNumber(pack) : null;

  /** Validates; returns the inputs or null (with the error shown). */
  function read(needPhone: boolean) {
    const phoneLocal = phone.trim() ? localPhone(phone) : null;
    if (phone.trim() && !phoneLocal) return fail(t("clients.invalidPhone"));
    if (needPhone && !phoneLocal) return fail(t("clients.add.phoneRequired"));
    if (kind === "managed" && !name.trim()) return fail(t("clients.add.nameRequired"));
    if (price.trim() && priceNum == null) return fail(t("clients.add.badPrice"));
    if (pack.trim() && (packNum == null || !Number.isInteger(packNum) || packNum < 1)) return fail(t("clients.add.badPackage"));
    // B5: a price lives on the package, so an invite needs both.
    if (kind === "app" && priceNum != null && packNum == null) return fail(t("clients.add.priceNeedsPackage"));
    setError(null);
    return { name: name.trim(), phone: phoneLocal, price: priceNum, pack: packNum };
  }
  function fail(message: string): null {
    setError(message);
    return null;
  }

  const invite = useMutation({
    mutationFn: async ({ input, direct }: { input: NonNullable<ReturnType<typeof read>>; direct: boolean }) => {
      const { data, error: e } = await supabase.rpc("create_invite", {
        p_label: input.name || null,
        p_price_per_session: input.price,
        p_package_sessions: input.pack,
      });
      if (e) throw e;
      return { invite: data, phone: direct ? input.phone : null };
    },
    onSuccess: ({ invite: inv, phone: to }) => {
      queryClient.invalidateQueries({ queryKey: qk.invites.all });
      Linking.openURL(
        buildWhatsAppInviteLink({ code: inv.code, label: inv.label, trainerName: profile?.display_name ?? "", phone: to }),
      );
      onDone();
    },
    onError: (e) => setError((e as Error).message),
  });

  const addOffline = useMutation({
    mutationFn: async (input: NonNullable<ReturnType<typeof read>>) => {
      const { data: mc, error: e1 } = await supabase
        .from("managed_clients")
        .insert({ trainer_id: trainerId, name: input.name, phone: input.phone })
        .select("id")
        .single();
      if (e1) throw e1;
      if (input.price != null || input.pack != null) {
        const { error: e2 } = await supabase.from("packages").insert({
          trainer_id: trainerId,
          managed_client_id: mc.id,
          price_per_session: input.price,
          ...(input.pack != null ? { total_sessions: input.pack } : {}),
        });
        if (e2) throw e2;
      }
      return mc.id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: qk.roster.all });
      queryClient.invalidateQueries({ queryKey: qk.package.all });
      queryClient.invalidateQueries({ queryKey: qk.scheduledTrainer.owed });
      onDone();
      router.push(`/dashboard/${id}?kind=managed`);
    },
    onError: (e) => setError((e as Error).message),
  });

  const busy = invite.isPending || addOffline.isPending;

  function addClient() {
    const input = read(kind === "app");
    if (!input) return;
    if (kind === "app") invite.mutate({ input, direct: true });
    else addOffline.mutate(input);
  }

  function sendLink() {
    const input = read(false);
    if (input) invite.mutate({ input, direct: false });
  }

  return (
    <>
      <Segmented
        size="lg"
        value={kind}
        onChange={(v) => {
          setKind(v);
          setError(null);
        }}
        options={[
          { value: "app", label: t("clients.add.withApp"), icon: Smartphone },
          { value: "managed", label: t("clients.add.noApp"), icon: SmartphoneOff },
        ]}
      />

      <View style={{ gap: 8 }}>
        <FieldLabel>{kind === "app" ? t("clients.add.nameOptional") : t("clients.add.name")}</FieldLabel>
        <Input
          size="md"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={60}
          placeholder={t("clients.clientNamePlaceholder")}
          accessibilityLabel={t("clients.add.name")}
        />
      </View>

      <View style={{ gap: 8 }}>
        <FieldLabel>{t("clients.add.phone")}</FieldLabel>
        <Input
          size="md"
          ltr
          value={phone}
          onChangeText={setPhone}
          placeholder="050-123-4567"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          accessibilityLabel={t("clients.add.phone")}
        />
      </View>

      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        <View style={{ paddingTop: 2 }}>
          <Icon icon={Info} size={16} color={colors.graphite} />
        </View>
        <AppText size={13} lineHeight={20} tone="graphite" style={{ flex: 1 }}>
          {kind === "app" ? t("clients.add.hintApp") : t("clients.add.hintNoApp")}
        </AppText>
      </View>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1, gap: 8 }}>
          <FieldLabel>{t("clients.add.price")}</FieldLabel>
          <Input
            size="md"
            ltr="start"
            suffix="₪"
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
            maxLength={7}
            accessibilityLabel={t("clients.add.price")}
          />
        </View>
        <View style={{ flex: 1, gap: 8 }}>
          <FieldLabel>{t("clients.add.package")}</FieldLabel>
          <Input
            size="md"
            ltr="start"
            suffix={t("clients.add.sessions")}
            value={pack}
            onChangeText={setPack}
            keyboardType="number-pad"
            maxLength={3}
            accessibilityLabel={t("clients.add.package")}
          />
        </View>
      </View>

      {error ? (
        <AppText size={14} tone="ember">
          {error}
        </AppText>
      ) : null}

      <Button label={t("clients.add.submit")} icon={UserPlus} size={56} block loading={busy} onPress={addClient} />
      {kind === "app" ? (
        <Button
          label={t("clients.add.sendLink")}
          icon={MessageCircle}
          variant="secondary"
          size={52}
          block
          disabled={busy}
          onPress={sendLink}
        />
      ) : null}
    </>
  );
}
