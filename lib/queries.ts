// lib/queries.ts — queries more than one screen reads, defined once.
//
// WHY: two screens sharing a key must also share its queryFn, or whichever
// fetched first decides the cached shape for both (the qk.templates.list
// clash, fixed in D29a). A shared query lives here as TanStack's
// queryOptions({ queryKey, queryFn }) and every screen imports it instead of
// re-writing the select.

import { queryOptions } from "@tanstack/react-query";

import { qk } from "./queryKeys";
import { supabase } from "./supabase";
import type { Database } from "./database.types";

export type AttentionItem = Database["public"]["Views"]["trainer_attention"]["Row"];

/** Renewals first (money and a booked slot at stake), then risk, then news. */
const ATTENTION_ORDER: Record<AttentionItem["kind"], number> = {
  package_used_up: 0,
  risk: 1,
  package_low: 2,
  adjustment: 3,
  pr: 4,
};

/** trainer_attention (0029), sorted: the trainer Home's "לתשומת לבך" and the
 * clients list's risk / package chips. RLS returns only the caller's rows. */
export const attentionQuery = queryOptions({
  queryKey: qk.scheduledTrainer.attention,
  queryFn: async (): Promise<AttentionItem[]> => {
    const { data, error } = await supabase.from("trainer_attention").select("*");
    if (error) throw error;
    return [...data].sort(
      (a, b) =>
        ATTENTION_ORDER[a.kind] - ATTENTION_ORDER[b.kind] || (b.happened_at ?? "").localeCompare(a.happened_at ?? ""),
    );
  },
});

export type Owed = { count: number; amount: number };

/** Money owed per client, all time: completed sessions not marked paid × the
 * package's price per session (sessions without a price owe nothing shown).
 * Keyed like the views' subject_key: client id, or "m:" + managed id. The
 * clients list's "₪ לתשלום" chip and Money's "לא שולם" list. */
export function owedQuery(trainerId: string) {
  return queryOptions({
    queryKey: qk.scheduledTrainer.owed,
    queryFn: async (): Promise<Map<string, Owed>> => {
      const [unpaidRes, pkgRes] = await Promise.all([
        supabase
          .from("scheduled_workouts")
          .select("client_id, managed_client_id")
          .eq("trainer_id", trainerId)
          .eq("status", "completed")
          .eq("paid", false),
        supabase.from("packages").select("client_id, managed_client_id, price_per_session").eq("trainer_id", trainerId),
      ]);
      if (unpaidRes.error) throw unpaidRes.error;
      if (pkgRes.error) throw pkgRes.error;
      const price = new Map<string, number>();
      pkgRes.data.forEach((p) => {
        if (p.price_per_session != null) price.set(p.client_id ?? `m:${p.managed_client_id}`, p.price_per_session);
      });
      const out = new Map<string, Owed>();
      unpaidRes.data.forEach((w) => {
        const key = w.client_id ?? `m:${w.managed_client_id}`;
        const p = price.get(key);
        if (p == null) return;
        const cur = out.get(key) ?? { count: 0, amount: 0 };
        out.set(key, { count: cur.count + 1, amount: cur.amount + p });
      });
      return out;
    },
  });
}

/** The client's current streak: client_streaks has one row per trainer, the
 * client screens show the best run (Today's week strip, Progress, Profile). */
export function clientStreakQuery(clientId: string) {
  return queryOptions({
    queryKey: qk.clientStreak.own(clientId),
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.from("client_streaks").select("current_streak").eq("client_id", clientId);
      if (error) throw error;
      return Math.max(0, ...data.map((r) => r.current_streak));
    },
  });
}

export type TodaySession = {
  id: string;
  client_id: string | null;
  managed_client_id: string | null;
  template_id: string | null;
  scheduled_time: string | null;
  status: "scheduled" | "completed";
  with_trainer: boolean;
  template_name: string;
};

/** The trainer's sessions on one day, in time order, with template names — the
 * trainer Home's "היום" and quick-add's "מחכה לך". Under scheduled-trainer, so
 * every schedule mutation refreshes it. */
export function todaySessionsQuery(trainerId: string, date: string) {
  return queryOptions({
    queryKey: qk.scheduledTrainer.today(date),
    queryFn: async (): Promise<TodaySession[]> => {
      const { data, error } = await supabase
        .from("scheduled_workouts")
        .select("id, client_id, managed_client_id, template_id, scheduled_time, status, with_trainer")
        .eq("trainer_id", trainerId)
        .eq("scheduled_date", date)
        .order("scheduled_time", { ascending: true, nullsFirst: false });
      if (error) throw error;
      const tplIds = [...new Set(data.map((x) => x.template_id).filter(Boolean) as string[])];
      const names = new Map<string, string>();
      if (tplIds.length > 0) {
        const { data: tpls } = await supabase.from("workout_templates").select("id, name").in("id", tplIds);
        tpls?.forEach((tpl) => names.set(tpl.id, tpl.name));
      }
      return data.map((x) => ({ ...x, template_name: x.template_id ? (names.get(x.template_id) ?? "—") : "—" }));
    },
  });
}

