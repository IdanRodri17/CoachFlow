// lib/packageRenewal.ts — renewing a client's package (U4; Idan, 2026-11-27:
// "carry it over").
//
// A client has one package per trainer (packages: total_sessions and
// used_sessions, which the completion trigger counts). Renewing starts the
// new package's count on the same row:
//   * sessions left in the old package carry over: they're added to the new
//     package's size;
//   * sessions already done beyond the old package (sessions left below 0)
//     count against the new one: they start as used.
// So "10 left of 12" after renewing 10 with 2 left, and "8 left of 10" after
// renewing 10 with 2 done beyond it. Before this the trainer typed a running
// total (10 → 20), and typing 10 again still showed the package used up.

export type PackageCount = { total: number; used: number };

export function renewedPackage(current: PackageCount, size: number): PackageCount {
  const left = current.total - current.used;
  return { total: size + Math.max(left, 0), used: Math.max(-left, 0) };
}
