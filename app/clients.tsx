// app/clients.tsx — V14: add/manage clients.
//
// Moved off the Schedule tab (which is now a calendar, not a client-management
// hub) so scheduling stays the trainer's main focus. Reached from a button on
// the trainer Home, beside the roster. Logic here (add offline client,
// per-client contact phone for WhatsApp reminders) is unchanged from the old
// schedule/index.tsx — just relocated.
//
// V18b: app clients join by INVITE, not by email. The trainer creates a
// single-use code (create_invite, 0020) and sends it on WhatsApp; the client
// types it into their own app (accept_invite) — that is the consent. The old
// add-by-email RPC let any trainer link any client without asking and is now
// revoked in the DB.

import { useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { RoleGate } from "@/components/RoleGate";
import { supabase } from "@/lib/supabase";
import { toE164IL, useAuth } from "@/lib/auth";
import { useRosterClients, type RosterClient } from "@/lib/useRoster";
import { formatDisplayDate, toDateString } from "@/lib/dates";
import { directionalTextClassName, LTR_INPUT_STYLE } from "@/lib/i18n";

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
  const [inviteName, setInviteName] = useState("");
  const [offlineName, setOfflineName] = useState("");

  const trainerId = session!.user.id;

  const roster = useRosterClients(trainerId);

  // Pending invites only: used ones have become roster rows, expired ones are
  // dead. expires_at is an instant, so comparing it to "now" in UTC is right
  // (no calendar-date logic here).
  const invites = useQuery({
    queryKey: ["client-invites", trainerId],
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

  function sendInviteOnWhatsApp(code: string, label: string | null) {
    const message = t("clients.inviteMessage", {
      greeting: label ? t("clients.inviteGreetingNamed", { name: label }) : t("clients.inviteGreeting"),
      code,
      trainerName: profile?.display_name ?? "",
    });
    // No phone number: WhatsApp opens its chat picker so the trainer chooses
    // the client (who may not even be in the roster's contact list yet).
    Linking.openURL(`https://wa.me/?text=${encodeURIComponent(message)}`);
  }

  const createInvite = useMutation({
    mutationFn: async (label: string) => {
      // 0021: the optional name is display-only — it tells the trainer who a
      // pending code is for; the client's real name comes from their profile.
      const { data, error } = await supabase.rpc("create_invite", { p_label: label || null });
      if (error) throw error;
      return data;
    },
    onSuccess: (invite) => {
      queryClient.invalidateQueries({ queryKey: ["client-invites"] });
      setInviteName("");
      sendInviteOnWhatsApp(invite.code, invite.label);
    },
  });

  const cancelInvite = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_invites").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-invites"] }),
  });

  const addOfflineClient = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("managed_clients").insert({ trainer_id: trainerId, name });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roster-clients"] });
      setOfflineName("");
    },
  });

  // Trainer-entered contact phone (V11) — powers SMS reminders and "Remind on
  // WhatsApp". Clients who joined by invite get it prefilled (accept_invite).
  // `phone` arrives already validated and in local 05X… form, or null to clear.
  const savePhone = useMutation({
    mutationFn: async ({ client, phone }: { client: RosterClient; phone: string | null }) => {
      if (client.kind === "app") {
        const { error } = await supabase
          .from("trainer_clients")
          .update({ contact_phone: phone })
          .eq("trainer_id", trainerId)
          .eq("client_id", client.refId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("managed_clients")
          .update({ phone })
          .eq("id", client.refId);
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["roster-clients"] }),
  });

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["bottom"]}>
      <ScrollView contentContainerClassName="px-6 py-6" keyboardShouldPersistTaps="handled">
        <Text className="w-full text-left text-2xl font-bold text-slate-900">{t("clients.title")}</Text>

        {/* Add an app client */}
        <Text className="mb-2 mt-6 w-full text-left text-sm font-semibold uppercase tracking-wide text-slate-500">
          {t("clients.addAppClientTitle")}
        </Text>
        <TextInput
          className={`mb-2 rounded-xl border border-slate-300 px-4 py-3 text-base text-slate-900 ${directionalTextClassName()}`}
          placeholder={t("clients.inviteNamePlaceholder")}
          placeholderTextColor="#94a3b8"
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={60}
          value={inviteName}
          onChangeText={setInviteName}
          editable={!createInvite.isPending}
        />
        <Pressable
          className="items-center rounded-xl bg-emerald-600 px-4 py-3 active:opacity-80"
          disabled={createInvite.isPending}
          onPress={() => createInvite.mutate(inviteName.trim())}
        >
          {createInvite.isPending ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-base font-semibold text-white">{t("clients.inviteButton")}</Text>
          )}
        </Pressable>
        {createInvite.error ? (
          <Text className="mt-2 w-full text-left text-sm text-red-600">{(createInvite.error as Error).message}</Text>
        ) : null}
        <Text className="mt-2 w-full text-left text-xs text-slate-400">{t("clients.inviteHint")}</Text>

        {invites.data && invites.data.length > 0 ? (
          <View className="mt-4 gap-2">
            <Text className="w-full text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("clients.pendingInvites")}
            </Text>
            {invites.data.map((inv) => (
              <View key={inv.id} className="rounded-xl border border-dashed border-slate-300 px-4 py-3">
                {inv.label ? (
                  <Text className="w-full text-left text-base font-semibold text-slate-900">{inv.label}</Text>
                ) : null}
                <Text className="w-full text-left text-sm text-slate-700">
                  {t("clients.inviteExpires", {
                    code: inv.code,
                    date: formatDisplayDate(
                      toDateString(new Date(inv.expires_at)),
                      i18n.language === "he" ? "he" : "en",
                    ),
                  })}
                </Text>
                <View className="mt-2 flex-row gap-2">
                  <Pressable
                    className="rounded-lg border border-emerald-300 px-3 py-1.5 active:bg-emerald-50"
                    onPress={() => sendInviteOnWhatsApp(inv.code, inv.label)}
                  >
                    <Text className="text-xs font-semibold text-emerald-700">{t("clients.resendInvite")}</Text>
                  </Pressable>
                  <Pressable
                    className="rounded-lg border border-slate-300 px-3 py-1.5 active:bg-slate-100"
                    disabled={cancelInvite.isPending}
                    onPress={() => cancelInvite.mutate(inv.id)}
                  >
                    <Text className="text-xs font-semibold text-slate-600">{t("common.cancel")}</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* Add an offline client */}
        <Text className="mb-2 mt-6 w-full text-left text-sm font-semibold uppercase tracking-wide text-slate-500">
          {t("clients.addOfflineClientTitle")}
        </Text>
        <AddRow
          value={offlineName}
          onChangeText={setOfflineName}
          placeholder={t("clients.clientNamePlaceholder")}
          busy={addOfflineClient.isPending}
          onAdd={() => addOfflineClient.mutate(offlineName.trim())}
        />
        {addOfflineClient.error ? (
          <Text className="mt-2 w-full text-left text-sm text-red-600">
            {(addOfflineClient.error as Error).message}
          </Text>
        ) : null}

        {/* Roster */}
        <Text className="mb-2 mt-7 w-full text-left text-sm font-semibold uppercase tracking-wide text-slate-500">
          {t("clients.yourClients", { count: roster.data?.length ?? 0 })}
        </Text>
        {roster.isLoading ? (
          <ActivityIndicator />
        ) : roster.data && roster.data.length > 0 ? (
          <View className="gap-2">
            {roster.data.map((c) => (
              <RosterRow
                key={`${c.kind}-${c.refId}`}
                client={c}
                onSavePhone={(phone) => savePhone.mutateAsync({ client: c, phone })}
              />
            ))}
          </View>
        ) : (
          <Text className="w-full text-left text-sm text-slate-400">{t("clients.noClientsYet")}</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// An input + Add button row (offline client name; the email variant went
// away with add-by-email in V18b).
function AddRow({
  value,
  onChangeText,
  placeholder,
  busy,
  onAdd,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  busy: boolean;
  onAdd: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="flex-row gap-2">
      <TextInput
        className={`flex-1 rounded-xl border border-slate-300 px-4 py-3 text-base text-slate-900 ${directionalTextClassName()}`}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        autoCapitalize="words"
        autoCorrect={false}
        value={value}
        onChangeText={onChangeText}
        editable={!busy}
      />
      <Pressable
        className="items-center justify-center rounded-xl bg-slate-900 px-4 active:opacity-80"
        disabled={busy || value.trim().length === 0}
        onPress={onAdd}
      >
        {busy ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text className="text-base font-semibold text-white">{t("common.add")}</Text>
        )}
      </Pressable>
    </View>
  );
}

// A roster row with an editable contact phone (V11 — powers SMS reminders and
// "Remind on WhatsApp"). Local state per row so editing one doesn't affect
// others.
//
// V18b fix: it used to save only in onEndEditing, and the iOS phone-pad has
// no return key — so a typed number often never reached the server and
// nothing said so. Now an explicit Save button appears as soon as the number
// changes, the number is validated and stored in one local form (05X…), and
// the row says "Saved" or why it didn't.
function RosterRow({
  client,
  onSavePhone,
}: {
  client: RosterClient;
  onSavePhone: (phone: string | null) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [phone, setPhone] = useState(client.phone ?? "");
  const [savedPhone, setSavedPhone] = useState(client.phone ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "invalid" | "error">("idle");
  const dirty = phone.trim() !== savedPhone;

  async function save() {
    const raw = phone.trim();
    let normalized: string | null = null;
    if (raw) {
      const e164 = toE164IL(raw);
      if (!e164) {
        setStatus("invalid");
        return;
      }
      normalized = `0${e164.slice(4)}`;
    }
    setStatus("saving");
    try {
      await onSavePhone(normalized);
      setPhone(normalized ?? "");
      setSavedPhone(normalized ?? "");
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  return (
    <View className="rounded-xl border border-slate-200 px-4 py-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-medium text-slate-900">{client.name}</Text>
        {client.kind === "managed" ? (
          <Text className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
            {t("schedule.home.offline")}
          </Text>
        ) : null}
      </View>
      {/* V18 reachability, derived on read (nothing stored): login is
          SMS-only, so a saved phone is the one thing that decides whether
          reminders can reach this client. */}
      <Text
        className={`mt-1 self-start rounded-full px-2 py-0.5 text-xs font-semibold ${
          savedPhone ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
        }`}
      >
        {savedPhone ? t("clients.reachableSms") : t("clients.unreachable")}
      </Text>
      <View className="mt-2 flex-row items-center gap-2">
        <TextInput
          className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900"
          style={LTR_INPUT_STYLE}
          placeholder={t("clients.phonePlaceholder")}
          placeholderTextColor="#94a3b8"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          value={phone}
          onChangeText={(v) => {
            setPhone(v);
            setStatus("idle");
          }}
          editable={status !== "saving"}
        />
        {status === "saving" ? (
          <ActivityIndicator />
        ) : dirty ? (
          <Pressable className="rounded-lg bg-slate-900 px-3 py-1.5 active:opacity-80" onPress={save}>
            <Text className="text-sm font-semibold text-white">{t("common.save")}</Text>
          </Pressable>
        ) : status === "saved" ? (
          <Text className="text-xs font-semibold text-emerald-600">{t("clients.phoneSaved")}</Text>
        ) : null}
      </View>
      {status === "invalid" ? (
        <Text className="mt-1 w-full text-left text-xs text-red-600">{t("clients.invalidPhone")}</Text>
      ) : status === "error" ? (
        <Text className="mt-1 w-full text-left text-xs text-red-600">{t("clients.phoneSaveFailed")}</Text>
      ) : null}
    </View>
  );
}
