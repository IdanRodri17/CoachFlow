// lib/volume.ts — V28: lifted volume against a ladder of real objects.
//
// Volume = Σ reps × weight over logged sets, computed on read by the
// client_volume view (0039). This file only holds the fixed ladder and the
// arithmetic the screens and lib/badges.ts share. Pure, unit-tested in
// lib/volume.test.ts.

/** Real-world weights, lightest first (kg). */
export const VOLUME_LADDER = [
  { key: "motorbike", kg: 200 },
  { key: "car", kg: 1_500 },
  { key: "elephant", kg: 6_000 },
  { key: "bus", kg: 12_000 },
  { key: "whale", kg: 150_000 },
] as const;

export type VolumeRung = (typeof VOLUME_LADDER)[number]["key"];

/** Every rung the total has reached, lightest first. */
export function rungsReached(totalKg: number): VolumeRung[] {
  return VOLUME_LADDER.filter((r) => totalKg >= r.kg).map((r) => r.key);
}

/** The heaviest rung reached and how many of it fit: 36 t → 3 buses. */
export function topRung(totalKg: number): { key: VolumeRung; count: number } | null {
  for (let i = VOLUME_LADDER.length - 1; i >= 0; i--) {
    const r = VOLUME_LADDER[i];
    if (totalKg >= r.kg) return { key: r.key, count: Math.floor(totalKg / r.kg) };
  }
  return null;
}

/** The next rung up and the kilos left to it; null past the last one. */
export function nextRung(totalKg: number): { key: VolumeRung; kg: number; leftKg: number } | null {
  const r = VOLUME_LADDER.find((x) => totalKg < x.kg);
  return r ? { key: r.key, kg: r.kg, leftKg: r.kg - totalKg } : null;
}

/** "7.2" tonnes from kilos, one decimal, no trailing ".0". */
export function tons(kg: number): string {
  const t = Math.floor(kg / 100) / 10;
  return Number.isInteger(t) ? String(t) : t.toFixed(1);
}
