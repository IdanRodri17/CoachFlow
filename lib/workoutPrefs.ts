// lib/workoutPrefs.ts — D20h: the client's "בזמן אימון" settings
// (DESIGN.md §6.2 rule 11). Stored on the phone only (AsyncStorage), no DB.
//
//   restAlerts — vibrate + sound when a rest ends
//   keepAwake  — the screen stays on during a workout
//   autoRest   — logging a set starts the rest timer by itself
//
// All default to on. One shared store, so the Profile toggles and the workout
// screen always agree without a reload.

import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type WorkoutPrefs = { restAlerts: boolean; keepAwake: boolean; autoRest: boolean };

const STORAGE_KEY = "coachflow.workoutPrefs";
const DEFAULTS: WorkoutPrefs = { restAlerts: true, keepAwake: true, autoRest: true };

let current: WorkoutPrefs = DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      current = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<WorkoutPrefs>) };
      emit();
    }
  } catch {
    // Unreadable storage: keep the defaults.
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  void load();
  return () => {
    listeners.delete(listener);
  };
}

export async function setWorkoutPref<K extends keyof WorkoutPrefs>(key: K, value: WorkoutPrefs[K]) {
  current = { ...current, [key]: value };
  emit();
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(current));
}

/** The current prefs; re-renders when any of them changes. */
export function useWorkoutPrefs(): WorkoutPrefs {
  return useSyncExternalStore(subscribe, () => current, () => current);
}
