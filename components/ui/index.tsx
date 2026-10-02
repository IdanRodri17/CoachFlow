// components/ui/index.tsx — D19b: the "Chalk & Iron" UI kit.
//
// Every value here is copied from the design handoff — docs/design/screens/
// design-system.html plus the screens that use each piece — per DESIGN.md §3.
// CSS px in the reference = dp here, 1:1. Don't round them.
//
// Why StyleSheet and not className inside the kit: two NativeWind classes that
// set the same property (text-ink + text-graphite) resolve by stylesheet order,
// not by the order you wrote them, so a kit that sets defaults with classes
// can't be overridden reliably. The kit sets its own look through `style` and
// typed props (tone, weight, size, variant); screens still use className for
// layout (margins, flex) on the outside of these components.
//
// RTL (lib/i18n.ts, DESIGN.md §7):
//   - Text uses textAlign 'left' = the START edge (RN swaps it under RTL).
//   - Rows are built in logical order and mirror through the root `direction`.
//   - Directional icons mirror via isRTL() (never I18nManager.isRTL, which
//     Expo Go resets); transforms and SVG don't mirror on their own.
//   - A Modal is a new native root, so Sheet re-applies the root `direction`.
//
// Fonts: React Native picks no font file from fontWeight, so each weight is its
// own family (loaded in app/_layout.tsx) and fontWeight is never set.

import {
  Children,
  forwardRef,
  isValidElement,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from "react-native";
import Animated, {
  SlideInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Svg, { Path, Rect } from "react-native-svg";
import type { LucideProps } from "lucide-react-native";
// One import per icon: the package root pulls in all ~3,700 icons, and Metro
// doesn't tree-shake.
import Activity from "lucide-react-native/icons/activity";
import Banknote from "lucide-react-native/icons/banknote";
import BellOff from "lucide-react-native/icons/bell-off";
import Check from "lucide-react-native/icons/check";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Clock from "lucide-react-native/icons/clock";
import Flame from "lucide-react-native/icons/flame";
import MessageSquare from "lucide-react-native/icons/message-square";
import Minus from "lucide-react-native/icons/minus";
import PhoneOff from "lucide-react-native/icons/phone-off";
import Plus from "lucide-react-native/icons/plus";
import Ticket from "lucide-react-native/icons/ticket";
import TriangleAlert from "lucide-react-native/icons/triangle-alert";
import Trophy from "lucide-react-native/icons/trophy";
import User from "lucide-react-native/icons/user";
import Users from "lucide-react-native/icons/users";
import X from "lucide-react-native/icons/x";

import {
  directionalTextClassName,
  isRTL,
  layoutDirection,
  ltr,
  LTR_INPUT_STYLE,
  LTR_WRITING_DIRECTION_ONLY,
} from "@/lib/i18n";

// ---------------------------------------------------------------------------
// Tokens — the same values as tailwind.config.js (DESIGN.md §2), for the places
// a class can't reach: icon colors, placeholders, spinners, this kit.
// ---------------------------------------------------------------------------
export const colors = {
  chalk: "#F5F4EF",
  paper: "#FFFFFF",
  white: "#FFFFFF",
  mist: "#ECEAE3",
  line: "#E3E0D7",
  lineStrong: "#D6D3C9",
  ink: "#131416",
  graphite: "#55585E",
  smoke: "#6B6E75",
  volt: "#D5F24B",
  voltSoft: "#EEF8C6",
  voltInk: "#3E5000",
  ember: "#B0381B",
  emberSoft: "#FDE6DD",
  gold: "#724F00",
  goldSoft: "#FFF0C4",
  sky: "#1D4DA3",
  skySoft: "#E2EBFB",
  iron: "#0D0E10",
  iron2: "#17191C",
  iron3: "#212428",
  ironLine: "#2B2F34",
  bone: "#F3F2EC",
  ash: "#A4A8AE",
  ash2: "#80858C",
  barPast: "#8C8F95",
} as const;
export type Tone = keyof typeof colors;

export const fonts = {
  display: "Karantina_700Bold",
  // The reference stacks 'Barlow Condensed' before 'Karantina', so Latin
  // headlines render in Barlow and Hebrew falls through to Karantina.
  displayLatin: "BarlowCondensed_700Bold",
  num: "BarlowCondensed_600SemiBold",
  numBold: "BarlowCondensed_700Bold",
  regular: "IBMPlexSansHebrew_400Regular",
  medium: "IBMPlexSansHebrew_500Medium",
  semibold: "IBMPlexSansHebrew_600SemiBold",
  bold: "IBMPlexSansHebrew_700Bold",
} as const;
export type Weight = "regular" | "medium" | "semibold" | "bold";

/** Any lucide icon (per-icon import) or a custom icon with the same props. */
export type IconComponent = ComponentType<LucideProps>;

/** isRTL(), plus a re-render when the language changes. */
export function useRTL(): boolean {
  useTranslation();
  return isRTL();
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------
type AppTextProps = TextProps & {
  size?: number;
  /** Absolute line height; defaults to size × 1.35 (DESIGN.md §2.2). */
  lineHeight?: number;
  weight?: Weight;
  tone?: Tone;
  center?: boolean;
  underline?: boolean;
  className?: string;
};

/** Body text: IBM Plex Sans Hebrew, ink, aligned to the start edge. */
export function AppText({
  size = 16,
  lineHeight,
  weight = "regular",
  tone = "ink",
  center,
  underline,
  style,
  ...rest
}: AppTextProps) {
  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: fonts[weight],
          fontSize: size,
          lineHeight: lineHeight ?? Math.round(size * 1.35),
          color: colors[tone],
          textAlign: center ? "center" : "left",
        },
        underline && { textDecorationLine: "underline" },
        style,
      ]}
    />
  );
}

