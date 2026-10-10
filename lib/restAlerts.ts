// lib/restAlerts.ts — D20f: the phone-free part of the workout mode
// (DESIGN.md §6.2 rule 4). When a rest starts, a LOCAL notification is
// scheduled for its end (expo-notifications; no push, no server — local
// notifications work in Expo Go). When the rest changes (±15, pause, skip,
// undo, finish) it is cancelled or rescheduled. In the foreground the app
// buzzes itself (expo-haptics) instead: with no notification handler set,
// expo-notifications doesn't show a notification while the app is open.
//
// One alert per open workout, identified by `rest-end:${userId}:${scheduledId}`,
// so a re-opened (resumed) workout replaces its own alert instead of adding
// a second one. Signing out cancels every pending one.
//
// Permission is asked the first time a rest starts, after a one-line
// explanation; "not now" is remembered. Denied → everything else still works.

import { Alert, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";

import i18next from "./i18n";
import { supabase } from "./supabase";

const ID_PREFIX = "rest-end:";
const CHANNEL_ID = "rest-end";
const ASKED_KEY = "coachflow.restAlertsAsked";

let setUp = false;
/** Per alert: bumped by every schedule/cancel, so a slow schedule (waiting on
 * the permission prompt) can tell it was overtaken and back out. */
const generation = new Map<string, number>();

function setUpOnce() {
  if (setUp) return;
  setUp = true;
  // Android needs a channel (and shows the permission prompt only after one exists).
  if (Platform.OS === "android") {
    void Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: i18next.t("workout.alerts.channelName"),
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
  // lib/auth.tsx can't see scheduled notifications: a sign-out cancels them here.
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") void cancelAllRestAlerts();
  });
}

function bump(key: string): number {
  const next = (generation.get(key) ?? 0) + 1;
  generation.set(key, next);
  return next;
}

async function hasPermission(): Promise<boolean> {
  const perm = await Notifications.getPermissionsAsync();
  if (perm.granted || perm.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return true;
  if (!perm.canAskAgain || (await AsyncStorage.getItem(ASKED_KEY))) return false;

  const ok = await new Promise<boolean>((resolve) =>
    Alert.alert(
      i18next.t("workout.alerts.permissionTitle"),
      i18next.t("workout.alerts.permissionBody"),
      [
        { text: i18next.t("workout.alerts.notNow"), style: "cancel", onPress: () => resolve(false) },
        { text: i18next.t("workout.alerts.allow"), onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
  await AsyncStorage.setItem(ASKED_KEY, "1");
  if (!ok) return false;
  const res = await Notifications.requestPermissionsAsync();
  return res.granted || res.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

/** Schedule (or move) the rest-end alert for one open workout. */
export async function scheduleRestAlert(key: string, endsAt: number, body: string): Promise<void> {
  setUpOnce();
  const gen = bump(key);
  const id = ID_PREFIX + key;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
    if (endsAt - Date.now() < 1000 || !(await hasPermission())) return;
    // Overtaken while we waited (rest skipped, paused, moved), or already over.
    if (generation.get(key) !== gen || endsAt - Date.now() < 1000) return;
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: {
        title: i18next.t("workout.alerts.restOverTitle"),
        body,
        sound: true,
        data: { kind: "rest-end" },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: endsAt, channelId: CHANNEL_ID },
    });
    // A cancel that ran while scheduling must still win.
    if (generation.get(key) !== gen) await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // Notifications unavailable: the in-app timer and haptic still work.
  }
}

export async function cancelRestAlert(key: string): Promise<void> {
  bump(key);
  try {
    await Notifications.cancelScheduledNotificationAsync(ID_PREFIX + key);
  } catch {
    // Nothing scheduled, or notifications unavailable.
  }
}

export async function cancelAllRestAlerts(): Promise<void> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      all
        .filter((n) => n.identifier.startsWith(ID_PREFIX))
        .map((n) => {
          bump(n.identifier.slice(ID_PREFIX.length));
          return Notifications.cancelScheduledNotificationAsync(n.identifier);
        }),
    );
  } catch {
    // Notifications unavailable.
  }
}

/** The in-app buzz when a rest ends with the app open. */
export function restEndHaptic(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}
