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
