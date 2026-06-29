# CoachFlow — Claude Code working agreement

CoachFlow is a fitness-trainer mobile app: **Expo (React Native) + TypeScript,
Expo Router, NativeWind, TanStack Query**, backed by **Supabase** (Postgres +
Auth + Storage + RLS). The source of truth is **`docs/SRS.md`** (requirements,
data model, business rules, V1→V12 roadmap) and **`docs/CLAUDE_CODE_PLAYBOOK.md`**
(the exact step-by-step build sequence). `docs/DEPLOYMENT.md` covers store
submission.

> At the start of every session, read `docs/SRS.md` and `CLAUDE.md` first. State which
> step (Vn) we're on, touch only the files that step lists, and **stop before
> committing** so the smoke test can run.

## How we work together (rules — no exceptions)

- **One playbook step at a time.** Build exactly one `Vn` step per session. Do
  not jump ahead.
- **1–2 files per step** (plus the matching SQL migration when the schema
  changes). Smallest change that satisfies the step.
- **Stop before committing.** Idan smoke-tests every step manually. Only after he
  confirms it's green do you commit + push.
- **Conventional commits**, `feat(vN): ...` with a short multi-line body
  (what + why). Run `git push` after every commit.
- **Schema changes are plain SQL migrations** in `supabase/migrations/`, surgical
  only. New columns are **nullable or defaulted** so older app builds don't break.
  No migration framework, no ORM migrations.
- **Deterministic numbers** (streaks, PRs, sessions remaining, leaderboard) are
  computed in SQL or app code — **never hardcoded or faked**.
- **All dates resolve in the user's local time zone**, default **Asia/Jerusalem**,
  via the shared **`lib/dates.ts`**. Never compare dates in raw UTC.
- **RTL-aware from day one** (the app supports Hebrew). Don't retrofit RTL later.
- **No over-engineering.** If anything is ambiguous, ask before building.

## Locked business rules (SRS §4.1)

- **"Missed" is derived, not stored.** Stored status is only `scheduled` or
  `completed`. A workout counts as *missed* on read when its `scheduled_date` is
  before today (user-local) and it isn't completed. No cron flips statuses.
- **Streak** = consecutive *completed* scheduled workouts. Only a missed workout
  breaks it; days with no scheduled workout never break it.
- **Sessions remaining** = `packages.total_sessions − used_sessions`, where
  `used_sessions` increments by exactly one per completed workout.

## Project conventions & setup

- **Env:** `lib/supabase.ts` reads `EXPO_PUBLIC_SUPABASE_URL` and
  `EXPO_PUBLIC_SUPABASE_ANON_KEY` from `.env` (copied from `.env.example`). The
  real `.env` is gitignored. Never hardcode keys; never put the `service_role`
  key in the app.
- **Path alias:** import local modules with `@/` (e.g. `@/lib/supabase`).
- **Styling:** NativeWind v4 + **Tailwind v3** (v4 is not yet supported). Style
  with `className="..."`.
- **Reanimated 4** is configured via `react-native-worklets`; `babel-preset-expo`
  auto-adds the worklets Babel plugin — do not add it manually.
- **`.npmrc` sets `legacy-peer-deps=true`** to absorb React 19 / Expo 56 peer
  range lag. Keep it until the ecosystem tightens its ranges.

### Supabase tooling (run after creating the project)

```bash
npm i -g supabase          # or: scoop install supabase
supabase init              # creates supabase/config.toml (keep our seed.sql)
supabase link --project-ref <your-ref>
npm run db:types           # regenerate lib/database.types.ts from the schema
npm run db:seed            # supabase db reset: re-applies migrations + seed.sql (LOCAL)
```

- **Regenerate types after every migration:** `npm run db:types`.
- `supabase/seed.sql` provisions a demo trainer, two clients, exercises, and one
  template. For a hosted DB, run it from the SQL Editor.

## Roadmap pointer

Versions V1→V12 (plus V5b/V8b/V12a/V12b) are specified in `docs/SRS.md §5` and
built per `docs/CLAUDE_CODE_PLAYBOOK.md`. Deferred/out-of-scope items live in
`docs/SRS.md §8`.

---

@AGENTS.md
