# CoachFlow — Claude Code Playbook

Step-by-step prompts to build CoachFlow with Claude Code. The rules, mirroring your existing workflow:

- **One session = one playbook step = 1–2 files touched** (plus the matching SQL migration when schema changes).
- **You smoke-test manually.** Nothing gets committed until your smoke test passes.
- **On green:** `git commit -m "feat(vN): ..."` then `git push`. (Conventional commits, `feat(vN):` prefix.)
- **Schema changes are surgical SQL.** Plain `.sql` migration files in `supabase/migrations/`. New columns nullable or defaulted so old builds don't break.
- **Deterministic numbers** (streaks, PRs, remaining sessions, leaderboard) computed in SQL/app — never faked.

Paste the prompt for the current step into Claude Code, let it work, run the smoke test, then commit/push. Each prompt assumes Claude Code has read `SRS.md` and `CLAUDE.md` — tell it to at the start of the session.

> Tip: at the top of every session, say: *"Read SRS.md and CLAUDE.md first. We are working on step Vn only. Touch at most the files listed. Stop before committing — I'll smoke test."*

---

## Session 0 — Project init + conventions

**Goal:** Scaffold the repo, write `CLAUDE.md`, wire Supabase + NativeWind + Expo Router. No features yet.

**Files (≤2 + config):** `CLAUDE.md`, `app/_layout.tsx` (+ generated config: `app.json`, `tailwind.config.js`, `lib/supabase.ts`)