const HEBREW = /[֐-׿]/;

function plainText(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(plainText).join("");
  return "";
}

/** Headline: Karantina 700 for Hebrew, Barlow Condensed 700 for Latin (the
 * reference's font stack), line height 1.02. 44 = screen title. */
export function Display({
  size = 44,
  tone = "ink",
  center,
  style,
  children,
  ...rest
}: TextProps & { size?: number; tone?: Tone; center?: boolean; className?: string }) {
  const rtl = useRTL();
  const text = plainText(children);
  const hebrew = text ? HEBREW.test(text) : rtl;
  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: hebrew ? fonts.display : fonts.displayLatin,
          fontSize: size,
          lineHeight: Math.round(size * 1.02),
          color: colors[tone],
          textAlign: center ? "center" : "left",
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/** A standalone number: Barlow Condensed, isolated LTR (so `40 × 10`, `−15`
 * and `0:42` never flip). `tabular` only for live timers and table columns. */
export function Num({
  size = 21,
  weight = "bold",
  tone = "ink",
  tabular,
  center,
  style,
  children,
  ...rest
}: TextProps & {
  size?: number;
  weight?: "semibold" | "bold";
  tone?: Tone;
  tabular?: boolean;
  center?: boolean;
  className?: string;
}) {
  const content =
    typeof children === "string" || typeof children === "number" ? ltr(String(children)) : children;
  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: weight === "bold" ? fonts.numBold : fonts.num,
          fontSize: size,
          // The reference uses 1; a hair more keeps Android from clipping.
          lineHeight: Math.round(size * 1.05),
          color: colors[tone],
          textAlign: center ? "center" : "left",
        },
        tabular && { fontVariant: ["tabular-nums"] },
        style,
      ]}
    >
      {content}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------
export function Icon({
  icon: IconCmp,
  size = 20,
  color = colors.ink,
  strokeWidth = 2,
  mirror,
}: {
  icon: IconComponent;
  size?: number;
  color?: string;
  strokeWidth?: number;
  /** Directional shapes (chevrons, back, skip) flip in RTL. Media never does. */
  mirror?: boolean;
}) {
  const rtl = useRTL();
  return (
    <IconCmp
      size={size}
      color={color}
      strokeWidth={strokeWidth}
      style={mirror && rtl ? { transform: [{ scaleX: -1 }] } : undefined}
    />
  );
}

/** "No app": a phone with a slash, drawn from the reference's own path —
 * lucide has no smartphone-off. */
