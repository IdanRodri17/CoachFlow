# CoachFlow — Software Requirements Specification (SRS)

> **Working name:** CoachFlow *(rename to your friend's brand before the first store submission — it's used as the app name, bundle id suffix, and repo name).*
> **Owner / Developer:** Idan
> **Client:** A beginner personal/group fitness trainer
> **Status:** V1 not started — build incrementally V1 → V12 with Claude Code.

---

## 1. Introduction

### 1.1 Purpose
CoachFlow is a mobile app that lets a fitness trainer build, schedule, and track workouts for their clients, and lets clients follow their assigned workouts, log progress, and stay motivated. The trainer side is the real differentiator: the client app is table stakes, the **trainer dashboard** is what makes a trainer love it.

### 1.2 Scope (this version of the product)
In scope: content (exercise library + demo videos), scheduling, workout logging, progress tracking, and a set of retention features (rest timer, effort ratings, streaks, badges, shareable cards, weekly check-ins, leaderboard). Hebrew/RTL support is a first-class requirement, not an afterthought.

**Explicitly out of scope (deferred — see §8):** Apple Health / Google Fit / wearable sync, native push notifications (V1–V12 use email/WhatsApp), in-app chat, and in-app payments. These are real future features but not part of the initial build, and none of them block shipping.

