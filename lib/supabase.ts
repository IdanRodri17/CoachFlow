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

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

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
      // Persist the login session on the device so users rarely re-auth.
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // We're a native app, not handling auth redirects in a URL bar.
      detectSessionInUrl: false,
    },
  },
);
