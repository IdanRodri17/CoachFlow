// lib/database.types.ts — typed shape of the database, used by lib/supabase.ts
// so queries are type-checked. Mirrors what `npm run db:types` would generate;
// maintained by hand, one table per migration.

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
      // --- V1: 0001_profiles.sql ---
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
      // --- V2: 0002_exercises.sql ---
      exercises: {
        Row: {
          id: string;
          trainer_id: string;
          name: string;
          description: string | null;
          muscle_group: string | null;
          video_url: string | null;
          thumbnail_url: string | null;
          default_sets: number | null;
          default_reps: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          trainer_id: string;
          name: string;
          description?: string | null;
          muscle_group?: string | null;
          video_url?: string | null;
          thumbnail_url?: string | null;
          default_sets?: number | null;
          default_reps?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          trainer_id?: string;
          name?: string;
          description?: string | null;
          muscle_group?: string | null;
          video_url?: string | null;
          thumbnail_url?: string | null;
          default_sets?: number | null;
          default_reps?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      // --- V3: 0003_templates.sql ---
      workout_templates: {
        Row: {
          id: string;
          trainer_id: string;
          name: string;
          description: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          trainer_id: string;
          name: string;
          description?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          trainer_id?: string;
          name?: string;
          description?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      template_exercises: {
        Row: {
          id: string;
          template_id: string;
          exercise_id: string;
          position: number;
          target_sets: number | null;
          target_reps: number | null;
          target_weight: number | null;
          rest_seconds: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          template_id: string;
          exercise_id: string;
          position?: number;
          target_sets?: number | null;
          target_reps?: number | null;
          target_weight?: number | null;
          rest_seconds?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          template_id?: string;
          exercise_id?: string;
          position?: number;
          target_sets?: number | null;
          target_reps?: number | null;
          target_weight?: number | null;
          rest_seconds?: number | null;
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
