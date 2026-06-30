// components/AdjustmentModal.tsx — a bottom sheet for skipping or swapping an
// exercise during a workout. Skip just needs a reason; Swap also needs a
// substitute exercise picked from the library.

import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export type AdjustmentResult = { reason: string; swapId?: string; swapName?: string };

export function AdjustmentModal({
  visible,
  mode,
  exerciseName,
  library,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  mode: "skip" | "swap" | null;
  exerciseName: string;
  library: { id: string; name: string }[]; // substitutes (current exercise excluded)
  onClose: () => void;
  onConfirm: (result: AdjustmentResult) => void;
}) {
  const [reason, setReason] = useState("");
  const [swapId, setSwapId] = useState<string | null>(null);

  // Reset each time the sheet opens.
  useEffect(() => {
    if (visible) {
      setReason("");
      setSwapId(null);
    }
  }, [visible]);

  const canConfirm = mode === "skip" || (mode === "swap" && swapId != null);

  function confirm() {
    if (mode === "swap") {
      const swap = library.find((e) => e.id === swapId);
      onConfirm({ reason: reason.trim(), swapId: swapId ?? undefined, swapName: swap?.name });
    } else {
      onConfirm({ reason: reason.trim() });
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <SafeAreaView edges={["bottom"]} className="rounded-t-3xl bg-white">
          <View className="px-6 py-5">
            <Text className="text-lg font-bold text-slate-900">
              {mode === "skip" ? "Skip" : "Swap"} {exerciseName}
            </Text>

            {mode === "swap" ? (
              <>
                <Text className="mb-2 mt-4 text-sm font-medium text-slate-700">Substitute with</Text>
                <ScrollView className="max-h-56" keyboardShouldPersistTaps="handled">
                  <View className="gap-2">
                    {library.length === 0 ? (
                      <Text className="text-sm text-slate-400">No other exercises in the library.</Text>
                    ) : (
                      library.map((e) => (
                        <Pressable
                          key={e.id}
                          onPress={() => setSwapId(e.id)}
                          className={`flex-row items-center justify-between rounded-xl border px-4 py-3 ${
                            swapId === e.id ? "border-slate-900 bg-slate-50" : "border-slate-200"
                          }`}
                        >
                          <Text className="text-base text-slate-900">{e.name}</Text>
                          {swapId === e.id ? <Text className="font-bold text-slate-900">✓</Text> : null}
                        </Pressable>
                      ))
                    )}
                  </View>
                </ScrollView>
              </>
            ) : null}

            <Text className="mb-2 mt-4 text-sm font-medium text-slate-700">Reason (optional)</Text>
            <TextInput
              className="rounded-xl border border-slate-300 px-4 py-3 text-base text-slate-900"
              placeholder={mode === "skip" ? "e.g. shoulder pain" : "e.g. machine was taken"}
              placeholderTextColor="#94a3b8"
              value={reason}
              onChangeText={setReason}
              multiline
            />

            <View className="mt-5 flex-row gap-3">
              <Pressable
                onPress={onClose}
                className="flex-1 items-center rounded-xl border border-slate-300 px-4 py-3 active:bg-slate-100"
              >
                <Text className="text-base font-semibold text-slate-700">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={confirm}
                disabled={!canConfirm}
                className={`flex-1 items-center rounded-xl px-4 py-3 ${
                  canConfirm ? "bg-slate-900 active:opacity-80" : "bg-slate-300"
                }`}
              >
                <Text className="text-base font-semibold text-white">
                  {mode === "skip" ? "Skip exercise" : "Swap"}
                </Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