### 1.3 Definitions
- **Trainer** — creates exercises, templates, schedules, and views the dashboard.
- **Client** — follows assigned workouts, logs sets, tracks progress.
- **Template** — a reusable workout the trainer builds once and assigns to many clients / many weeks.
- **Scheduled workout** — a template assigned to a specific client on a specific date.
- **Workout log** — a client's record of actually performing a scheduled workout.
- **PR** — personal record (a set that beats the client's previous best weight/reps for that exercise).

---

## 2. Overall Description

### 2.1 User classes
| Class | Description | Key needs |
|---|---|---|
| Trainer | The business owner. One per app instance for V1 (single-trainer). | Build content fast, assign it, see who's on track at a glance. |
| Client | The trainer's paying clients. | Clear "what do I do today", easy logging, visible progress. |
| Guest (later) | Not in V1–V12. A future drop-in flow. | — |

### 2.2 Operating environment
- iOS 15+ and Android 8+ (Expo's supported range).
- Online-first. The app tolerates brief network drops gracefully (cached reads via React Query) but does **not** target full offline mode in V1–V12.

### 2.3 Design constraints & assumptions
- **No always-on server to babysit.** Backend is Supabase (managed Postgres + Auth + Storage + Edge Functions). Avoids the Render-free-tier-kills-your-cron problem you hit on PortfolioPilot.
- **EAS cloud builds** — so iOS builds don't require a Mac.
- **Deterministic numbers** (streaks, PRs, sessions remaining, leaderboard) are computed in SQL or app code, never guessed — same principle as your "compute numbers in Python post-LLM" rule.
- **Surgical migrations.** No heavyweight migration framework; use Supabase SQL migrations (plain, reviewed `.sql` files). New columns are added nullable / with safe defaults so older app versions don't break — same convention as your "new FinalReport fields always optional."
- **Time zone:** all date logic — "today's workout", reminders, streaks, and the missed-workout rule — resolves in the user's local time zone, defaulting to **Asia/Jerusalem**. Never compare dates in raw UTC.
- **Dev tooling:** regenerate TypeScript types from the DB after every migration (`supabase gen types typescript`); a seed script provisions a demo trainer + clients + exercises + a template for fast smoke tests.

---

## 3. Tech Stack & Architecture

### 3.1 Stack
- **App:** Expo (React Native) + Expo Router + TypeScript
- **Styling:** NativeWind (Tailwind for RN — reuses your Tailwind muscle memory)
- **Server state:** TanStack Query (React Query) over the Supabase JS client
- **Backend:** Supabase — Postgres, Auth (**phone/SMS OTP** via a provider like Twilio; **email OTP** as a no-setup fallback for early dev), Storage (photos), Row-Level Security, Edge Functions (scheduled reminders)
- **Charts:** `react-native-gifted-charts`
- **Video:** `react-native-youtube-iframe` (embed YouTube/Vimeo — zero hosting)
- **Share card:** `react-native-view-shot` + `expo-sharing`
- **Images:** `expo-image-picker` → Supabase Storage
- **i18n / RTL:** `i18next` + `react-i18next` + `expo-localization` + `I18nManager`
- **Email reminders:** Supabase Edge Function (cron) + Resend
- **Build / ship:** EAS Build + EAS Submit + EAS Update (OTA for JS-only changes)

**Alternative considered:** Capacitor over a Next.js web app (reuses more web skill, less new RN). Rejected as the default because Expo gives a more genuinely-native result, the marketable RN skill for your job hunt, and the cleanest cloud build/submit pipeline. Capacitor stays a valid fallback if RN friction ever outweighs the upside.

### 3.2 Security model (RLS)
Every table is protected by Row-Level Security:
- A **trainer** can read/write rows for clients in their own roster (`trainer_clients`).
- A **client** can read/write only their own rows.
- No row is readable by an unrelated user.

This is enforced in the database, not just the UI — so a malicious client can't pull another client's data even by calling Supabase directly.

---

## 4. Data Model

> Conventions: `id uuid default gen_random_uuid()`, `created_at timestamptz default now()`. All FKs `on delete cascade` unless noted. Computed values (streaks, PRs, remaining sessions, leaderboard) are **not** stored as source of truth — they're derived in SQL views or app code.

```
profiles            (id→auth.users, role 'trainer'|'client', display_name, locale, avatar_url,
                     accepted_terms_at, accepted_health_disclaimer_at)
trainer_clients     (trainer_id→profiles, client_id→profiles, status 'active'|'paused')
exercises           (id, trainer_id, name, description, muscle_group, video_url, thumbnail_url,
                     default_sets, default_reps)
workout_templates   (id, trainer_id, name, description, notes)
template_exercises  (id, template_id, exercise_id, position, target_sets, target_reps,
                     target_weight, rest_seconds)
scheduled_workouts  (id, trainer_id, client_id, template_id, scheduled_date,
                     status 'scheduled'|'completed'|'missed', notes)
workout_logs        (id, scheduled_workout_id, client_id, completed_at,
                     effort_rating int CHECK 1..10, client_note, duration_seconds)
set_logs            (id, workout_log_id, exercise_id, set_index, reps, weight, is_pr bool)
exercise_adjustments(id, workout_log_id, exercise_id, action 'skipped'|'swapped',
                     swapped_for_exercise_id, reason, created_at)
progress_entries    (id, client_id, date, weight, measurements jsonb, photo_url)
check_ins           (id, client_id, week_start, sleep int, energy int, soreness int,
                     adherence int, note)
packages            (id, trainer_id, client_id, total_sessions, used_sessions)
badges              (id, client_id, type, earned_at)
client_notes        (id, trainer_id, client_id, body, created_at)   -- PRIVATE: trainer-only RLS; client can never read
```

Derived (SQL views, not tables): `client_streaks`, `client_prs`, `leaderboard_weekly`, `sessions_remaining`.

### 4.1 Business rules (locked)
- **"Missed" is derived, not stored.** A scheduled workout's stored status is `scheduled` or `completed`. It counts as *missed* on read when its `scheduled_date` is before today (user-local, Asia/Jerusalem) and it isn't completed. This avoids needing a cron job to flip statuses.
- **Streak** = consecutive *completed* scheduled workouts. A streak breaks only when a scheduled workout is missed (passed + not completed). Days with **no** scheduled workout — rest days, gaps — never break a streak. This keeps the streak fair for a flexible schedule where some weeks have one session and others two.
- **Sessions remaining** = `packages.total_sessions − used_sessions`, where `used_sessions` increments by exactly one per completed workout.

---

## 5. Functional Requirements (by version)

Each version is a clean, shippable increment ending in a smoke test → `feat(vN):` commit → push. The Claude Code prompt for each lives in `CLAUDE_CODE_PLAYBOOK.md`.

**V1 — Foundation & Auth.** Expo scaffold, Supabase project, `profiles`, **phone/SMS OTP auth** (email OTP fallback during early dev), role selection (trainer/client), and a signup step where the user **accepts the terms of use + health disclaimer** ("consult a physician before starting") — stamped to `accepted_terms_at` / `accepted_health_disclaimer_at`. Role-aware tab shell with empty states.

**V2 — Exercise Library.** `exercises` CRUD (trainer). Add/edit with a YouTube/Vimeo URL + thumbnail. Client can browse exercises and watch demo videos.

**V3 — Workout Templates.** `workout_templates` + `template_exercises`. Trainer builds a reusable template: pick exercises, set target sets/reps/weight/rest, reorder. *(This is the feature that saves the trainer time and lets him take on more clients without more work.)*

**V4 — Scheduling.** `scheduled_workouts`. Trainer assigns a template to a client on a date and can attach an **optional note for that workout** ("today's lighter — focus on form") via the existing `notes` field. Client sees upcoming workouts on their home screen.

**V5 — Workout Logging + Rest Timer.** Client opens today's workout → guided per-exercise logging (sets/reps/weight). The trainer's note for the workout shows at the top, and each exercise shows **last time's numbers** (previous weight × reps) so the client knows what to aim for without the trainer in the room. Built-in rest-timer countdown between sets. Mark complete → status `completed`.

**V5b — Swap / Skip Exercise (with reason).** During an unsupervised workout, the client can **swap** an exercise (no machine available, pain) for a substitute, or **skip** it — each with a short reason, recorded in `exercise_adjustments`. Prevents the all-or-nothing "abandon the whole workout" failure, and the reason surfaces to the trainer.

**V6 — Effort Rating + Notes + Auto-PR.** On completion, client gives a 1–10 effort score and an optional note ("shoulder twinged"). App auto-detects PRs (beats previous best weight/reps) and flags/highlights them. Trainer sees effort + note + PRs.

**V7 — Progress Tracking + Charts.** `progress_entries`: weight, measurements, optional weekly progress photo (→ Storage). Weight-over-time chart.

**V8 — Trainer Dashboard.** Trainer home = roster with per-client status: did today's workout? current streak? due/overdue? Drill into a client for recent logs, effort, PRs, progress. *(The real differentiator.)*

**V8b — Private Trainer Notes.** A running, timestamped notes log on each client's detail page, visible to the trainer **only** (e.g. "needs core work", "tends to skip legs"). Enforced by trainer-only RLS — the client can never read these, even via the API. Helps the trainer track tendencies across the gaps between in-person sessions.

**V9 — Streaks + Badges + Shareable Card.** Compute streaks (consecutive completed). Award badges (first workout, 10-workout streak, first month). Generate a branded shareable progress card (trainer's name/logo) → share to WhatsApp status / Instagram. *(Free marketing for the trainer.)*

**V10 — Weekly Check-in + Session Balance.** Weekly 30-second check-in (sleep/energy/soreness/adherence/note) → trainer sees a per-client pulse. `packages`: trainer sets total sessions; `used` auto-increments on completion; show "sessions remaining."

**V11 — Reminders (email / WhatsApp).** Supabase Edge Function (scheduled) emails a client before a scheduled workout (Resend). "Remind on WhatsApp" deep link (`wa.me`) with a prefilled message for the trainer to send manually.

**V12 — Hebrew + RTL + Intake + Leaderboard.** Full i18n (en/he) with RTL flip via `I18nManager`. Intake questionnaire on client signup (goals, injuries, available equipment, experience). Opt-in weekly group leaderboard (most workouts / longest streak) for group clients.

---

## 6. Non-Functional Requirements
- **Localization:** English + Hebrew, full RTL. Design RTL-aware from V1 (don't retrofit).
- **Security:** RLS on every table; no client can read another client's data even via direct API.
- **Performance:** List screens render under ~1s on a mid-range Android; videos lazy-load.
- **Privacy:** A published privacy policy URL; progress photos are private (Storage RLS); a clear in-app account-deletion path (also required by Apple once you have login — see deployment doc).
- **Resilience:** Cached reads survive brief offline; writes show clear retry on failure.
- **Maintainability:** 1–2 files per Claude Code session; conventional commits; smoke test before every commit.

---

## 7. Feature → Version Map (the "outstanding" extras)
| Feature | Version |
|---|---|
| Exercise demo videos | V2 |
| Reusable templates | V3 |
| Rest timer between sets | V5 |
| Last time's numbers while logging | V5 |
| Trainer note shown to client | V4 / V5 |
| Swap / skip exercise with reason | V5b |
| "How did it feel?" effort rating + note | V6 |
| Auto-PRs + completion streaks | V6 / V9 |
| Progress charts + photos | V7 |
| Trainer dashboard | V8 |
| Private trainer notes (trainer-only) | V8b |
| Badges + shareable progress card | V9 |
| Weekly check-in | V10 |
| Session/package balance | V10 |
| Smart reminders (email/WhatsApp) | V11 |
| Hebrew + RTL | V12 |
| Intake questionnaire | V12 |
| Group leaderboard | V12 |

---

## 8. Out of Scope / Future (V13+)
Deferred by design — none of these block launch:
- Native push notifications (Expo Notifications + EAS) — easy to add later.
- Apple Health / Google Fit / wearable sync (step/HR/workout import) — needs native modules; revisit only if the trainer actually asks for it.
- In-app messaging between trainer and client.
- In-app payments — keep payments outside the app (real-world services don't trigger Apple's 30% cut); only revisit if you ever sell purely-digital content.
- Multi-trainer / gym mode (multiple trainers under one org).