export function SmartphoneOff({ size = 24, color = colors.ink, strokeWidth = 2, style }: LucideProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <Rect x={7} y={3} width={10} height={18} rx={2.5} />
      <Path d="M4 4l16 16" />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Press feedback: scale .97. The outer Pressable takes layout (style /
// className — margins, flex); the inner Animated.View carries the look.
// ---------------------------------------------------------------------------
function PressScale({
  style,
  contentStyle,
  children,
  onPressIn,
  onPressOut,
  ...rest
}: Omit<PressableProps, "style" | "children"> & {
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
  className?: string;
}) {
  const scale = useSharedValue(1);
  const scaled = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      {...rest}
      style={style}
      // .set() rather than `.value =`: the React Compiler lint treats hook
      // return values as immutable.
      onPressIn={(e) => {
        scale.set(withTiming(0.97, { duration: 90 }));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withTiming(1, { duration: 140 }));
        onPressOut?.(e);
      }}
    >
      <Animated.View style={[contentStyle, scaled]}>{children}</Animated.View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
export type ButtonVariant =
  | "primary"
  | "accent"
  | "secondary"
  | "soft"
  | "ghost"
  | "danger"
  | "dark"
  | "darkOutline";

const BUTTON_LOOK: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.ink, fg: colors.white },
  accent: { bg: colors.volt, fg: colors.ink },
  secondary: { bg: colors.paper, fg: colors.ink, border: colors.lineStrong },
  soft: { bg: colors.mist, fg: colors.ink },
  ghost: { bg: "transparent", fg: colors.ink },
  danger: { bg: "transparent", fg: colors.ember },
  dark: { bg: colors.iron3, fg: colors.bone },
  darkOutline: { bg: "transparent", fg: colors.bone, border: colors.ironLine },
};

// height → [radius, horizontal padding, font size, icon size]
const BUTTON_SIZE = {
  44: [12, 12, 14, 18],
  52: [14, 20, 16, 20],
  56: [16, 20, 17, 20],
  60: [18, 20, 17, 20], // workout "skip rest"
  64: [20, 20, 17, 22],
  72: [24, 20, 22, 28], // workout "סט בוצע"
} as const;

export function Button({
  label,
  onPress,
  variant = "primary",
  size = 52,
  icon,
  iconMirror,
  block,
  disabled,
  loading,
  accessibilityLabel,
  style,
  className,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: 44 | 52 | 56 | 60 | 64 | 72;
  icon?: IconComponent;
  iconMirror?: boolean;
  /** Full width. */
  block?: boolean;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  className?: string;
}) {
  const look = BUTTON_LOOK[variant];
  const [radius, padX, fontSize, iconSize] = BUTTON_SIZE[size];
  // 700 on the tall volt CTAs, 600 everywhere else (DESIGN.md §2.2).
  const weight: Weight = variant === "accent" && size >= 56 ? "bold" : "semibold";
  return (
    <PressScale
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      className={className}
      style={[block && { alignSelf: "stretch" }, style]}
      contentStyle={{
        height: size,
        paddingHorizontal: padX,
        borderRadius: radius,
        backgroundColor: look.bg,
        borderWidth: look.border ? 1 : 0,
        borderColor: look.border,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: size === 72 ? 10 : 8,
        opacity: disabled ? 0.38 : 1,
      }}
    >
      {loading ? (
        <ActivityIndicator color={look.fg} />
      ) : (
        <>
          {icon ? (
            <Icon
              icon={icon}
              size={iconSize}
              color={look.fg}
              strokeWidth={size === 72 ? 2.8 : 2}
              mirror={iconMirror}
            />
          ) : null}
          <Text
            numberOfLines={1}
            style={{ fontFamily: fonts[weight], fontSize, lineHeight: Math.round(fontSize * 1.3), color: look.fg }}
          >
            {label}
          </Text>
        </>
      )}
    </PressScale>
  );
}