**Prompt:**
> Initialize an Expo (React Native) + TypeScript app using Expo Router and NativeWind. Then create `CLAUDE.md` that captures our working conventions verbatim:
> - 1–2 files per session; stop before committing so I can smoke test.
> - Conventional commits, `feat(vN):` prefix.
> - Schema changes are plain SQL migrations in `supabase/migrations/`; new columns nullable or defaulted.
> - Deterministic values (streaks, PRs, sessions remaining, leaderboard) computed in SQL/app, never hardcoded or faked.
> - No over-engineering; smallest change that satisfies the step.
> - RTL-aware from day one.
> Set up `lib/supabase.ts` reading `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from env. Add TanStack Query provider in the root layout. Add `lib/dates.ts` — a small date utility that resolves "today" and all date comparisons in the user's local time zone, defaulting to **Asia/Jerusalem**; every later "today's workout", streak, and missed-workout check must use it (never raw UTC). Add an npm script `db:types` that runs `supabase gen types typescript` into `lib/database.types.ts`, and a `supabase/seed.sql` (plus a `db:seed` script) that provisions a demo trainer, two demo clients, a few exercises, and one template — so I can smoke test without recreating data each time. Do not build any screens yet beyond a placeholder home.

**Smoke test (you):** App boots in Expo Go to a placeholder screen; no red errors; `lib/supabase.ts` reads env without crashing; `db:seed` populates demo rows and `db:types` writes `lib/database.types.ts`.

**On green:** `git commit -m "feat(v0): project scaffold, conventions, supabase + query providers"` && `git push`

---

## V1 — Foundation & Auth

**Goal:** Phone/SMS OTP auth, `profiles` table, role selection, terms + health-disclaimer acceptance, role-aware tab shell.

**Files (≤2 + migration):** `supabase/migrations/0001_profiles.sql`, `app/(auth)/` + `app/(tabs)/_layout.tsx`

**Prompt:**
> Per SRS §4, write migration `0001_profiles.sql`: a `profiles` table (id references auth.users, role 'trainer'|'client', display_name, locale default 'he', avatar_url, accepted_terms_at timestamptz, accepted_health_disclaimer_at timestamptz) with RLS so a user can select/update only their own row. Implement auth using **Supabase phone/SMS OTP** (enter phone → receive code → verify). Build it so the auth provider is easy to switch: read it from one place, and support an **email-OTP mode for local dev** (so I can build before the SMS provider is configured) — leave a clear comment on how to flip between SMS and email. On first sign-in, prompt for role (trainer/client) + display name, and show a **terms-of-use + health-disclaimer** screen ("consult a physician before starting exercise") that the user must accept — stamp `accepted_terms_at` and `accepted_health_disclaimer_at`. Persist the session so users rarely re-auth. Build a role-aware tab navigator with different empty-state home tabs. Keep it minimal — no features beyond auth + role + consent + empty home.

**Smoke test:** Sign in via OTP (email mode is fine for now) → accept terms + health disclaimer → pick trainer role → see trainer empty home. Repeat as a client. Confirm two `profiles` rows exist with correct roles and both consent timestamps set.

**On green:** `git commit -m "feat(v1): phone/SMS OTP auth, profiles, role + consent, role-aware shell"` && `git push`

---

## V2 — Exercise Library

**Goal:** Trainer CRUD for exercises with embedded demo video; client read-only browse.

**Files (≤2 + migration):** `0002_exercises.sql`, `app/(tabs)/exercises/` (list + edit)

**Prompt:**
> Migration `0002_exercises.sql` for `exercises` (per SRS §4) with RLS: a trainer manages their own rows; clients in that trainer's roster can read them. Build a trainer Exercises tab: list, add, edit (name, description, muscle_group, video_url, thumbnail_url, default_sets, default_reps). Render the demo video from a YouTube/Vimeo URL with `react-native-youtube-iframe`. Give clients a read-only browse of the same list with the video player. Validate that video_url is a YouTube/Vimeo link.

**Smoke test:** As trainer, add an exercise with a real YouTube link → it appears in the list and the video plays. As client, open the same exercise → video plays, no edit controls.

**On green:** `git commit -m "feat(v2): exercise library with embedded demo videos"` && `git push`

---

## V3 — Workout Templates

**Goal:** Reusable templates the trainer builds once.

**Files (≤2 + migration):** `0003_templates.sql`, `app/(tabs)/templates/` (list + builder)

**Prompt:**
> Migration `0003_templates.sql` for `workout_templates` and `template_exercises` (per SRS §4), RLS scoped to the owning trainer. Build a template builder: create a template (name, description, notes), add exercises from the library, set target_sets/target_reps/target_weight/rest_seconds per exercise, and reorder via drag or up/down. Show a templates list. Trainer-only.

**Smoke test:** Create a template with 4 exercises, set targets, reorder two of them, save, reopen → order and targets persisted.

**On green:** `git commit -m "feat(v3): reusable workout templates"` && `git push`

---

## V4 — Scheduling

**Goal:** Assign a template to a client on a date; client sees upcoming.

**Files (≤2 + migration):** `0004_scheduling.sql`, `app/(tabs)/schedule/` + client home upcoming list

**Prompt:**
> Migration `0004_scheduling.sql` for `scheduled_workouts` (per SRS §4), RLS so trainers manage their clients' rows and clients read their own. Also add a `trainer_clients` roster table if not present, with a way for the trainer to add a client by phone/email (the client must already have signed up). Trainer flow: pick a client, pick a template, pick a date, and optionally write a **note for that workout** ("today's lighter — focus on form") → creates a scheduled_workout (status 'scheduled'). Use `lib/dates.ts` for all date handling (Asia/Jerusalem). Client home: list upcoming scheduled workouts sorted by date.

**Smoke test:** As trainer, add a client to roster, schedule a template for tomorrow. As that client, see the workout on the home screen with the right date and template name.

**On green:** `git commit -m "feat(v4): roster + workout scheduling"` && `git push`

---

## V5 — Workout Logging + Rest Timer

**Goal:** Guided logging with a built-in rest timer, the trainer's note, and last time's numbers.

**Files (≤2 + migration):** `0005_logging.sql`, `app/workout/[id].tsx` (logging screen)

**Prompt:**
> Migration `0005_logging.sql` for `workout_logs` and `set_logs` (per SRS §4), RLS scoped to the client (trainer can read). Build the active-workout screen: show the trainer's note for this scheduled_workout at the top if present, then step through its exercises. For each exercise, display **last time's numbers** — the client's most recent previous weight × reps for that exercise (query past set_logs; show "—" if none). Log reps/weight per set with a rest-timer countdown between sets using each exercise's rest_seconds (visible, pausable, skippable). "Complete workout" creates the workout_log + set_logs and sets the scheduled_workout status to 'completed'.

**Smoke test:** Open a workout that has a trainer note → the note shows at top. An exercise you've done before shows last time's weight × reps. Log all sets, watch the rest timer, complete it → status flips to completed and rows exist.

**On green:** `git commit -m "feat(v5): logging with rest timer, trainer note, last-time numbers"` && `git push`

---

## V5b — Swap / Skip Exercise (with reason)

**Goal:** Let the client swap or skip an exercise during an unsupervised workout, with a reason the trainer sees.

**Files (≤2 + migration):** `0005b_exercise_adjustments.sql`, edit `app/workout/[id].tsx`

**Prompt:**
> Migration `0005b_exercise_adjustments.sql` for `exercise_adjustments` (id, workout_log_id, exercise_id, action 'skipped'|'swapped', swapped_for_exercise_id nullable, reason text, created_at) per SRS §4, RLS scoped to the client (trainer can read). On the active-workout screen, add a per-exercise menu: **Skip** (capture a short reason) or **Swap** (pick a substitute from the exercise library + a short reason). A swapped exercise logs its sets against the substitute; a skipped one logs no sets. Record the adjustment row either way. Keep the change minimal and don't disturb the existing logging flow.

**Smoke test:** Skip an exercise with a reason → no sets logged, an adjustment row exists. Swap an exercise → you log the substitute's sets and an adjustment row records the swap + reason. Both reasons are visible in the trainer's view of that log.

**On green:** `git commit -m "feat(v5b): swap/skip exercise with reason"` && `git push`

---

## V6 — Effort Rating + Notes + Auto-PR

**Goal:** Effort score, note, automatic PR detection.

**Files (≤2 + migration):** `0006_effort_pr.sql`, edit `app/workout/[id].tsx` + a small `lib/pr.ts`

**Prompt:**
> On workout completion, capture effort_rating (1–10) and an optional client_note (add these columns if the V5 migration didn't — nullable). Implement PR detection in `lib/pr.ts` (deterministic, in app code): when saving set_logs, mark is_pr=true for any set that beats the client's previous best weight (or reps at equal weight) for that exercise. Highlight PRs in the completion summary. Surface effort + note + PRs to the trainer's view of that log.

**Smoke test:** Complete a workout using a heavier weight than a prior session → that set shows a PR badge; effort and note save; confirm is_pr is correct in the DB.

**On green:** `git commit -m "feat(v6): effort rating, notes, auto-PR detection"` && `git push`

---

## V7 — Progress Tracking + Charts

**Goal:** Weight/measurements/photo + a trend chart.

**Files (≤2 + migration):** `0007_progress.sql`, `app/(tabs)/progress/`

**Prompt:**
> Migration `0007_progress.sql` for `progress_entries` (per SRS §4), RLS client-scoped. Set up a private Supabase Storage bucket for progress photos with RLS. Build a Progress screen: log weight + optional measurements (jsonb) + optional photo (via expo-image-picker → Storage). Render a weight-over-time line chart with react-native-gifted-charts.

**Smoke test:** Log weight three times across different dates → chart shows the trend; upload a photo → it saves privately and only that client can see it.

**On green:** `git commit -m "feat(v7): progress tracking with charts and private photos"` && `git push`

---

## V8 — Trainer Dashboard

**Goal:** Roster at a glance + per-client drill-down. The differentiator.

**Files (≤2 + migration):** `0008_dashboard_views.sql` (SQL views), `app/(tabs)/dashboard/`

**Prompt:**
> Create SQL views in `0008_dashboard_views.sql`: per-client today's-workout status, current streak, and next/overdue scheduled workout. Implement "missed" and "streak" **exactly per SRS §4.1** — missed is *derived* (scheduled_date before today in Asia/Jerusalem and not completed; no status-flipping job), and a streak counts consecutive completed scheduled workouts where only a missed one breaks it and days with no scheduled workout never break it. Build the trainer dashboard home: roster list where each client shows did-today (✓ / ✗), current streak, and a due/overdue flag. Tap a client → detail page with recent logs, effort scores, PRs, and their progress chart. All derived numbers come from the views.

**Smoke test:** As trainer, the dashboard correctly shows which clients completed vs missed today and their streaks; open a client → see their recent activity and progress.

**On green:** `git commit -m "feat(v8): trainer dashboard with roster status and client detail"` && `git push`

---

## V8b — Private Trainer Notes

**Goal:** A trainer-only, timestamped notes log per client. The client can never see these.

**Files (≤2 + migration):** `0008b_client_notes.sql`, edit the client-detail page from V8

**Prompt:**
> Migration `0008b_client_notes.sql` for `client_notes` (id, trainer_id, client_id, body, created_at) per SRS §4. RLS must be **trainer-only**: only the owning trainer (trainer_id = auth.uid()) can select/insert/update/delete — add **no** client policy at all, so a client cannot read these even via a direct API call. On the client-detail page (built in V8), add a private notes section: a running list of timestamped notes the trainer can add / edit / delete (e.g. "needs core work", "tends to skip legs"). Label it clearly in the UI as private / trainer-only.

**Smoke test:** As trainer, add two notes on a client → they show newest-first with timestamps and survive a reopen. Sign in as that client → the notes appear nowhere in their app, and a direct query of `client_notes` returns nothing for them.

**On green:** `git commit -m "feat(v8b): private trainer-only client notes"` && `git push`

---

## V9 — Streaks + Badges + Shareable Card

**Goal:** Badges and a branded shareable image.

**Files (≤2 + migration):** `0009_badges.sql`, `app/share-card/[clientId].tsx` (+ `lib/badges.ts`)

**Prompt:**
> Migration `0009_badges.sql` for `badges` (per SRS §4), client-scoped RLS. In `lib/badges.ts`, deterministically award badges on workout completion: first_workout, streak_10, first_month — using the **streak definition from SRS §4.1** (reuse the V8 streak view; don't redefine it). Show earned badges on the client's profile. Build a shareable progress card: a nicely styled view (streak, badges, key stat) with the trainer's name/logo, captured via react-native-view-shot and shared via expo-sharing to WhatsApp/Instagram.

**Smoke test:** Hit a milestone (e.g., 10th completed workout) → the matching badge appears; generate the card → it renders with the trainer brand and the share sheet opens.

**On green:** `git commit -m "feat(v9): streaks, badges, shareable progress card"` && `git push`

---

## V10 — Weekly Check-in + Session Balance

**Goal:** Weekly pulse + package tracking.

**Files (≤2 + migration):** `0010_checkins_packages.sql`, `app/(tabs)/checkin/` + dashboard widget

**Prompt:**
> Migration `0010_checkins_packages.sql` for `check_ins` and `packages` (per SRS §4), correct RLS. Build a weekly check-in form for clients (sleep/energy/soreness/adherence 1–5 + note), once per week. Surface the latest check-in per client on the trainer dashboard. Add packages: trainer sets total_sessions per client; used_sessions auto-increments when a workout is completed (deterministic, in app/trigger); show "sessions remaining" to both sides.

**Smoke test:** Client submits a check-in → trainer sees it. Complete a workout → sessions remaining decrements by exactly one; set total to N and confirm the math.

**On green:** `git commit -m "feat(v10): weekly check-ins and session/package balance"` && `git push`

---

## V11 — Reminders (email / WhatsApp)

**Goal:** Email reminders before sessions + WhatsApp deep link.

**Files (≤2):** `supabase/functions/send-reminders/index.ts`, small client-side `lib/whatsapp.ts`

**Prompt:**
> Write a Supabase Edge Function `send-reminders` that runs on a schedule (cron), finds scheduled_workouts due within the next 24h that haven't been reminded, and emails the client via Resend (use a RESEND_API_KEY secret); mark them reminded to avoid duplicates (add a nullable reminded_at column). On the trainer side, add a "Remind on WhatsApp" action that opens a `wa.me` deep link with a prefilled message including the client name, date, and workout. Document the cron schedule setup in a comment.

**Smoke test:** Manually invoke the function → a reminder email arrives and reminded_at is set (no duplicate on a second run). The WhatsApp link opens with the prefilled message.

**On green:** `git commit -m "feat(v11): email reminders edge function + whatsapp deep link"` && `git push`

---

## V12 — Hebrew + RTL + Intake + Leaderboard

> This version is genuinely two concerns — split into two sessions to keep it 1–2 files each.

### V12a — i18n + RTL
**Files (≤2):** `lib/i18n.ts` (+ locale JSON), root layout RTL wiring

**Prompt:**
> Add i18next + react-i18next with en/he locale files and expo-localization for device-language detection. Wire RTL: when locale is Hebrew, force `I18nManager` RTL and ensure layouts mirror correctly. Add a language toggle in settings. Translate the core screens' strings (keep keys tidy).

**Smoke test:** Switch to Hebrew → UI text is Hebrew and the layout flips RTL cleanly (no broken alignment on the main screens). Switch back to English → reverts.

**On green:** `git commit -m "feat(v12a): hebrew localization and RTL support"` && `git push`

### V12b — Intake questionnaire + group leaderboard
**Files (≤2 + migration):** `0011_intake_leaderboard.sql`, `app/intake/` + `app/(tabs)/leaderboard/`

**Prompt:**
> Migration `0011_intake_leaderboard.sql`: add an intake jsonb to profiles (goals, injuries, equipment, experience) and a `leaderboard_weekly` SQL view (per-client completed workouts and longest streak for the current week), plus an opt-in flag on clients. Show the intake form to new clients on first run and store their answers; surface them on the trainer's client-detail page. Build an opt-in weekly leaderboard screen (most workouts / longest streak) for clients who opted in.

**Smoke test:** New client completes intake → trainer sees the answers. Two opted-in clients with different completion counts → leaderboard ranks them correctly; an opted-out client doesn't appear.

**On green:** `git commit -m "feat(v12b): intake questionnaire and opt-in group leaderboard"` && `git push`

---

## After V12
You have a shippable app. Tag it (`git tag v1.0-feature-complete`) and move to `DEPLOYMENT.md` for the store submissions. Future work (push, HealthKit, etc.) lives in SRS §8 as V13+.
