// components/home/format.ts — small display helpers shared by the two Home
// screens (D22, D23b). Everything resolves in Asia/Jerusalem (lib/dates.ts).

import { DEFAULT_TIME_ZONE, todayISO } from "@/lib/dates";

/** 6480 → "6,480" (no currency sign; the screens add ₪ around it). */
export function formatMoney(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === "he" ? "he" : "en").format(Math.round(value));
}

/** Minutes since local midnight, now. */
export function localMinutesNow(now: Date = new Date()): number {
  const [h, m] = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: DEFAULT_TIME_ZONE,
  })
    .format(now)
    .split(":")
    .map(Number);
  return (h % 24) * 60 + m;
}

/** "09:30:00" → 570. */
export function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** The greeting for the local time of day (5–12 morning, 12–17 noon,
 * 17–22 evening, otherwise night). */
export function greetingKey(now: Date = new Date()): string {
  const h = Math.floor(localMinutesNow(now) / 60);
  if (h >= 5 && h < 12) return "today.greetingMorning";
  if (h >= 12 && h < 17) return "today.greetingNoon";
  if (h >= 17 && h < 22) return "today.greetingEvening";
  return "today.greetingNight";
}

/** "יום רביעי, 30 בספטמבר" / "Wednesday, September 30". */
export function longDate(dateISO: string = todayISO(), locale: string): string {
  return new Intl.DateTimeFormat(locale === "he" ? "he" : "en", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: DEFAULT_TIME_ZONE,
  }).format(new Date(`${dateISO}T12:00:00Z`));
}

/** "א׳" / "S" — the one-letter weekday for the week strip. */
export function weekdayLetter(dateISO: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "he" ? "he" : "en", {
    weekday: "narrow",
    timeZone: DEFAULT_TIME_ZONE,
  }).format(new Date(`${dateISO}T12:00:00Z`));
}

/** "2.10" / "10/2". */
export function shortDate(dateISO: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "he" ? "he" : "en", {
    day: "numeric",
    month: "numeric",
    timeZone: DEFAULT_TIME_ZONE,
  }).format(new Date(`${dateISO}T12:00:00Z`));
}

/** "ספטמבר" / "September". */
export function monthName(dateISO: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "he" ? "he" : "en", {
    month: "long",
    timeZone: DEFAULT_TIME_ZONE,
  }).format(new Date(`${dateISO}T12:00:00Z`));
}

/** First name for compact places. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
