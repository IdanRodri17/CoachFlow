// components/workout/SetView.tsx — D20a: the dark set screen of workout mode
// (docs/design/screens/workout-set.html, DESIGN.md §6.1). One exercise at a
// time, two big steppers, set pills, and one tap — "סט בוצע" — per set.
//
// Presentational: everything comes from the session hook
// (lib/useWorkoutSession.ts). Swap / skip / demo / overview are callbacks so
// the screen that hosts this decides which sheet opens.

import type { ComponentProps } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import ArrowLeftRight from "lucide-react-native/icons/arrow-left-right";
import Check from "lucide-react-native/icons/check";
import ChevronsRight from "lucide-react-native/icons/chevrons-right";
import Minus from "lucide-react-native/icons/minus";
import Play from "lucide-react-native/icons/play";
import Plus from "lucide-react-native/icons/plus";
import Trophy from "lucide-react-native/icons/trophy";

import { ltr } from "@/lib/i18n";
import type { WorkoutSession } from "@/lib/useWorkoutSession";
import {
  exerciseName,
  formatClock,
  formatWeight,
  isLastSetOverall,
  isSwapped,
  pills,
  raisedTarget,
  restSecondsOf,
  type Pill,
} from "@/lib/workoutSession";
import { AppText, Button, colors, Display, Icon, IconButton, Num, type IconComponent } from "@/components/ui";

import { WorkoutHeader } from "./WorkoutHeader";

/** How long the volt "rest is over" banner stays after a rest ends. */
const REST_OVER_BANNER_MS = 1850;

