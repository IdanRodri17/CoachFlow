// lib/shareFileName.ts — the file name a shared progress card goes out under.
//
// The share sheet shows the file's name, and react-native-view-shot names its
// capture with a UUID ("6604197B-54F9-….png", Idan's phone test, 2026-11-21).
// The card is copied to this name first: "CoachFlow-דנה-2026-11-21.png".
// Hebrew letters stay; anything a file system or a chat app might choke on
// (slashes, colons, quotes, emoji, control characters) goes, and spaces
// become dashes.

/** `name` is the client's display name (may be empty); `date` is YYYY-MM-DD. */
export function shareFileName(name: string | null | undefined, date: string): string {
  const safe = (name ?? "")
    .normalize("NFC")
    // Keep letters (any script), digits, spaces and dashes.
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40)
    .replace(/^-|-$/g, "");
  return `CoachFlow-${safe || "progress"}-${date}.png`;
}