/** A text-only action with a 44 hit area ("מספר אחר", "דילוג"). */
export function TextButton({
  label,
  onPress,
  size = 14,
  tone = "graphite",
  underline,
  disabled,
  style,
  className,
}: {
  label: string;
  onPress?: () => void;
  size?: number;
  tone?: Tone;
  underline?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  className?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      className={className}
      style={({ pressed }) => [
        { height: 44, paddingHorizontal: 8, justifyContent: "center", opacity: disabled ? 0.38 : pressed ? 0.6 : 1 },
        style,
      ]}
    >
      <AppText size={size} weight="semibold" tone={tone} underline={underline} numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

export type IconButtonVariant = "soft" | "dark" | "primary" | "ghost" | "paper";

const ICON_BUTTON_LOOK: Record<IconButtonVariant, { bg: string; fg: string; border?: string }> = {
  soft: { bg: colors.mist, fg: colors.ink },
  dark: { bg: colors.iron3, fg: colors.bone },
  primary: { bg: colors.ink, fg: colors.white },
  ghost: { bg: "transparent", fg: colors.ink },
  paper: { bg: colors.paper, fg: colors.ink, border: colors.lineStrong },
};

/** Icon-only button. `accessibilityLabel` is required — there's no text. */
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  variant = "soft",
  size = 44,
  shape = "round",
  iconSize,
  iconColor,
  mirror,
  disabled,
  style,
  className,
}: {
  icon: IconComponent;
  accessibilityLabel: string;
  onPress?: () => void;
  variant?: IconButtonVariant;
  size?: 44 | 48 | 56 | 64;
  /** round = 50%; square = 16 (48) / 20 (64), as on the board. */
  shape?: "round" | "square";
  iconSize?: number;
  iconColor?: string;
  mirror?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  className?: string;
}) {
  const look = ICON_BUTTON_LOOK[variant];
  const radius = shape === "round" ? size / 2 : size >= 64 ? 20 : 16;
  return (
    <PressScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className={className}
      style={style}
      contentStyle={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: look.bg,
        borderWidth: look.border ? 1 : 0,
        borderColor: look.border,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.38 : 1,
      }}
    >
      <Icon
        icon={icon}
        size={iconSize ?? (size >= 64 ? 28 : size >= 48 ? 22 : 20)}
        color={iconColor ?? look.fg}
        mirror={mirror}
      />
    </PressScale>
  );
}

// ---------------------------------------------------------------------------
// Chips
// ---------------------------------------------------------------------------
export type ChipKind =
  | "done"
  | "missed"
  | "risk"
  | "unpaid"
  | "lowPackage"
  | "trainer"
  | "solo"
  | "noApp"
  | "pr"
  | "pain"
  | "streak"
  | "neutral"
  | "next"
  | "sms"
  | "unreachable"
  | "smsOff";

const CHIP_LOOK: Record<ChipKind, { bg: string; fg: string; icon?: IconComponent }> = {
  done: { bg: colors.voltSoft, fg: colors.voltInk, icon: Check },
  missed: { bg: colors.emberSoft, fg: colors.ember, icon: TriangleAlert },
  risk: { bg: colors.emberSoft, fg: colors.ember, icon: TriangleAlert },
  unpaid: { bg: colors.goldSoft, fg: colors.gold, icon: Banknote },
  lowPackage: { bg: colors.goldSoft, fg: colors.gold, icon: Ticket },
  trainer: { bg: colors.skySoft, fg: colors.sky, icon: Users },
  solo: { bg: colors.mist, fg: colors.graphite, icon: User },
  noApp: { bg: colors.mist, fg: colors.graphite, icon: SmartphoneOff },
  pr: { bg: colors.volt, fg: colors.ink, icon: Trophy },
  pain: { bg: colors.emberSoft, fg: colors.ember, icon: Activity },
  streak: { bg: colors.mist, fg: colors.graphite, icon: Flame },
  neutral: { bg: colors.mist, fg: colors.graphite },
  next: { bg: colors.ink, fg: colors.white, icon: Clock },
  sms: { bg: colors.voltSoft, fg: colors.voltInk, icon: MessageSquare },
  unreachable: { bg: colors.goldSoft, fg: colors.gold, icon: PhoneOff },
  smsOff: { bg: colors.mist, fg: colors.graphite, icon: BellOff },
};

/** Status chip: 26 tall, always an icon + a word (never color alone). */
export function Chip({
  kind,
  label,
  icon,
  style,
}: {
  kind: ChipKind;
  label: string;
  /** Overrides the kind's icon. */
  icon?: IconComponent;
  style?: StyleProp<ViewStyle>;
}) {
  const look = CHIP_LOOK[kind];
  const ChipIcon = icon ?? look.icon;
  return (
    <View
      style={[
        {
          height: 26,
          paddingHorizontal: 10,
          borderRadius: 13,
          backgroundColor: look.bg,
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          alignSelf: "flex-start",
        },
        style,
      ]}
    >
      {ChipIcon ? <Icon icon={ChipIcon} size={14} color={look.fg} strokeWidth={2.4} /> : null}
      <Text numberOfLines={1} style={{ fontFamily: fonts.semibold, fontSize: 13, lineHeight: 17, color: look.fg }}>
        {label}
      </Text>
    </View>
  );
}

