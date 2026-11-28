// lib/deviceLanguage.test.ts — the first-launch language from the phone's
// locale, including Android 13's legacy "iw" for Hebrew (P29).

import { describe, expect, it } from "vitest";

import { appLanguageFor } from "./deviceLanguage";

describe("appLanguageFor", () => {
  it("reads Hebrew on Android 13, which reports the legacy code iw", () => {
    // What the Pixel 7 emulator (Android 13, system language עברית) returned.
    expect(appLanguageFor({ languageTag: "he-IL", languageCode: "iw" })).toBe("he");
  });

  it("reads Hebrew from a legacy tag or a code alone", () => {
    expect(appLanguageFor({ languageTag: "iw-IL", languageCode: "iw" })).toBe("he");
    expect(appLanguageFor({ languageCode: "iw" })).toBe("he");
    expect(appLanguageFor({ languageTag: null, languageCode: "he" })).toBe("he");
  });

  it("reads Hebrew on iOS and Android 14+", () => {
    expect(appLanguageFor({ languageTag: "he-IL", languageCode: "he" })).toBe("he");
    expect(appLanguageFor({ languageTag: "HE-il", languageCode: "he" })).toBe("he");
  });

  it("uses English for English and every other language", () => {
    expect(appLanguageFor({ languageTag: "en-US", languageCode: "en" })).toBe("en");
    expect(appLanguageFor({ languageTag: "ar-IL", languageCode: "ar" })).toBe("en");
    expect(appLanguageFor({ languageTag: "ru-IL", languageCode: "ru" })).toBe("en");
  });

  it("uses English when the phone reports nothing", () => {
    expect(appLanguageFor(undefined)).toBe("en");
    expect(appLanguageFor(null)).toBe("en");
    expect(appLanguageFor({})).toBe("en");
  });
});
