// components/workout/RestView.tsx — D20b: the rest screen that starts by
// itself after "סט בוצע" (docs/design/screens/workout-rest.html, DESIGN.md
// §6.2 rule 3). The countdown is read from an absolute end time
// (lib/workoutSession.ts), so it's right after the phone was locked.

import { useEffect } from "react";
import { ScrollView, View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedProps, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Svg, { Circle } from "react-native-svg";
import Check from "lucide-react-native/icons/check";
import ChevronsRight from "lucide-react-native/icons/chevrons-right";
import Pause from "lucide-react-native/icons/pause";
import Play from "lucide-react-native/icons/play";
import Vibrate from "lucide-react-native/icons/vibrate";

import { ltr } from "@/lib/i18n";
import type { WorkoutSession } from "@/lib/useWorkoutSession";
import { exerciseName, formatClock, formatWeight, prefill, restLeftMs } from "@/lib/workoutSession";
import { AppText, Button, colors, Icon, Num, TextButton } from "@/components/ui";

import { WorkoutHeader } from "./WorkoutHeader";

const RING = 264;
const STROKE = 14;
const RADIUS = 125;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function RestView({
  session,
  title,
  onMinimize,
  onOverview,
}: {
  session: WorkoutSession;
  title: string;
  onMinimize: () => void;
  onOverview: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { state: s, now } = session;
  const left = restLeftMs(s, now);
  const total = s.rest?.totalMs ?? 1;
  const paused = s.rest?.pausedLeftMs != null;
  const lg = s.lastLog;

  // The ring drains continuously on the UI thread (a 4×/s re-render made it
  // step). It re-syncs from the absolute end time whenever the rest changes:
  // start, ±15, pause, resume — and stays right after the phone was locked.
  const rest = s.rest;
  const progress = useSharedValue(1);
  useEffect(() => {
    if (!rest) return;
    const now = Date.now();
    const leftNow = rest.pausedLeftMs ?? Math.max(0, rest.endsAt - now);
    cancelAnimation(progress);
    progress.set(Math.max(0, Math.min(1, leftNow / rest.totalMs)));
    if (rest.pausedLeftMs == null && leftNow > 0) {
      progress.set(withTiming(0, { duration: leftNow, easing: Easing.linear }));
    }
  }, [rest, progress]);
  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: CIRCUMFERENCE * (1 - progress.get()) }));

  // "Up next": the same exercise keeps the numbers just logged; another one
  // shows its own starting numbers.
  let nextTitle = "";
  let nextNums = "";
  if (s.next) {
    const ne = s.exercises[s.next.ex];
    if (s.next.ex === s.ex) {
      nextTitle = t("workout.mode.nextSet", { n: s.next.set + 1, total: ne.sets, name: exerciseName(s, s.ex) });
      nextNums = s.weight != null ? `${formatWeight(s.weight)} × ${s.reps}` : `${s.reps}`;
    } else {
      const a = s.adjustments[s.next.ex];
      const start = a?.type === "swap" ? { weight: a.weight, reps: a.reps } : prefill(ne);
      nextTitle = t("workout.mode.nextExercise", { name: exerciseName(s, s.next.ex) });
      nextNums = start.weight != null ? `${formatWeight(start.weight)} × ${start.reps}` : `${start.reps}`;
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.iron }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top,
          paddingBottom: Math.max(insets.bottom, 16) + 14,
          paddingHorizontal: 20,
          gap: 14,
        }}
      >
        <WorkoutHeader state={s} now={now} title={title} onMinimize={onMinimize} onOverview={onOverview} />
        <View style={{ height: 6 }} />

        {/* The set just logged + "עריכה" (undo) */}
        {lg ? (
          <View
            accessibilityRole="summary"
            style={{
              height: 52,
              paddingStart: 14,
              paddingEnd: 8,
              borderRadius: 16,
              backgroundColor: colors.iron2,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
            }}
          >
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: colors.volt,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon icon={Check} size={16} color={colors.ink} strokeWidth={3} />
            </View>
            <AppText size={15} tone="bone" numberOfLines={1} style={{ flex: 1 }}>
              {lg.weight != null
                ? t("workout.mode.logged", { n: lg.set + 1, weight: ltr(formatWeight(lg.weight)), reps: lg.reps })
                : t("workout.mode.loggedBodyweight", { n: lg.set + 1, reps: lg.reps })}
            </AppText>
            <TextButton label={t("workout.mode.edit")} size={15} tone="volt" onPress={session.undo} style={{ paddingHorizontal: 12 }} />
          </View>
        ) : null}

        {/* The ring: volt on iron-3, starting at 12 o'clock */}
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", minHeight: RING + 16 }}>
          <View style={{ width: RING, height: RING }}>
            <Svg width={RING} height={RING} style={{ transform: [{ rotate: "-90deg" }] }}>
              <Circle cx={RING / 2} cy={RING / 2} r={RADIUS} fill="none" stroke={colors.iron3} strokeWidth={STROKE} />
              <AnimatedCircle
                cx={RING / 2}
                cy={RING / 2}
                r={RADIUS}
                fill="none"
                stroke={colors.volt}
                strokeWidth={STROKE}
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                animatedProps={ringProps}
              />
            </Svg>
            <View
              accessibilityRole="timer"
              accessibilityLabel={t("workout.mode.restTimer", { seconds: Math.ceil(left / 1000) })}
              style={{ position: "absolute", top: 0, bottom: 0, start: 0, end: 0, alignItems: "center", justifyContent: "center", gap: 6 }}
            >
              <AppText size={15} weight="medium" tone="ash" center>
                {paused ? t("workout.mode.paused") : t("workout.mode.rest")}
              </AppText>
              <Num size={96} tone="bone" tabular center>
                {formatClock(left)}
              </Num>
              <AppText size={14} tone="ash" center>
                {t("workout.mode.ofTotal", { time: ltr(formatClock(total)) })}
              </AppText>
            </View>
          </View>
        </View>

        {/* −15 · pause · +15 */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button label={ltr("−15")} accessibilityLabel={t("workout.mode.minus15")} variant="dark" size={56} block onPress={session.restMinus} />
          </View>
          <View style={{ flex: 1.3 }}>
            <Button
              label={paused ? t("workout.mode.resume") : t("workout.mode.pause")}
              icon={paused ? Play : Pause}
              variant="dark"
              size={56}
              block
              onPress={() => session.togglePause(s)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button label={ltr("+15")} accessibilityLabel={t("workout.mode.plus15")} variant="dark" size={56} block onPress={session.restPlus} />
          </View>
        </View>

        {/* Up next */}
        {s.next ? (
          <View
            style={{
              borderRadius: 20,
              backgroundColor: colors.iron2,
              paddingVertical: 14,
              paddingHorizontal: 16,
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
            }}
          >
            <View style={{ flex: 1, gap: 4 }}>
              <AppText size={13} weight="medium" tone="ash">
                {t("workout.mode.upNext")}
              </AppText>
              <AppText size={17} weight="semibold" tone="bone">
                {nextTitle}
              </AppText>
            </View>
            <Num size={26} tone="volt">
              {nextNums}
            </Num>
          </View>
        ) : null}

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Icon icon={Vibrate} size={18} color={colors.ash} />
          <AppText size={14} tone="ash" style={{ flexShrink: 1 }}>
            {t("workout.mode.putDown")}
          </AppText>
        </View>

        <Button
          label={t("workout.mode.skipRest")}
          icon={ChevronsRight}
          iconMirror
          variant="darkOutline"
          size={60}
          block
          onPress={session.skipRest}
        />
      </ScrollView>
    </View>
  );
}
