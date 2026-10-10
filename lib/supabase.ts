// lib/supabase.ts — the single Supabase client used everywhere in the app.
//
// Import it anywhere with:  import { supabase } from "@/lib/supabase";
//
// Supabase is our backend: Postgres database + Auth + Storage, all guarded by
// Row-Level Security (RLS). The app talks to it over HTTPS using the public
// "anon" key — RLS (not the key) is what keeps each user's data private.

// React Native lacks some web URL APIs that supabase-js relies on; this polyfill
// fills the gap. It must be imported BEFORE the Supabase client is created.
import "react-native-url-polyfill/auto";

import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync } from "expo-crypto";
import * as SecureStore from "expo-secure-store";

import type { Database } from "./database.types";
import { createEncryptedStorage } from "./encryptedStorage";

// C6: the session is AES-GCM encrypted at rest — see lib/encryptedStorage.ts.
// Here: the Expo modules it runs on.
//   * AFTER_FIRST_UNLOCK: the device key stays readable while the phone is
//     locked (the app running behind the lock screen), but not before the
//     first unlock after a reboot.
//   * THIS_DEVICE_ONLY: the key never enters an iCloud / device backup, so a
//     backup restored on another phone can't open the session.
// expo-crypto takes binary input as bytes (a string would be read as base64),
// hence the UTF-8 encoder. TextDecoder comes from Expo's runtime.
const KEYCHAIN: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};
const utf8 = (text: string) => new TextEncoder().encode(text);

const encryptedSessionStorage = createEncryptedStorage({
  keychain: {
    getItem: (name) => SecureStore.getItemAsync(name, KEYCHAIN),
    setItem: (name, value) => SecureStore.setItemAsync(name, value, KEYCHAIN),
  },
  disk: AsyncStorage,
  cipher: {
    generateKey: async () => (await AESEncryptionKey.generate()).encoded("base64"),
    encrypt: async (plaintext, key, additionalData) => {
      const sealed = await aesEncryptAsync(utf8(plaintext), await AESEncryptionKey.import(key, "base64"), {
        additionalData: utf8(additionalData),
      });
      return sealed.combined("base64");
    },
    decrypt: async (sealed, key, additionalData) => {
      const bytes = await aesDecryptAsync(
        AESSealedData.fromCombined(sealed),
        await AESEncryptionKey.import(key, "base64"),
        { additionalData: utf8(additionalData) },
      );
      return new TextDecoder().decode(bytes);
    },
  },
});

// Env vars must be prefixed EXPO_PUBLIC_ to be readable in the app at runtime.
// They come from your .env file (copied from .env.example). See those files.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Warn loudly but DON'T crash — Session 0 must boot before Supabase exists.
  // Fill in .env and restart the dev server to make real calls work.
  console.warn(
    "[supabase] Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. " +
      "Copy .env.example to .env and add your project values.",
  );
}

// The <Database> generic gives us fully typed queries once `npm run db:types`
// has regenerated lib/database.types.ts from the real schema.
export const supabase = createClient<Database>(
  // Fallbacks keep createClient from throwing when env is absent (e.g. before
  // setup). They are placeholders — no real requests succeed against them.
  supabaseUrl ?? "https://placeholder.supabase.co",
  supabaseAnonKey ?? "placeholder-anon-key",
  {
    auth: {
      // Persist the login session on the device so users rarely re-auth —
      // encrypted (C6). Web has no keychain; the app doesn't ship there.
      storage: Platform.OS === "web" ? AsyncStorage : encryptedSessionStorage,
      autoRefreshToken: true,
      persistSession: true,
      // We're a native app, not handling auth redirects in a URL bar.
      detectSessionInUrl: false,
    },
  },
);