/** Selectable chip: 44 tall, radius 12. Off = paper + line.strong, on = ink. */
export function SelectChip({
  label,
  selected,
  onPress,
  dark,
  icon,
  disabled,
  style,
}: {
  label: string;
  selected: boolean;
  onPress?: () => void;
  dark?: boolean;
  icon?: IconComponent;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = dark ? (selected ? colors.volt : colors.iron2) : selected ? colors.ink : colors.paper;
  const border = dark ? (selected ? colors.volt : colors.ironLine) : selected ? colors.ink : colors.lineStrong;
  const fg = dark ? (selected ? colors.ink : colors.bone) : selected ? colors.white : colors.ink;
  return (
    <PressScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !!disabled }}
      style={style}
      contentStyle={{
        height: 44,
        paddingHorizontal: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: border,
        backgroundColor: bg,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        opacity: disabled ? 0.38 : 1,
      }}
    >
      {icon ? <Icon icon={icon} size={18} color={fg} /> : null}
      <Text numberOfLines={1} style={{ fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: fg }}>
        {label}
      </Text>
    </PressScale>
  );
}

// ---------------------------------------------------------------------------
// Segmented control
// ---------------------------------------------------------------------------
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  dark,
  style,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  /** md = 44 tall (screens), lg = 48 (sheets and forms). */
  size?: "md" | "lg";
  dark?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const height = size === "lg" ? 48 : 44;
  return (
    <View
      accessibilityRole="radiogroup"
      style={[
        {
          height,
          padding: 4,
          gap: 2,
          borderRadius: 14,
          backgroundColor: dark ? colors.iron3 : colors.mist,
          flexDirection: "row",
        },
        style,
      ]}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            style={[
              {
                flex: 1,
                height: height - 8,
                borderRadius: 10,
                paddingHorizontal: 12,
                alignItems: "center",
                justifyContent: "center",
              },
              selected && [{ backgroundColor: dark ? colors.bone : colors.paper }, styles.segmentShadow],
            ]}
          >
            <Text
              numberOfLines={1}
              style={{
                fontFamily: fonts.semibold,
                fontSize: 15,
                lineHeight: 20,
                color: selected ? colors.ink : dark ? colors.ash : colors.graphite,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Toggle
// ---------------------------------------------------------------------------
/** 52×32 switch. The knob sits on the physical RIGHT when on, in both
 * languages: that's how the Hebrew reference draws it, and it's the platform
 * convention in English. So the track is laid out LTR on purpose. */
export function Toggle({
  value,
  onValueChange,
  accessibilityLabel,
  disabled,
}: {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel: string;
  disabled?: boolean;
}) {
  const knob = useAnimatedStyle(() => ({
    transform: [{ translateX: withTiming(value ? 20 : 0, { duration: 160 }) }],
  }));
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      hitSlop={6}
      style={{
        direction: "ltr",
        width: 52,
        height: 32,
        borderRadius: 16,
        padding: 3,
        backgroundColor: value ? colors.ink : colors.lineStrong,
        opacity: disabled ? 0.38 : 1,
      }}
    >
      <Animated.View style={[styles.toggleKnob, knob]} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Checkbox (onboarding consents)
// ---------------------------------------------------------------------------
export function Checkbox({
  checked,
  onToggle,
  children,
  disabled,
}: {
  checked: boolean;
  onToggle: () => void;
  /** The label; rendered inside one Text so it can nest a link. */
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !!disabled }}
      style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, minHeight: 44 }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          marginTop: 2,
          borderRadius: 5,
          borderWidth: checked ? 0 : 1.5,
          borderColor: colors.smoke,
          backgroundColor: checked ? colors.ink : colors.paper,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked ? <Icon icon={Check} size={15} color={colors.white} strokeWidth={3} /> : null}
      </View>
      <AppText size={15} lineHeight={22} style={{ flex: 1 }}>
        {children}
      </AppText>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Cards and lists
// ---------------------------------------------------------------------------
export function Card({
  children,
  hero,
  style,
  className,
}: {
  children: ReactNode;
  /** radius 28, padding 20. */
  hero?: boolean;
  style?: StyleProp<ViewStyle>;
  className?: string;
}) {
  return (
    <View
      className={className}
      style={[
        {
          backgroundColor: colors.paper,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: hero ? 28 : 20,
          padding: hero ? 20 : 16,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Hairline between list rows (#ECEAE3), inset from both sides. */
export function Divider({ inset = 14, dark }: { inset?: number; dark?: boolean }) {
  return <View style={{ height: 1, marginHorizontal: inset, backgroundColor: dark ? colors.ironLine : colors.mist }} />;
}

/** Rows in one card with inset hairlines between them. */
export function ListCard({
  children,
  inset = 14,
  padded,
  style,
  className,
}: {
  children: ReactNode;
  /** Hairline inset: 14 for list rows, 16 for settings rows. */
  inset?: number;
  /** 4 dp top/bottom padding, as the settings groups have. */
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  className?: string;
}) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View
      className={className}
      style={[
        {
          backgroundColor: colors.paper,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: 20,
          overflow: "hidden",
          paddingVertical: padded ? 4 : 0,
        },
        style,
      ]}
    >
      {rows.map((row, i) => (
        <View key={row.key ?? i}>
          {i > 0 ? <Divider inset={inset} /> : null}
          {row}
        </View>
      ))}
    </View>
  );
}

/** A list row. `row` = 72 tall (people, sessions); `setting` = 56 tall with a
 * 22 icon and a toggle or chevron at the end. */
export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  chevron,
  density = "row",
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  /** Shows a mirrored chevron at the end (navigates somewhere). */
  chevron?: boolean;
  density?: "row" | "setting";
  accessibilityLabel?: string;
}) {
  const setting = density === "setting";
  const body = (
    <>
      {leading}
      <View style={{ flex: 1, minWidth: 0, gap: setting ? 2 : 3 }}>
        <AppText size={16} weight={setting ? "medium" : "semibold"} lineHeight={22}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText size={setting ? 13 : 14} tone={setting ? "smoke" : "graphite"} lineHeight={setting ? 18 : 19}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {trailing}
      {chevron ? <Icon icon={ChevronRight} size={20} color={colors.smoke} mirror /> : null}
    </>
  );
  const rowStyle: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    gap: setting ? 14 : 12,
    minHeight: setting ? 56 : 72,
    paddingVertical: setting ? 8 : 12,
    paddingHorizontal: setting ? 16 : 14,
  };
  if (!onPress) return <View style={rowStyle}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [rowStyle, pressed && { backgroundColor: colors.chalk }]}
    >
      {body}
    </Pressable>
  );
}

/** Section title 18/600 + optional " · count" + an optional link with a 44 hit area. */
export function SectionHeader({
  title,
  count,
  linkLabel,
  onLinkPress,
  style,
}: {
  title: string;
  count?: string;
  linkLabel?: string;
  onLinkPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 32, gap: 8 },
        style,
      ]}
    >
      <AppText size={18} weight="semibold" lineHeight={23} style={{ flexShrink: 1 }}>
        {title}
        {count ? (
          <Text style={{ fontFamily: fonts.medium, color: colors.smoke }}>{` · ${count}`}</Text>
        ) : null}
      </AppText>
      {linkLabel ? (
        <Pressable
          onPress={onLinkPress}
          accessibilityRole="link"
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 2,
            minHeight: 44,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <AppText size={14} weight="semibold" tone="graphite">
            {linkLabel}
          </AppText>
          <Icon icon={ChevronRight} size={16} color={colors.graphite} mirror />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Label above a group of settings rows: 14/600 graphite, 4 dp in. */
export function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <AppText size={14} weight="semibold" tone="graphite" style={{ paddingHorizontal: 4 }}>
      {children}
    </AppText>
  );
}

