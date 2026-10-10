// lib/usePullToRefresh.ts — V19 (Step 2c): pull-to-refresh for any screen.
//
// Usage — pass the query-key FAMILIES the screen shows (qk.*.all):
//
//   const refresh = usePullToRefresh([qk.scheduledTrainer.all, qk.roster.all]);
//   <ScrollView refreshControl={<RefreshControl {...refresh} />}>
//
// Invalidating a family (rather than refetching one key) also marks the
// family's inactive queries stale, so other screens showing the same data
// refetch when they're next opened.
//
// WHY local state and not `isRefetching`: the spinner must mean "you pulled
// and we're working on it". Tied to isRefetching it would also spin on every
// background refetch — app focus, a mutation's invalidation — which reads
// as the screen pulling itself down.

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";

export function usePullToRefresh(families: readonly QueryKey[]) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  // Callers pass a fresh array literal every render; the ref keeps onRefresh
  // stable without making them memoize it.
  const familiesRef = useRef(families);
  useEffect(() => {
    familiesRef.current = families;
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Resolves once the active queries have refetched. A failed refetch
      // doesn't reject here; the query shows its own error state.
      await Promise.all(familiesRef.current.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  return { refreshing, onRefresh };
}
