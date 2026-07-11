// lib/i18n.ts — V12a: i18next setup (en/he) + RTL wiring.
//
// Device-locale detection (expo-localization) picks the language on a true
// first launch; a manual choice (Profile > Language) is persisted locally
// via AsyncStorage so it survives app restarts, independent of auth — no
// profile row is needed to have a language preference.
//
// RTL note: React Native only fully re-mirrors layouts after a JS reload
// once I18nManager.forceRTL() flips the direction. promptReload() handles
// that via DevSettings.reload() — but ONLY in dev/EAS builds. In Expo Go the
// runtime forceRTL() call is a guaranteed no-op: Expo Go's kernel
// (ExperienceRTLManager) rewrites RN's RTL prefs from the manifest's
// extra.supportsRTL/forcesRTL on EVERY project load, before JS runs
// (docs: "Expo Go resets RTL preferences when opening the launcher or
// individual projects"). With extra.supportsRTL=true in app.json, Expo Go
// follows the DEVICE language (Hebrew device → RTL); in-app direction
// switching needs a dev build. A production EAS build would use
// expo-updates' reloadAsync() instead of DevSettings.reload().

import { Alert, DevSettings, I18nManager } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Localization from "expo-localization";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import he from "./locales/he.json";

export type SupportedLocale = "en" | "he";
export const SUPPORTED_LOCALES: SupportedLocale[] = ["en", "he"];
const RTL_LOCALES: SupportedLocale[] = ["he"];
const STORAGE_KEY = "coachflow.locale";

function isSupportedLocale(v: string | null | undefined): v is SupportedLocale {
  return v === "en" || v === "he";
}

function deviceLocale(): SupportedLocale {
  return Localization.getLocales()[0]?.languageCode === "he" ? "he" : "en";
}

const initialLocale = deviceLocale();

i18next.use(initReactI18next).init({
  resources: { en: { translation: en }, he: { translation: he } },
  lng: initialLocale,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

// Applied synchronously at import time so the very first render is already
// mirrored correctly for a device set to Hebrew.
I18nManager.allowRTL(true);
I18nManager.forceRTL(RTL_LOCALES.includes(initialLocale));

function promptReload() {
  Alert.alert(
    i18next.language === "he" ? "נדרשת הפעלה מחדש" : "Restart needed",
    i18next.language === "he"
      ? "כדי להחיל את כיוון התצוגה החדש, יש להפעיל את האפליקציה מחדש."
      : "The app needs to restart to apply the new layout direction.",
    [{ text: i18next.language === "he" ? "הפעל מחדש" : "Restart now", onPress: () => DevSettings.reload() }],
  );
}

/** Call once on app start — restores a previously-chosen locale, if any. */
export async function restoreSavedLocale(): Promise<void> {
  const saved = await AsyncStorage.getItem(STORAGE_KEY);
  if (!isSupportedLocale(saved) || saved === i18next.language) return;

  await i18next.changeLanguage(saved);
  const shouldBeRTL = RTL_LOCALES.includes(saved);
  if (I18nManager.isRTL !== shouldBeRTL) {
    I18nManager.forceRTL(shouldBeRTL);
    promptReload();
  }
}

/** Switches the active language, persists it, and prompts a reload if RTL flipped. */
export async function setLocale(locale: SupportedLocale): Promise<void> {
  await i18next.changeLanguage(locale);
  await AsyncStorage.setItem(STORAGE_KEY, locale);

  const shouldBeRTL = RTL_LOCALES.includes(locale);
  if (I18nManager.isRTL !== shouldBeRTL) {
    I18nManager.forceRTL(shouldBeRTL);
    promptReload();
  }
}

/**
 * True once the app is actually running RTL (only changes after the reload
 * setLocale/restoreSavedLocale triggers, so it's safe to read at render time
 * — no hook needed). Use this to align free-typed text fields (names, notes,
 * descriptions) with the current language; leave phone/email/OTP/numeric
 * inputs and anything already centered alone (see LTR_TEXT_STYLE below).
 */
export function isRTL(): boolean {
  return I18nManager.isRTL;
}

/** className to append to a **TextInput ONLY** that should follow the current
 * language's direction (e.g. a name or notes field).
 *
 * NEVER use this on a plain <Text> — Text and TextInput have OPPOSITE
 * textAlign semantics on this stack (verified on-device with a 9-variant
 * experiment, V12a):
 *   - <Text>: RN swaps textAlign left<->right under RTL (logical start/end;
 *     RCTAttributedTextUtils.mm). Natural (no textAlign) renders LEFT even
 *     for Hebrew. So titles/labels use a literal `text-left` class, which
 *     means "start edge": left in English, right in Hebrew.
 *   - <TextInput>: NativeWind lifts textAlign into the native prop
 *     (absolute, unswapped), so it needs this isRTL()-driven value. */
export function directionalTextClassName(): string {
  return isRTL() ? "text-right" : "text-left";
}

/** Style to force on inputs that must ALWAYS stay LTR regardless of app
 * language — phone numbers, emails, URLs, plain numeric entry
 * (reps/weight/sets/prices). Hebrew UIs conventionally keep these LTR even
 * inside an otherwise RTL-flowing screen. An explicit `style` prop overrides
 * className-derived alignment, so only use this on inputs that aren't
 * ALSO deliberately centered via className (e.g. a centered OTP code box) —
 * for those, use LTR_WRITING_DIRECTION_ONLY instead so the centering survives. */
export const LTR_INPUT_STYLE = { writingDirection: "ltr", textAlign: "left" } as const;

/** Forces LTR typing/character order WITHOUT touching alignment — use this
 * (instead of LTR_INPUT_STYLE) on inputs that are already centered via
 * className (e.g. a centered OTP/code box), so the centering isn't
 * overridden by an explicit textAlign. */
export const LTR_WRITING_DIRECTION_ONLY = { writingDirection: "ltr" } as const;

export default i18next;
