// lib/database.types.ts — typed shape of the database, used by lib/supabase.ts
// so queries like supabase.from("profiles") are fully type-checked.
//
// This mirrors what `npm run db:types` generates once the Supabase CLI is linked.
// Until then we maintain it by hand, one table per migration. After V1's
// 0001_profiles.sql is applied, regenerating will produce an equivalent file.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: "trainer" | "client";
          display_name: string;
          locale: string;
          avatar_url: string | null;
          accepted_terms_at: string | null;
          accepted_health_disclaimer_at: string | null;
          created_at: string;
        };
        // Insert: what's required vs optional when creating a row. Columns with a
        // DB default (locale, created_at) or that are nullable are optional here.
        Insert: {
          id: string;
          role: "trainer" | "client";
          display_name: string;
          locale?: string;
          avatar_url?: string | null;
          accepted_terms_at?: string | null;
          accepted_health_disclaimer_at?: string | null;
          created_at?: string;
        };
        // Update: every column optional (you patch only what changes).
        Update: {
          id?: string;
          role?: "trainer" | "client";
          display_name?: string;
          locale?: string;
          avatar_url?: string | null;
          accepted_terms_at?: string | null;
          accepted_health_disclaimer_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