/** Label above a form field: 14/600 graphite. */
export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <AppText size={14} weight="semibold" tone="graphite">
      {children}
    </AppText>
  );
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------
type InputProps = TextInputProps & {
  /** lg = 56 (auth), md = 52 (sheets, forms). */
  size?: "lg" | "md";
  /** true: always LTR and left-aligned (phones, codes, URLs).
   * "start": LTR characters, aligned to the language's start (prices, sizes). */
  ltr?: boolean | "start";
  /** Text at the end of the field (₪, אימונים). */
  suffix?: string;
  invalid?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
};

/** Text field: paper, 1px line.strong, radius 14, 17/500. Free text follows the
 * language (directionalTextClassName); `ltr` for phones and numbers. */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  { size = "lg", ltr: ltrMode, suffix, invalid, containerStyle, multiline, style, ...rest },
  ref,
) {
  useTranslation(); // re-align when the language changes
  const inputAlign =
    ltrMode === true ? LTR_INPUT_STYLE : ltrMode === "start" ? LTR_WRITING_DIRECTION_ONLY : undefined;
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: multiline ? "flex-start" : "center",
          gap: 10,
          minHeight: size === "lg" ? 56 : 52,
          height: multiline ? undefined : size === "lg" ? 56 : 52,
          paddingHorizontal: 16,
          paddingVertical: multiline ? 14 : 0,
          borderWidth: 1,
          borderColor: invalid ? colors.ember : colors.lineStrong,
          borderRadius: 14,
          backgroundColor: colors.paper,
        },
        ltrMode === true && { direction: "ltr" },
        containerStyle,
      ]}
    >
      <TextInput
        ref={ref}
        placeholderTextColor={colors.smoke}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        {...rest}
        className={ltrMode === true ? undefined : directionalTextClassName()}
        style={[
          {
            flex: 1,
            minWidth: 0,
            alignSelf: "stretch",
            fontFamily: fonts.medium,
            fontSize: 17,
            color: colors.ink,
            paddingVertical: 0,
          },
          inputAlign,
          style,
        ]}
      />
      {suffix ? (
        <AppText size={15} weight="medium" tone="smoke">
          {suffix}
        </AppText>
      ) : null}
    </View>
  );
});

