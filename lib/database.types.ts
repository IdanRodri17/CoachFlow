// lib/database.types.ts — PLACEHOLDER (auto-generated file).
//
// Once your Supabase project exists and has tables, regenerate this file with:
//     npm run db:types
// which runs `supabase gen types typescript --linked` and overwrites this file
// with the real, fully-typed schema. Until then, this minimal stub keeps
// `createClient<Database>()` in lib/supabase.ts type-correct.
//
// Do not hand-edit beyond this placeholder — it is meant to be regenerated.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
