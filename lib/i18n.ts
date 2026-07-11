// lib/i18n.ts — V12a: i18next setup (en/he) + RTL wiring.
//
// Device-locale detection (expo-localization) picks the language on a true
// first launch; a manual choice (Profile > Language) is persisted locally
// via AsyncStorage so it survives app restarts, independent of auth — no
// profile row is needed to have a language preference.
//
// RTL note (V12a, current): I18nManager.isRTL is a NATIVE flag Expo Go
// forcibly re-syncs to the PHONE's system language on every project open —
// I18nManager.forceRTL() is a guaranteed no-op there (Expo Go's kernel,
// ExperienceRTLManager, overwrites the same RTL prefs before JS runs; see
// PR expo/expo#19634 and open issues #39752/#32976/#26532 on this exact
// SDK/RN combo — unresolved across 5+ SDK cycles, not something we can fix
// from app code). So isRTL()/directionalTextClassName() below read
// i18next.language directly instead — changes the instant setLocale() calls
// changeLanguage(), no native flag or reload involved.
//
// The rest of the app's mirroring (plain <View>/flex-row layout, <Text>
// textAlign auto-swap) is driven by React Native's Yoga layout engine, which
// resolves direction PER NODE from an explicit `direction` style — inherited
// from whichever ancestor sets it, completely independent of I18nManager and
// NOT touched by Expo Go's native-pref reset (verified against this
// project's actual installed react-native/@react-navigation source — see
// memory/expo-go-rtl-limitation.md). app/_layout.tsx sets `direction:
// isRTL() ? "rtl" : "ltr"` on a plain View wrapping the app content (and on
// React Navigation's LocaleDirContext, which the tab bar reads) so the whole
// tree mirrors from i18next.language, live, in Expo Go, no reload.
//
// IMPORTANT: an earlier attempt at this appeared to break scrolling/tab
// navigation/button taps app-wide and was reverted — but the actual cause
// was unrelated: app/(tabs)/profile.tsx had no ScrollView at all, so the
// (unbounded-length) V15 nutrition plan text pushed its buttons off-screen
// with no way to reach them, independent of anything here. That's fixed now
// (profile.tsx has a real ScrollView; the long content moved to its own
// screen), so this fix is back in place. If real interactivity issues show
// up again, verify they're not screen-specific layout bugs before assuming
// this mechanism is at fault — it's been traced end-to-end against the
// actual RN/Yoga source and never independently disproven.
//
// forceRTL()/allowRTL() are still called below (harmless, isExpoGo-guarded)
// because they still matter for the small slice of native-only chrome Yoga
// doesn't touch (status bar, native TextInput caret direction) — but ONLY
// in a real dev-client/EAS build, where Expo Go's reset doesn't apply.

import { Alert, DevSettings, I18nManager } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Localization from "expo-localization";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import he from "./locales/he.json";

export type SupportedLocale = "en" | "he";
export const SUPPORTED_LOCALES: SupportedLocale[] = ["en", "he"];
const RTL_LOCALES: SupportedLocale[] = ["he"];
const STORAGE_KEY = "coachflow.locale";

// In Expo Go, I18nManager.forceRTL() is a guaranteed no-op (see the file-header
// note below) — so a reload can NEVER reconcile a saved-locale/RTL mismatch
// there. Without this guard, restoreSavedLocale()/setLocale() would show the
// restart prompt, the user restarts, the same mismatch is detected again, and
// it loops forever. Only attempt the forceRTL+reload dance outside Expo Go
// (dev client / EAS build), where it genuinely works.
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

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
  if (isExpoGo) return; // Can't reconcile RTL here — see isExpoGo comment above.

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
  if (isExpoGo) return; // Can't reconcile RTL here — see isExpoGo comment above.

  const shouldBeRTL = RTL_LOCALES.includes(locale);
  if (I18nManager.isRTL !== shouldBeRTL) {
    I18nManager.forceRTL(shouldBeRTL);
    promptReload();
  }
}

/**
 * True when the CURRENT APP LANGUAGE (not the device, not I18nManager) is
 * RTL — changes instantly on setLocale()/restoreSavedLocale(), no reload
 * needed. Safe to read at render time (i18next.language is a live, always-
 * current property) as long as the calling component also calls
 * useTranslation() somewhere, so it re-renders when the language changes.
 * Use this to align free-typed text fields (names, notes, descriptions)
 * with the current language; leave phone/email/OTP/numeric inputs and
 * anything already centered alone (see LTR_TEXT_STYLE below).
 */
export function isRTL(): boolean {
  return isSupportedLocale(i18next.language) && RTL_LOCALES.includes(i18next.language);
}

/** "rtl" | "ltr" for the current app language — set as the root `direction`
 * style (app/_layout.tsx) so Yoga mirrors flex-row layout and Text
 * textAlign auto-swap for the WHOLE app, independent of I18nManager.isRTL.
 * Also the value to hand to React Navigation's LocaleDirContext.Provider. */
export function layoutDirection(): "ltr" | "rtl" {
  return isRTL() ? "rtl" : "ltr";
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
