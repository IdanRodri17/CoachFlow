// components/RenewPackageSheet.tsx — "חידוש חבילה" on the client card (U4;
// Idan, 2026-11-27: carry what's left over).
//
// The trainer picks the new package's size (and checks its price); what's
// left of the old package carries over, and sessions already done beyond it
// count against the new one (lib/packageRenewal.ts). The sheet says both
// before saving, then writes the same packages row: total, used, price.
// Sessions already done keep the price they were done at (0049).

import { useState } from "react";
import { View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import RotateCcw from "lucide-react-native/icons/rotate-ccw";

import { qk } from "@/lib/queryKeys";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/friendlyError";
import { renewedPackage } from "@/lib/packageRenewal";
import type { Database } from "@/lib/database.types";
import { AppText, Button, FieldLabel, Input, parseTypedNumber, SelectChip, Sheet } from "@/components/ui";

type Pkg = Database["public"]["Tables"]["packages"]["Row"];

const SIZES = [5, 8, 10, 12, 20];

export function RenewPackageSheet({
  visible,
  onClose,
  kind,
  refId,
  pkg,
}: {
  visible: boolean;
  onClose: () => void;
  kind: "app" | "managed";
  refId: string;
  pkg: Pkg;
}) {
  const { t } = useTranslation();
  return (
    <Sheet visible={visible} onClose={onClose} closeLabel={t("common.cancel")} title={t("clientCard.package.renewTitle")}>
      {visible ? <RenewForm key={pkg.id} kind={kind} refId={refId} pkg={pkg} onDone={onClose} /> : null}
    </Sheet>
  );
}

function RenewForm({ kind, refId, pkg, onDone }: { kind: "app" | "managed"; refId: string; pkg: Pkg; onDone: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // The last package's size is the usual next one.
  const [size, setSize] = useState(String(pkg.total_sessions > 0 ? pkg.total_sessions : 10));
  const [price, setPrice] = useState(pkg.price_per_session != null ? String(pkg.price_per_session) : "");
  const sizeN = parseTypedNumber(size);
  const priceN = parseTypedNumber(price);
  const validSize = sizeN != null && Math.round(sizeN) > 0 ? Math.round(sizeN) : null;

  const left = pkg.total_sessions - pkg.used_sessions;
  const next = validSize != null ? renewedPackage({ total: pkg.total_sessions, used: pkg.used_sessions }, validSize) : null;

  const save = useMutation({
    meta: { inlineError: true },
    mutationFn: async () => {
      if (!next) return;
      const { error } = await supabase
        .from("packages")
        .update({
          total_sessions: next.total,
          used_sessions: next.used,
          ...(priceN != null ? { price_per_session: priceN } : {}),
        })
        .eq("id", pkg.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.package.subject(kind, refId) });
      queryClient.invalidateQueries({ queryKey: qk.package.all });
      queryClient.invalidateQueries({ queryKey: qk.clientContext.subject(kind, refId) });
      // The renewal item on Home and the clients list go; upcoming money moves.
      queryClient.invalidateQueries({ queryKey: qk.scheduledTrainer.attention });
      queryClient.invalidateQueries({ queryKey: qk.scheduledTrainer.owed });
      queryClient.invalidateQueries({ queryKey: qk.money.all });
      onDone();
    },
  });

  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 8 }}>
        <FieldLabel>{t("clientCard.package.renewSize")}</FieldLabel>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {SIZES.map((n) => (
            <SelectChip key={n} label={String(n)} selected={validSize === n} onPress={() => setSize(String(n))} />
          ))}
        </View>
        <Input
          size="md"
          ltr="start"
          keyboardType="number-pad"
          value={size}
          onChangeText={setSize}
          suffix={t("clientCard.package.sessions")}
          accessibilityLabel={t("clientCard.package.renewSize")}
        />
      </View>

      <View style={{ gap: 8 }}>
        <FieldLabel>{t("clientCard.package.pricePer")}</FieldLabel>
        <Input
          size="md"
          ltr="start"
          keyboardType="decimal-pad"
          value={price}
          onChangeText={setPrice}
          suffix="₪"
          accessibilityLabel={t("clientCard.package.pricePer")}
        />
      </View>

      <View style={{ gap: 4 }}>
        {left > 0 ? (
          <AppText size={14} tone="graphite">
            {t("clientCard.package.renewCarry", { count: left })}
          </AppText>
        ) : left < 0 ? (
          <AppText size={14} tone="graphite">
            {t("clientCard.package.renewOver", { count: -left })}
          </AppText>
        ) : null}
        {next ? (
          <AppText size={15} weight="semibold">
            {t("clientCard.package.renewResult", { left: next.total - next.used, total: next.total })}
          </AppText>
        ) : null}
      </View>

      {save.error ? (
        <AppText size={14} tone="ember">
          {friendlyError(save.error, t)}
        </AppText>
      ) : null}
      <Button
        label={t("clientCard.package.renewSave")}
        icon={RotateCcw}
        block
        loading={save.isPending}
        disabled={save.isPending || next == null}
        onPress={() => save.mutate()}
      />
    </View>
  );
}
