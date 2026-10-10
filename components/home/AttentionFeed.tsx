// components/home/AttentionFeed.tsx — D23b: "לתשומת לבך" on the trainer Home
// (docs/design/screens/trainer-home.html), from the trainer_attention view
// (0029, main B2). It replaces the separate at-risk card.
//
// One row per item, with an icon and an action per kind:
//   risk             ember ⚠  "פספס 2 אימונים ברצף"   → "תזכורת" (WhatsApp nudge)
//   package_used_up  ember 🎟 "החבילה נגמרה…"          → "חידוש" (WhatsApp renewal)
//   package_low      gold 🎟  "נשאר אימון אחד בחבילה"  → "חידוש"
//   adjustment       ember ∿  "דילוג על … · "reason""  → the client card
//   pr               volt 🏆  "שיא אישי: … 90 ק״ג"     → the client card
// Without a phone on file the action falls back to the client card, where the
// package editor is. The view returns only the caller's rows; sorting and
// wording happen here. Copy avoids the client's gender ("דילוג על", not
// "דילגה על") — the app doesn't know it.

import { Linking, Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Activity from "lucide-react-native/icons/activity";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import MessageCircle from "lucide-react-native/icons/message-circle";
import Ticket from "lucide-react-native/icons/ticket";
import TriangleAlert from "lucide-react-native/icons/triangle-alert";
import Trophy from "lucide-react-native/icons/trophy";

import { attentionQuery, type AttentionItem } from "@/lib/queries";
import type { RosterClient } from "@/lib/useRoster";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { formatWeight } from "@/lib/workoutSession";
import { AppText, Button, colors, Icon, ListCard, type IconComponent } from "@/components/ui";

import { firstName } from "./format";

type Item = AttentionItem;

const MAX_ROWS = 8;

export function AttentionFeed({ roster }: { roster: RosterClient[] }) {
  const { t } = useTranslation();
  const router = useRouter();

  // Shared with the clients list (lib/queries.ts): sorted, all rows.
  const feed = useQuery(attentionQuery);

  const items = (feed.data ?? []).slice(0, MAX_ROWS);
  if (items.length === 0) return null;

  function clientOf(it: Item): RosterClient | undefined {
    const kind = it.client_id ? "app" : "managed";
    const refId = it.client_id ?? it.managed_client_id;
    return roster.find((c) => c.kind === kind && c.refId === refId);
  }

  return (
    <View style={{ gap: 10 }}>
      <View style={{ minHeight: 32, justifyContent: "center" }}>
        <AppText size={18} weight="semibold" lineHeight={23}>
          {t("trainerHome.attention")}
        </AppText>
      </View>
      <ListCard>
        {items.map((it, i) => {
          const client = clientOf(it);
          return (
            <AttentionRow
              key={`${it.kind}-${it.subject_key}-${it.happened_at ?? i}`}
              item={it}
              client={client}
              onOpen={client ? () => router.push(`/dashboard/${client.refId}?kind=${client.kind}`) : undefined}
            />
          );
        })}
      </ListCard>
    </View>
  );
}

function AttentionRow({ item, client, onOpen }: { item: Item; client?: RosterClient; onOpen?: () => void }) {
  const { t } = useTranslation();
  const name = client?.name ?? "—";
  const left = item.sessions_left ?? 0;

  let icon: IconComponent = TriangleAlert;
  let bg: string = colors.emberSoft;
  let fg: string = colors.ember;
  let line = "";
  let action: { label: string; icon?: IconComponent; text: string } | null = null;

  switch (item.kind) {
    case "risk":
      line = item.detail === "missed_streak" ? t("home.atRisk.missedStreak") : t("home.atRisk.goneQuiet");
      action = {
        label: t("trainerHome.remind"),
        icon: MessageCircle,
        text: t("trainerHome.wa.nudge", { name: firstName(name) }),
      };
      break;
    case "package_used_up":
    case "package_low":
      icon = Ticket;
      if (item.kind === "package_low" && left > 0) {
        bg = colors.goldSoft;
        fg = colors.gold;
      }
      line =
        item.kind === "package_used_up"
          ? t("trainerHome.att.usedUp")
          : left > 0
            ? t("trainerHome.att.packageLow", { count: left })
            : t("trainerHome.att.packageEmpty");
      action = {
        label: t("trainerHome.renew"),
        text: left > 0 ? t("trainerHome.wa.renewLeft", { name: firstName(name), count: left }) : t("trainerHome.wa.renewDone", { name: firstName(name) }),
      };
      break;
    case "adjustment": {
      icon = Activity;
      const what =
        item.action === "swapped"
          ? t("trainerHome.att.swapped", { exercise: item.exercise_name ?? "—" })
          : t("trainerHome.att.skipped", { exercise: item.exercise_name ?? "—" });
      line = item.detail ? `${what} · "${item.detail}"` : what;
      break;
    }
    case "pr": {
      icon = Trophy;
      bg = colors.volt;
      fg = colors.ink;
      const pr = t("trainerHome.att.pr", {
        exercise: item.exercise_name ?? "—",
        weight: item.weight != null ? formatWeight(item.weight) : "—",
      });
      const more = (item.item_count ?? 1) - 1;
      line = more > 0 ? `${pr} · ${t("trainerHome.att.more", { count: more })}` : pr;
      break;
    }
  }

  const link = action && client?.phone ? buildWhatsAppLink(client.phone, action.text) : null;

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, minHeight: 72 }}>
      <View
        style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}
      >
        <Icon icon={icon} size={20} color={fg} />
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={!onOpen}
        onPress={onOpen}
        style={({ pressed }) => ({ flex: 1, minWidth: 0, gap: 2, opacity: pressed ? 0.7 : 1 })}
      >
        <AppText size={16} weight="semibold" numberOfLines={1}>
          {name}
        </AppText>
        <AppText size={14} tone="graphite" numberOfLines={2}>
          {line}
        </AppText>
      </Pressable>
      {action && (link || onOpen) ? (
        <Button
          label={action.label}
          icon={action.icon}
          variant="secondary"
          size={44}
          onPress={() => (link ? Linking.openURL(link) : onOpen?.())}
        />
      ) : onOpen ? (
        <Icon icon={ChevronRight} size={20} color={colors.smoke} mirror />
      ) : null}
    </View>
  );
}
