// lib/queryKeys.ts — V19 (Step 2d): every TanStack Query key, in one place.
//
// WHY: keys used to be array literals copied across ~25 files, and TanStack
// matches an invalidation against a query key by PREFIX, element by element.
// When one copy drifted — V14 renamed the calendar's key to
// "scheduled-trainer-range" — six mutations that invalidate
// ["scheduled-trainer"] silently stopped refreshing it (fixed in 8966dc3).
// The same drift had also left the Money screen (["trainer-monthly-money-
// history"]) and the schedule-edit screen (["scheduled", id]) outside the
// families that their mutations invalidate.
//
// THE RULE: keys come in families.
//   - `all` is the family's prefix: what a mutation invalidates.
//   - every query key in the family starts with that prefix, so invalidating
//     `all` refreshes the list, the detail screens and every variant at once.
// New key? Add it here, inside the family it belongs to. Never write an
// array literal at a call site.
//
// Call sites: `useQuery({ queryKey: qk.templates.list, … })` and
// `queryClient.invalidateQueries({ queryKey: qk.templates.all })`.

type Id = string | null | undefined;
type SubjectKind = "app" | "managed";

export const qk = {
  roster: {
    all: ["roster-clients"] as const,
  },

  invites: {
    all: ["client-invites"] as const,
    byTrainer: (trainerId: Id) => ["client-invites", trainerId] as const,
  },

  myTrainerLinks: {
    all: ["my-trainer-links"] as const,
    byClient: (clientId: Id) => ["my-trainer-links", clientId] as const,
  },

  /** The trainer's scheduled workouts — calendar, Home's today list, busy times, edit screen. */
  scheduledTrainer: {
    all: ["scheduled-trainer"] as const,
    range: (start: string, end: string) => ["scheduled-trainer", "range", start, end] as const,
    today: (date: string) => ["scheduled-trainer", "today", date] as const,
    day: (date: string) => ["scheduled-trainer", "day", date] as const,
    one: (id: Id) => ["scheduled-trainer", "one", id] as const,
  },

  /** The signed-in client's own scheduled workouts. */
  scheduledClient: {
    all: ["scheduled-client"] as const,
    upcoming: ["scheduled-client", "upcoming"] as const,
    week: (weekStart: string) => ["scheduled-client", "week", weekStart] as const,
  },

  templates: {
    all: ["templates"] as const,
    list: ["templates", "list"] as const,
    one: (id: Id) => ["templates", "one", id] as const,
    byIds: (ids: string[]) => ["templates", "by-ids", ids.join(",")] as const,
    exerciseCounts: ["templates", "exercise-counts"] as const,
    preview: (id: Id) => ["templates", "preview", id] as const,
  },

  exercises: {
    all: ["exercises"] as const,
    list: ["exercises", "list"] as const,
    one: (id: Id) => ["exercises", "one", id] as const,
    history: (exerciseId: Id, clientId: Id) => ["exercises", "history", exerciseId, clientId] as const,
  },

  /**
   * Session packages. A client reads their own (`own`); the trainer reads a
   * subject's (`subject`). app/workout/[id].tsx invalidates both shapes.
   */
  package: {
    all: ["package"] as const,
    own: (userId: Id) => ["package", userId] as const,
    subject: (kind: SubjectKind, refId: Id) => ["package", kind, refId] as const,
  },

  badges: {
    all: ["badges"] as const,
    own: (userId: Id) => ["badges", userId] as const,
  },

  clientStreak: {
    all: ["client-streak"] as const,
    own: (clientId: Id) => ["client-streak", clientId] as const,
  },

  checkIns: {
    all: ["check-ins"] as const,
    own: (clientId: Id) => ["check-ins", clientId] as const,
    week: (clientId: Id, weekStart: string) => ["check-ins", clientId, "week", weekStart] as const,
    /** The trainer's "latest check-in" card on client detail. */
    latest: (refId: Id) => ["check-ins", refId, "latest"] as const,
  },

  progress: {
    all: ["progress"] as const,
    own: (clientId: Id) => ["progress", clientId] as const,
  },

  /** trainer_monthly_money (0014) — Home's card, the Money screen's history. */
  money: {
    all: ["trainer-monthly-money"] as const,
    month: (monthKey: string) => ["trainer-monthly-money", monthKey] as const,
    history: ["trainer-monthly-money", "history"] as const,
  },

  clientRisk: {
    all: ["client-risk"] as const,
  },

  /** Trainer's client-detail screen (app/dashboard/[refId].tsx). */
  clientDetail: {
    all: ["client-detail"] as const,
    subject: (kind: SubjectKind, refId: Id) => ["client-detail", kind, refId] as const,
  },

  clientContext: {
    all: ["client-context"] as const,
    subject: (kind: SubjectKind, refId: Id) => ["client-context", kind, refId] as const,
  },

  clientNotes: {
    all: ["client-notes"] as const,
    subject: (refId: Id) => ["client-notes", refId] as const,
  },

  nutritionPlan: {
    all: ["nutrition-plan"] as const,
    subject: (kind: SubjectKind, refId: Id) => ["nutrition-plan", kind, refId] as const,
    /** The client's own latest plan (read-only view). */
    latest: (userId: Id) => ["nutrition-plan", "latest", userId] as const,
  },

  shareCard: {
    all: ["share-card"] as const,
    own: (clientId: Id) => ["share-card", clientId] as const,
  },

  /** app/workout/[id].tsx — still literal there until the redesign's D20a lands. */
  workout: {
    session: (scheduledId: Id) => ["workout-session", scheduledId] as const,
    summary: (scheduledId: Id) => ["workout-summary", scheduledId] as const,
  },
};