export function SetView({
  session,
  title,
  trainerInitial,
  onMinimize,
  onOverview,
  onDemo,
  onSwap,
  onSkip,
}: {
  session: WorkoutSession;
  /** Workout (template) name for the header. */
  title: string;
  /** First letter of the trainer's name for the target line, when known. */
  trainerInitial?: string;
  onMinimize: () => void;
  onOverview: () => void;
  onDemo?: () => void;
  onSwap: () => void;
  onSkip: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { state: s, now } = session;
  const e = s.exercises[s.ex];
  const swapped = isSwapped(s, s.ex);
  const setNo = s.logs[s.ex].length + 1;
  const target = raisedTarget(s);
  const lastSet = isLastSetOverall(s);
  const showRestOver = s.restEndedAt != null && now - s.restEndedAt < REST_OVER_BANNER_MS;

  const lastNums = e.last
    ? e.last.weight != null
      ? `${formatWeight(e.last.weight)} × ${e.last.reps ?? "—"}`
      : `${e.last.reps ?? "—"}`
    : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.iron }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top,
          paddingBottom: Math.max(insets.bottom, 16) + 14,
          paddingHorizontal: 20,
          gap: 12,
        }}
      >
        <WorkoutHeader state={s} now={now} title={title} onMinimize={onMinimize} onOverview={onOverview} />

        {showRestOver ? (
          <View
            accessibilityLiveRegion="polite"
            style={{
              height: 44,
              borderRadius: 14,
              backgroundColor: colors.volt,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 16,
            }}
          >
            <AppText size={15} weight="semibold" center>
              {t("workout.mode.restOver", { n: setNo })}
            </AppText>
          </View>
        ) : null}

        {/* Exercise header */}
        <View style={{ gap: 4 }}>
          <AppText size={14} weight="medium" tone="ash">
            {t("workout.mode.exerciseOf", { n: s.ex + 1, total: s.exercises.length })}
          </AppText>
          <Display size={48} tone="bone">
            {exerciseName(s, s.ex)}
          </Display>
          {target != null ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
              {trainerInitial ? (
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: colors.volt,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <AppText size={11} weight="bold" lineHeight={14} center>
                    {trainerInitial}
                  </AppText>
                </View>
              ) : null}
              <AppText size={14} tone="ash">
                {t("workout.mode.targetRaised", { weight: ltr(formatWeight(target)) })}
              </AppText>
            </View>
          ) : null}
        </View>

        {/* הדגמה · החלפה · דילוג */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <SecondaryAction icon={Play} filled label={t("workout.mode.demo")} onPress={onDemo} />
          <SecondaryAction icon={ArrowLeftRight} label={t("workout.mode.swap")} onPress={onSwap} />
          <SecondaryAction icon={ChevronsRight} mirror label={t("workout.mode.skip")} onPress={onSkip} />
        </View>

        {/* Set line */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <AppText size={18} weight="semibold" tone="bone">
            {t("workout.mode.setOf", { n: setNo, total: e.sets })}
          </AppText>
          <AppText size={14} tone="ash" style={{ flexShrink: 1 }}>
            {swapped
              ? t("workout.mode.swappedNoHistory")
              : lastNums
                ? t("workout.mode.lastTime", { nums: ltr(lastNums) })
                : ""}
          </AppText>
        </View>

        {/* The two big steppers (bodyweight: a 64-tall row instead of weight) */}
        <View style={{ gap: 10 }}>
          {s.weight != null ? (
            <BigStepper
              label={t("workout.mode.weightGroup")}
              value={formatWeight(s.weight)}
              unit={t("workout.mode.kg")}
              downLabel={t("workout.mode.weightDown")}
              upLabel={t("workout.mode.weightUp")}
              onDown={session.weightDown}
              onUp={session.weightUp}
            />
          ) : (
            <View
              style={{
                height: 64,
                borderRadius: 20,
                backgroundColor: colors.iron2,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AppText size={17} weight="semibold" tone="bone" center>
                {t("workout.mode.bodyweight")}
              </AppText>
            </View>
          )}
          <BigStepper
            label={t("workout.mode.repsGroup")}
            value={String(s.reps)}
            unit={t("workout.mode.reps")}
            downLabel={t("workout.mode.repsDown")}
            upLabel={t("workout.mode.repsUp")}
            onDown={session.repsDown}
            onUp={session.repsUp}
          />
        </View>

        {/* Set pills */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {pills(s).map((p) => (
            <SetPill key={p.index} pill={p} />
          ))}
        </View>

        <View style={{ flex: 1, minHeight: 8 }} />

        {s.restOfferSeconds != null ? (
          <Button
            label={`${t("workout.mode.startRest")} ${formatClock(s.restOfferSeconds * 1000)}`}
            variant="darkOutline"
            size={56}
            block
            onPress={session.startRest}
          />
        ) : null}

        <Button label={t("workout.mode.setDone")} variant="accent" size={72} icon={Check} block onPress={session.logSet} />
        <AppText size={13} tone="ash" center>
          {lastSet
            ? t("workout.mode.lastSetHint")
            : t("workout.mode.restHint", { time: ltr(formatClock(restSecondsOf(e) * 1000)) })}
        </AppText>
      </ScrollView>
    </View>
  );
}

function SecondaryAction({
  icon,
  label,
  onPress,
  mirror,
  filled,
}: {
  icon: IconComponent;
  label: string;
  onPress?: () => void;
  mirror?: boolean;
  filled?: boolean;
}) {
  // A 44-tall iron-3 tile, radius 12, icon 18 + 14/600 (the reference's row).
  return (
    <View style={{ flex: 1 }}>
      <Button label={label} variant="dark" size={44} icon={filled ? FilledPlay : icon} iconMirror={mirror} block onPress={onPress} disabled={!onPress} />
    </View>
  );
}

/** The demo icon is a filled triangle in the reference. */
function FilledPlay(props: ComponentProps<typeof Play>) {
  return <Play {...props} fill={props.color} />;
}

function BigStepper({
  label,
  value,
  unit,
  downLabel,
  upLabel,
  onDown,
  onUp,
}: {
  label: string;
  value: string;
  unit: string;
  downLabel: string;
  upLabel: string;
  onDown: () => void;
  onUp: () => void;
}) {
  // [−] value [+] in logical order: − lands on the right in Hebrew.
  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      style={{
        height: 104,
        paddingHorizontal: 16,
        borderRadius: 24,
        backgroundColor: colors.iron2,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
      }}
    >
      <IconButton icon={Minus} variant="dark" size={64} shape="square" accessibilityLabel={downLabel} onPress={onDown} />
      <View style={{ flex: 1, flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 8 }}>
        <Num size={76} tone="bone">
          {value}
        </Num>
        <AppText size={17} weight="medium" tone="ash">
          {unit}
        </AppText>
      </View>
      <IconButton icon={Plus} variant="dark" size={64} shape="square" accessibilityLabel={upLabel} onPress={onUp} />
    </View>
  );
}

function SetPill({ pill }: { pill: Pill }) {
  const { t } = useTranslation();
  const base = { flex: 1, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" } as const;
  if (pill.status === "done") {
    const nums = pill.weight != null ? `${formatWeight(pill.weight)}×${pill.reps}` : String(pill.reps);
    return (
      <View
        accessibilityLabel={t("workout.mode.editSet", { n: pill.index + 1 })}
        style={[base, { backgroundColor: colors.iron3, gap: 3 }]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Icon icon={Check} size={13} color={colors.volt} strokeWidth={2.6} />
          <AppText size={12} lineHeight={15} tone="ash">
            {t("workout.mode.setShort", { n: pill.index + 1 })}
          </AppText>
          {pill.pr ? <Icon icon={Trophy} size={15} color={colors.volt} strokeWidth={2.2} /> : null}
        </View>
        <Num size={17} weight="semibold" tone="bone">
          {nums}
        </Num>
      </View>
    );
  }
  if (pill.status === "now") {
    return (
      <View style={[base, { borderWidth: 2, borderColor: colors.volt, gap: 2 }]}>
        <AppText size={12} lineHeight={15} weight="semibold" tone="volt">
          {t("workout.mode.now")}
        </AppText>
        <AppText size={14} lineHeight={18} weight="semibold" tone="bone">
          {t("workout.mode.setShort", { n: pill.index + 1 })}
        </AppText>
      </View>
    );
  }
  return (
    <View style={[base, { borderWidth: 1, borderColor: colors.ironLine }]}>
      <AppText size={14} weight="medium" tone="ash2">
        {t("workout.mode.setShort", { n: pill.index + 1 })}
      </AppText>
    </View>
  );
}