/** A 6-box code field (SMS code, invite code): one hidden TextInput drawn as
 * boxes, so OS one-time-code autofill fills all six at once. Always LTR. */
export function CodeInput({
  value,
  onChangeText,
  length = 6,
  accessibilityLabel,
  editable = true,
  invalid,
  inputProps,
}: {
  value: string;
  onChangeText: (value: string) => void;
  length?: number;
  accessibilityLabel: string;
  editable?: boolean;
  invalid?: boolean;
  /** keyboardType, textContentType, autoComplete, autoCapitalize, autoFocus… */
  inputProps?: Omit<TextInputProps, "value" | "onChangeText" | "maxLength" | "editable">;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ direction: "ltr" }}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {Array.from({ length }, (_, i) => {
          const char = value[i];
          const current = focused && i === Math.min(value.length, length - 1) && value.length < length;
          return (
            <View
              key={i}
              style={{
                flex: 1,
                height: 64,
                borderRadius: 14,
                backgroundColor: colors.paper,
                borderWidth: current ? 2 : 1,
                borderColor: invalid ? colors.ember : char || current ? colors.ink : colors.lineStrong,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {char ? (
                <Num size={30}>{char}</Num>
              ) : current ? (
                <View style={{ width: 2, height: 28, backgroundColor: colors.ink }} />
              ) : null}
            </View>
          );
        })}
      </View>
      <TextInput
        {...inputProps}
        value={value}
        onChangeText={(v) => onChangeText(v.slice(0, length))}
        maxLength={length}
        editable={editable}
        accessibilityLabel={accessibilityLabel}
        caretHidden
        onFocus={(e) => {
          setFocused(true);
          inputProps?.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          inputProps?.onBlur?.(e);
        }}
        // Covers the boxes (so a tap on any box focuses it) but is invisible.
        style={[StyleSheet.absoluteFill, { color: "transparent", opacity: 0.02, fontSize: 1 }]}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Avatar, meters, stepper
// ---------------------------------------------------------------------------
const AVATAR_TINTS = ["#E6E0D0", "#D9E2EA", "#E3DCEA", "#DAE5D6", "#EBDCD3", "#E1E1DA"];

function hashTint(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_TINTS[Math.abs(h) % AVATAR_TINTS.length];
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
}

/** Initials on a tint picked by a hash of the id (stable per person). */
export function Avatar({ id, name, size = 44 }: { id: string; name: string; size?: number }) {
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: hashTint(id),
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontFamily: fonts.semibold, fontSize: Math.round(size * 0.345), color: colors.ink }}>
        {initials(name)}
      </Text>
    </View>
  );
}

