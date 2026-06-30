// components/RestTimer.tsx — a countdown shown between sets.
//
// Counts down `seconds`, and is pausable / skippable / extendable. Calls onDone
// exactly once when it reaches zero or the user taps Skip. Pure setTimeout — no
// native module needed.

import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";

export function RestTimer({ seconds, onDone }: { seconds: number; onDone: () => void }) {
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning] = useState(true);
  const firedRef = useRef(false);

  // Tick down once per second while running.
  useEffect(() => {
    if (!running || remaining <= 0) return;
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [running, remaining]);

  // Fire onDone exactly once when we hit zero.
  function finish() {
    if (!firedRef.current) {
      firedRef.current = true;
      onDone();
    }
  }
  useEffect(() => {
    if (remaining <= 0) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;

  return (
    <View className="rounded-2xl bg-slate-900 px-4 py-3">
      <Text className="text-center text-xs font-semibold uppercase tracking-wide text-slate-300">
        Rest
      </Text>
      <Text className="text-center text-4xl font-bold text-white">
        {mm}:{String(ss).padStart(2, "0")}
      </Text>
      <View className="mt-2 flex-row justify-center gap-2">
        <TimerBtn label="−30" onPress={() => setRemaining((r) => Math.max(0, r - 30))} />
        <TimerBtn label="−10" onPress={() => setRemaining((r) => Math.max(0, r - 10))} />
        <TimerBtn label="+10" onPress={() => setRemaining((r) => r + 10)} />
        <TimerBtn label="+30" onPress={() => setRemaining((r) => r + 30)} />
      </View>
      <View className="mt-2 flex-row justify-center gap-2">
        <TimerBtn label={running ? "Pause" : "Resume"} onPress={() => setRunning((r) => !r)} />
        <TimerBtn label="Skip" onPress={finish} />
      </View>
    </View>
  );
}

function TimerBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="rounded-lg bg-white/20 px-4 py-2 active:opacity-70">
      <Text className="text-sm font-semibold text-white">{label}</Text>
    </Pressable>
  );
}