/** The five clients with the most sessions in the last 30 days (up to today),
 * as subject keys — quick-add's "קביעה מהירה ל…". */
export function frequentClientsQuery(trainerId: string, from: string, to: string) {
  return queryOptions({
    queryKey: qk.scheduledTrainer.frequent(from),
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("scheduled_workouts")
        .select("client_id, managed_client_id")
        .eq("trainer_id", trainerId)
        .gte("scheduled_date", from)
        .lte("scheduled_date", to);
      if (error) throw error;
      const count = new Map<string, number>();
      data.forEach((w) => {
        const key = w.client_id ?? `m:${w.managed_client_id}`;
        count.set(key, (count.get(key) ?? 0) + 1);
      });
      return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([key]) => key);
    },
  });
}

export type ClientContext = {
  /** The intake answers that matter at session time (app clients). */
  intake: { goals: string | null; injuries: string | null } | null;
  pkg: { total_sessions: number; used_sessions: number } | null;
  /** The last completed workout the client logged (app clients). */
  last: {
    id: string;
    completedAt: string;
    effort: number | null;
    note: string | null;
    minutes: number | null;
    templateName: string | null;
    sets: number;
    prs: { exercise: string; weight: number | null; reps: number | null }[];
    changes: { action: "skipped" | "swapped"; exercise: string; swappedFor: string | null; reason: string | null }[];
  } | null;
};

/** The client at session time (DESIGN.md §8, roadmap V26): intake goal and
 * injuries, the last completed session (effort, note, duration, sets, PRs,
 * swaps/skips with reasons) and the package balance. The trainer Home's
 * next-up card and the client card (D26b) both read it. Offline clients have
 * no logs or intake yet, so only their package comes back. */
export function clientContextQuery(kind: "app" | "managed", refId: string) {
  return queryOptions({
    queryKey: qk.clientContext.subject(kind, refId),
    queryFn: async (): Promise<ClientContext> => {
      const [intakeRes, logRes, pkgRes] = await Promise.all([
        kind === "app"
          ? supabase.from("profiles").select("intake").eq("id", refId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        kind === "app"
          ? supabase
              .from("workout_logs")
              .select("id, scheduled_workout_id, completed_at, effort_rating, client_note, duration_seconds")
              .eq("client_id", refId)
              .order("completed_at", { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase
          .from("packages")
          .select("total_sessions, used_sessions")
          .eq(kind === "app" ? "client_id" : "managed_client_id", refId)
          .maybeSingle(),
      ]);
      if (intakeRes.error) throw intakeRes.error;
      if (logRes.error) throw logRes.error;
      if (pkgRes.error) throw pkgRes.error;

      // intake is client-written jsonb: only strings count.
      const raw = (intakeRes.data?.intake ?? null) as Record<string, unknown> | null;
      const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
      const intake = raw ? { goals: text(raw.goals), injuries: text(raw.injuries) } : null;

      const log = logRes.data;
      if (!log) return { intake, pkg: pkgRes.data, last: null };

      const [swRes, setsRes, adjRes] = await Promise.all([
        supabase.from("scheduled_workouts").select("template_id").eq("id", log.scheduled_workout_id).maybeSingle(),
        supabase.from("set_logs").select("exercise_id, reps, weight, is_pr").eq("workout_log_id", log.id),
        supabase
          .from("exercise_adjustments")
          .select("action, exercise_id, swapped_for_exercise_id, reason")
          .eq("workout_log_id", log.id),
      ]);
      if (setsRes.error) throw setsRes.error;
      if (adjRes.error) throw adjRes.error;

      const prSets = setsRes.data.filter((s) => s.is_pr);
      const exIds = [
        ...new Set([
          ...prSets.map((s) => s.exercise_id),
          ...adjRes.data.flatMap((a) => [a.exercise_id, a.swapped_for_exercise_id].filter(Boolean) as string[]),
        ]),
      ];
      const [tplRes, exRes] = await Promise.all([
        swRes.data?.template_id
          ? supabase.from("workout_templates").select("name").eq("id", swRes.data.template_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        exIds.length > 0
          ? supabase.from("exercises").select("id, name").in("id", exIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
      ]);
      const exName = new Map((exRes.data ?? []).map((e) => [e.id, e.name]));

      return {
        intake,
        pkg: pkgRes.data,
        last: {
          id: log.id,
          completedAt: log.completed_at,
          effort: log.effort_rating,
          note: log.client_note,
          minutes: log.duration_seconds != null ? Math.round(log.duration_seconds / 60) : null,
          templateName: tplRes.data?.name ?? null,
          sets: setsRes.data.length,
          prs: prSets.map((s) => ({ exercise: exName.get(s.exercise_id) ?? "—", weight: s.weight, reps: s.reps })),
          changes: adjRes.data.map((a) => ({
            action: a.action,
            exercise: exName.get(a.exercise_id) ?? "—",
            swappedFor: a.swapped_for_exercise_id ? (exName.get(a.swapped_for_exercise_id) ?? null) : null,
            reason: a.reason,
          })),
        },
      };
    },
  });
}
