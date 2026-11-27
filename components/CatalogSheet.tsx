// components/CatalogSheet.tsx — "ספרייה כללית": the standard exercises (0051)
// a trainer doesn't have in their library (Idan, 2026-11-27).
//
// Every trainer starts with the whole standard library as their own copies;
// this brings back the ones they deleted, one by one or all at once
// (rpc add_catalog_exercises, which skips what's already there). What's added
// is the trainer's to edit like any exercise.

import { ActivityIndicator, ScrollView, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Plus from "lucide-react-native/icons/plus";

import { qk } from "@/lib/queryKeys";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/friendlyError";
import { ltr } from "@/lib/i18n";
import type { Database } from "@/lib/database.types";
import { AppText, Button, colors, IconButton, Sheet } from "@/components/ui";

export type CatalogRow = Database["public"]["Tables"]["exercise_catalog"]["Row"];

export function CatalogSheet({
  visible,
  onClose,
  missing,
  loading,
}: {
  visible: boolean;
  onClose: () => void;
  /** Standard exercises not in the trainer's library, in catalog order. */
  missing: CatalogRow[];
  loading: boolean;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const en = i18n.language === "en";

  const add = useMutation({
    meta: { inlineError: true },
    mutationFn: async (slugs: string[] | null) => {
      const { error } = await supabase.rpc("add_catalog_exercises", { p_slugs: slugs });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.exercises.all }),
  });

  return (
    <Sheet visible={visible} onClose={onClose} closeLabel={t("common.back")} title={t("exercises.catalog.title")}>
      <View style={{ gap: 12 }}>
        <AppText size={14} tone="graphite">
          {t("exercises.catalog.hint")}
        </AppText>
        {loading ? (
          <ActivityIndicator color={colors.ink} />
        ) : missing.length === 0 ? (
          <AppText size={15} weight="semibold">
            {t("exercises.catalog.allIn")}
          </AppText>
        ) : (
          <>
            <Button
              label={t("exercises.catalog.addAll", { count: missing.length })}
              icon={Plus}
              size={48}
              block
              loading={add.isPending && add.variables === null}
              disabled={add.isPending}
              onPress={() => add.mutate(null)}
            />
            <ScrollView style={{ maxHeight: 360 }}>
              {missing.map((c, i) => (
                <View
                  key={c.slug}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    minHeight: 56,
                    paddingVertical: 8,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: colors.line,
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <AppText size={16} weight="semibold" numberOfLines={1}>
                      {en ? c.name_en : c.name_he}
                    </AppText>
                    <AppText size={13} tone="graphite" numberOfLines={1}>
                      {[
                        t(`exercises.muscles.${c.muscle_group}`),
                        c.default_sets != null && c.default_reps != null ? ltr(`${c.default_sets} × ${c.default_reps}`) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </AppText>
                  </View>
                  <IconButton
                    icon={Plus}
                    variant="soft"
                    accessibilityLabel={`${t("exercises.catalog.add")} ${en ? c.name_en : c.name_he}`}
                    disabled={add.isPending}
                    onPress={() => add.mutate([c.slug])}
                  />
                </View>
              ))}
            </ScrollView>
          </>
        )}
        {add.error ? (
          <AppText size={14} tone="ember">
            {friendlyError(add.error, t)}
          </AppText>
        ) : null}
      </View>
    </Sheet>
  );
}
