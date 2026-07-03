// lib/pr.ts — deterministic personal-record (PR) detection (SRS: computed in
// app code, never faked).
//
// A set is a PR when it beats the client's previous best for that exercise:
//   - a heavier weight than ever before, OR
//   - the same top weight but more reps than before at that weight.
//
// detectPRs takes the client's HISTORY for one exercise plus the NEW sets (in the
// order they were performed) and returns a boolean per new set. The "best" updates
// as we go, so two PRs in the same session are both caught (e.g. 100kg then 105kg).

export type SetPerf = { weight: number | null; reps: number | null };

export function detectPRs(history: SetPerf[], newSets: SetPerf[]): boolean[] {
  let bestWeight = -Infinity;
  let bestRepsAtBestWeight = -Infinity;

  const consider = (s: SetPerf) => {
    if (s.weight == null) return;
    if (s.weight > bestWeight) {
      bestWeight = s.weight;
      bestRepsAtBestWeight = s.reps ?? 0;
    } else if (s.weight === bestWeight) {
      bestRepsAtBestWeight = Math.max(bestRepsAtBestWeight, s.reps ?? 0);
    }
  };

  // Seed the "best" from history.
  history.forEach(consider);

  return newSets.map((s) => {
    if (s.weight == null) return false;
    // A PR must beat a PREVIOUS best — the first set of a brand-new exercise
    // (no history at all) is the baseline, not a PR.
    const hasPrior = bestWeight !== -Infinity;
    const isPr =
      hasPrior &&
      (s.weight > bestWeight ||
        (s.weight === bestWeight && (s.reps ?? 0) > bestRepsAtBestWeight));
    consider(s); // always fold this set into the running best
    return isPr;
  });
}