/** Continuous bar, filling from the start edge. value 0–1. */
export function Meter({ value, height = 8, dark }: { value: number; height?: number; dark?: boolean }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View
      style={{
        height,
        borderRadius: height / 2,
        backgroundColor: dark ? colors.iron3 : colors.mist,
        overflow: "hidden",
        flexDirection: "row",
      }}
    >
      <View style={{ width: `${pct}%`, backgroundColor: dark ? colors.volt : colors.ink }} />
    </View>
  );
}

/** One cell per unit (package sessions, check-in scale), filled from the start. */
export function SegmentMeter({
  total,
  filled,
  height = 10,
  dark,
}: {
  total: number;
  filled: number;
  height?: number;
  dark?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {Array.from({ length: Math.max(0, total) }, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height,
            borderRadius: height / 2,
            backgroundColor:
              i < filled ? (dark ? colors.volt : colors.ink) : dark ? colors.iron3 : colors.mist,
          }}
        />
      ))}
    </View>
  );
}

/** Mini stepper, 52 tall: [−] value [+]. Written in logical order so − lands
 * on the right in Hebrew, like a Hebrew number line. */
export function Stepper({
  value,
  unit,
  onDecrement,
  onIncrement,
  decrementLabel,
  incrementLabel,
  background = colors.chalk,
}: {
  value: string | number;
  unit?: string;
  onDecrement: () => void;
  onIncrement: () => void;
  decrementLabel: string;
  incrementLabel: string;
  /** chalk inside a paper card (the reference), mist on chalk. */
  background?: string;
}) {
  return (
    <View
      accessibilityRole="adjustable"
      style={{
        flexDirection: "row",
        alignItems: "center",
        height: 52,
        padding: 4,
        borderRadius: 14,
        backgroundColor: background,
      }}
    >
      <IconButton icon={Minus} accessibilityLabel={decrementLabel} onPress={onDecrement} variant="ghost" shape="square" />
      <View style={{ flex: 1, flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 4 }}>
        <Num size={24}>{value}</Num>
        {unit ? (
          <AppText size={13} weight="medium" tone="graphite">
            {unit}
          </AppText>
        ) : null}
      </View>
      <IconButton icon={Plus} accessibilityLabel={incrementLabel} onPress={onIncrement} variant="ghost" shape="square" />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Bottom sheet
// ---------------------------------------------------------------------------
export function Sheet({
  visible,
  onClose,
  closeLabel,
  title,
  dark,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  /** Accessibility label for the scrim and the close button. */
  closeLabel: string;
  title?: string;
  dark?: boolean;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const dir = layoutDirection();
  useTranslation();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      {/* A Modal is a new native root: the app's `direction` doesn't reach it. */}
      <View style={{ flex: 1, justifyContent: "flex-end", direction: dir }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: dark ? "rgba(0,0,0,0.62)" : "rgba(19,20,22,0.46)" }]}
        />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Animated.View
            entering={SlideInDown.duration(240)}
            style={[
              styles.sheet,
              {
                backgroundColor: dark ? colors.iron2 : colors.paper,
                paddingBottom: Math.max(34, insets.bottom + 12),
              },
            ]}
          >
            <View
              style={{
                width: 40,
                height: 5,
                borderRadius: 3,
                alignSelf: "center",
                backgroundColor: dark ? colors.ironLine : colors.lineStrong,
              }}
            />
            {title ? (
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <AppText size={22} weight="semibold" lineHeight={29} tone={dark ? "bone" : "ink"} style={{ flex: 1 }}>
                  {title}
                </AppText>
                <IconButton icon={X} accessibilityLabel={closeLabel} onPress={onClose} variant={dark ? "dark" : "soft"} />
              </View>
            ) : null}
            {children}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  segmentShadow: {
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 1,
  },
  toggleKnob: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.white,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 2,
    elevation: 2,
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 20,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.18,
    shadowRadius: 40,
    elevation: 16,
  },
});
