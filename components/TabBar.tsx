// components/TabBar.tsx — D21a: the custom tab bar (DESIGN.md §3/§4; tab bars
// in docs/design/screens/design-system.html, trainer-home.html,
// client-today.html). Paper, a top hairline, 22 icons with 12 labels; the
// active tab sits on a 56×30 volt pill. Trainers get a raised volt [+] in the
// middle. Items are laid out in logical order, so the row mirrors in Hebrew.
//
// The items are declared here rather than derived from the routes, because
// two of the trainer's design tabs don't exist as tab routes yet:
//   - מתאמנים opens /clients (a stack screen) until D21c moves it into the tabs.
//   - ספרייה is the exercises tab, whose screen carries the תבניות | תרגילים
//     switch (D29b); it stays highlighted on templates too. Templates gets the
//     switch back to exercises with its own restyle (D29a).
// Clients reach the exercise library from Profile (D28b), as designed.

import { useState } from "react";
import { Pressable, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import type { BottomTabBarProps } from "expo-router/tabs";
import { useTranslation } from "react-i18next";
import Apple from "lucide-react-native/icons/apple";
import Calendar from "lucide-react-native/icons/calendar";
import ChartLine from "lucide-react-native/icons/chart-line";
import House from "lucide-react-native/icons/house";
import Layers from "lucide-react-native/icons/layers";
import Plus from "lucide-react-native/icons/plus";
import User from "lucide-react-native/icons/user";
import Users from "lucide-react-native/icons/users";

import { AppText, colors, Icon, type IconComponent } from "@/components/ui";
import { QuickAddSheet } from "@/components/QuickAddSheet";

type Item =
  | { kind: "tab"; route: string; label: string; icon: IconComponent; alsoActiveOn?: string[] }
  | { kind: "link"; href: Href; label: string; icon: IconComponent }
  | { kind: "add" };

export function TabBar({ state, navigation, insets, isTrainer }: BottomTabBarProps & { isTrainer: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [quickAdd, setQuickAdd] = useState(false);
  const activeRoute = state.routes[state.index]?.name;

  const items: Item[] = isTrainer
    ? [
        { kind: "tab", route: "index", label: t("tabs.home"), icon: House },
        { kind: "tab", route: "schedule", label: t("tabBar.calendar"), icon: Calendar },
        { kind: "add" },
        { kind: "link", href: "/clients", label: t("tabBar.clients"), icon: Users },
        { kind: "tab", route: "exercises", label: t("tabBar.library"), icon: Layers, alsoActiveOn: ["templates"] },
      ]
    : [
        { kind: "tab", route: "index", label: t("tabBar.today"), icon: House },
        { kind: "tab", route: "progress", label: t("tabs.progress"), icon: ChartLine },
        { kind: "tab", route: "nutrition", label: t("tabs.nutrition"), icon: Apple },
        { kind: "tab", route: "profile", label: t("tabs.profile"), icon: User },
      ];

  function openTab(route: string) {
    const target = state.routes.find((r) => r.name === route);
    if (!target) return;
    const event = navigation.emit({ type: "tabPress", target: target.key, canPreventDefault: true });
    if (activeRoute !== route && !event.defaultPrevented) navigation.navigate(route);
  }

  return (
    <>
      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          paddingTop: 6,
          paddingHorizontal: 6,
          paddingBottom: Math.max(insets.bottom, 8),
          backgroundColor: colors.paper,
          borderTopWidth: 1,
          borderTopColor: colors.line,
        }}
      >
        {items.map((item, i) => {
          if (item.kind === "add") {
            return (
              <View key="add" style={{ flex: 1, alignItems: "center" }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("tabBar.quickAdd")}
                  onPress={() => setQuickAdd(true)}
                  style={({ pressed }) => ({
                    width: 56,
                    height: 56,
                    marginTop: -14,
                    borderRadius: 28,
                    backgroundColor: colors.volt,
                    borderWidth: 4,
                    borderColor: colors.paper,
                    alignItems: "center",
                    justifyContent: "center",
                    shadowColor: colors.ink,
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: 0.18,
                    shadowRadius: 16,
                    elevation: 6,
                    transform: [{ scale: pressed ? 0.95 : 1 }],
                  })}
                >
                  <Icon icon={Plus} size={26} strokeWidth={2.4} />
                </Pressable>
              </View>
            );
          }
          const active =
            item.kind === "tab" &&
            (item.route === activeRoute || (!!activeRoute && !!item.alsoActiveOn?.includes(activeRoute)));
          return (
            <Pressable
              key={i}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={item.label}
              onPress={() => (item.kind === "tab" ? openTab(item.route) : router.push(item.href))}
              style={{ flex: 1, minHeight: 52, alignItems: "center", justifyContent: "center", gap: 3 }}
            >
              <View
                style={{
                  width: 56,
                  height: 30,
                  borderRadius: 15,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: active ? colors.volt : "transparent",
                }}
              >
                <Icon
                  icon={item.icon}
                  size={22}
                  color={active ? colors.ink : colors.smoke}
                  strokeWidth={active ? 2.1 : 1.9}
                />
              </View>
              <AppText
                size={12}
                lineHeight={15}
                weight={active ? "bold" : "medium"}
                tone={active ? "ink" : "smoke"}
                center
                numberOfLines={1}
              >
                {item.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      {isTrainer ? <QuickAddSheet visible={quickAdd} onClose={() => setQuickAdd(false)} /> : null}
    </>
  );
}
