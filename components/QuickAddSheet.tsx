// components/QuickAddSheet.tsx — D21a/D21b: what the trainer's volt [+] opens
// (docs/design/screens/trainer-quick-add.html): four create tiles.
//
// Still to come with D21b proper: "קביעה מהירה ל…" (frequent clients) and
// "מחכה לך" (today's unmarked offline workouts). Until the Library tab exists
// (D21d), the exercise list is reachable from here too.

import { Pressable, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import CalendarPlus from "lucide-react-native/icons/calendar-plus";
import Dumbbell from "lucide-react-native/icons/dumbbell";
import Layers from "lucide-react-native/icons/layers";
import UserPlus from "lucide-react-native/icons/user-plus";

import { AppText, colors, Icon, ListCard, ListRow, Sheet, type IconComponent } from "@/components/ui";

export function QuickAddSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();

  function go(href: Href) {
    onClose();
    router.push(href);
  }

  const tiles: { icon: IconComponent; label: string; href: Href }[] = [
    { icon: CalendarPlus, label: t("quickAdd.schedule"), href: "/schedule/new" },
    { icon: UserPlus, label: t("quickAdd.client"), href: "/clients" },
    { icon: Layers, label: t("quickAdd.template"), href: "/templates/new" },
    { icon: Dumbbell, label: t("quickAdd.exercise"), href: "/exercises/new" },
  ];

  return (
    <Sheet visible={visible} onClose={onClose} closeLabel={t("quickAdd.close")} title={t("quickAdd.title")}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {tiles.map((tile) => (
          <Pressable
            key={tile.label}
            accessibilityRole="button"
            onPress={() => go(tile.href)}
            style={({ pressed }) => ({
              width: "48.5%",
              flexGrow: 1,
              height: 104,
              borderRadius: 20,
              backgroundColor: colors.chalk,
              padding: 14,
              justifyContent: "space-between",
              transform: [{ scale: pressed ? 0.97 : 1 }],
            })}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                backgroundColor: colors.paper,
                borderWidth: 1,
                borderColor: colors.line,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon icon={tile.icon} size={22} />
            </View>
            <AppText size={16} weight="semibold">
              {tile.label}
            </AppText>
          </Pressable>
        ))}
      </View>

      <ListCard>
        <ListRow
          density="setting"
          leading={<Icon icon={Dumbbell} size={22} />}
          title={t("quickAdd.exerciseLibrary")}
          chevron
          onPress={() => go("/exercises")}
        />
      </ListCard>
    </Sheet>
  );
}
