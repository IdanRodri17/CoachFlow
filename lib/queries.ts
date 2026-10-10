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
