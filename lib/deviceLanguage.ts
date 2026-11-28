// lib/deviceLanguage.ts — the app language for the phone's first language.
//
// Android 13 and older still name Hebrew by its legacy ISO code: for a phone
// set to עברית, expo-localization reports languageTag "he-IL" but
// languageCode "iw" (Java's Locale.getLanguage(); Android 14 and iOS say
// "he"). lib/i18n.ts checked languageCode === "he", so an Israeli Android 13
// phone opened the app in English (P29, found on the Android emulator).
// The BCP 47 tag comes first; the code is only the fallback.

export type AppLanguage = "he" | "en";

type DeviceLocale = { languageTag?: string | null; languageCode?: string | null };

export function appLanguageFor(locale: DeviceLocale | null | undefined): AppLanguage {
  const fromTag = locale?.languageTag?.split(/[-_]/)[0];
  const code = (fromTag || locale?.languageCode || "").toLowerCase();
  return code === "he" || code === "iw" ? "he" : "en";
}
