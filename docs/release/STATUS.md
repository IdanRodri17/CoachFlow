# Release 1.0 — status (updated 2026-11-19 by Opus 5.5)
Phase: 2 (audits B, C, D merged; A pending) · Next checkpoint: 0+1 combined · Branch: `cloud/release-1.0`
Baseline at a6d570e: typecheck ✓ · lint ✓ (0 errors, 6 warnings) · tests 138/138 (9 files)
Now: typecheck ✓ · lint ✓ (0 errors, 6 warnings) · tests 145/145 (10 files)

P0 = blocks store submission or leaks data · P1 = before the public launch · P2 = after launch.
Audit ids: A = store compliance, B = Supabase security, C = app robustness, D = build config.
Ship type: **JS** = reaches testers by OTA update · **native** = needs a new store build · **live** = a change to Supabase/expo.dev, no build.

| id | item | type | P | owner | done when | state |
|----|------|------|---|-------|-----------|-------|
| R7 | eas.json, store runtime split, build workflow, .easignore, versioning rule (D1–D3, D9, D10, D19) | release | P0 | lead | previews resolve sdkVersion, production appVersion; workflow validates | ✅ 4d7a346 |
| R6 | Error boundaries: root, tabs, workout (C1, C2) | release · JS | P0 | implementer | a render crash shows a translated retry screen | ✅ af3e6c4 |
| R4 | Store-safe permissions: photo purpose string, camera/mic/READ_MEDIA_*/overlay blocked, no Face ID string, no Photos prompt, `usesNonExemptEncryption: false` (D6, D7, D12) | release · native | P0 | lead | introspected Info.plist + manifest clean | ✅ 3d2c607 |
| R2 | Account deletion removes progress photos (own + managed clients' folders) before the user (B2) | release · live | P0 | lead | code ✅; deployed; a throwaway account leaves no objects | ✅ 9c5eed1 code · **deploy needs OK** |
| R2b | One-off sweep of photo folders whose owner no longer exists (B2) | data · live | P0 | lead with OK | no orphan folders | needs OK |
| S1 | Test OTP on Idan's real number = his real trainer account behind one static code; the number was in a public code comment (B1) | security · live | P0 | Idan | number removed from Auth → Phone → test numbers | comment fixed e7e35d1 · **Idan** |
| S2 | Shared dev password for trainer@/client@coachflow.dev is in public git history (B8) | security · live | P0 | Idan | Email provider confirmed OFF; both passwords rotated | **Idan** |
| R7b | `production` environment on expo.dev: Supabase URL + anon key + `APP_VARIANT=production` (D4) | release · live | P0 | Idan (or lead with OK) | `eas env:list production` shows all three | todo (RUNBOOK 1.1) |
| R12 | Real app icon, adaptive icon, splash, notification icon (D5, D8, D14) | release · native | P0 | decision → lead | no Expo template art in assets/ | blocked: decision |
| R1 | Privacy policy + terms linked in the app (onboarding + Profile) | release · JS | P0 | implementer + Idan (hosting) | both links open the hosted he/en pages | blocked: decision |
| R3 | Web account-deletion page | release | P0 | store-writer + Idan (hosting) | public URL live | blocked: decision |
| R8 | AI disclosure + in-app "report this plan" | release · JS | P0 | implementer | every plan labeled; report works | waiting for audit A |
| R5 | App Review sign-in: test numbers, demo data, review notes | release · live | P0 | Idan + store-writer | a reviewer signs in on both sides | todo (RUNBOOK 1.2–1.3) |
| I1 | Confirm `com.idan.coachflow` (D11) | decision | P0 | Idan | answered | ask |
| S3 | Live `send-trainer-digest` and `send-reminders` accept any app JWT (deployed versions predate the cron gate); unused since email was dropped (B3, B6) | security · live | P1 | Idan | both deleted in Supabase → Edge Functions | **Idan** |
| S4 | SMS abuse: random Israeli numbers cost an SMS each; one IP can exhaust the hourly SMS quota and block logins (B4) | security · live | P1 | Idan | Auth rate limits sized; SMS4Free balance alert; CAPTCHA later | todo |
| R9 | nutrition-suggest daily cap per trainer: `ai_usage` table + definer function, 429 over the cap; Anthropic spend limit (B5) | release · live+JS | P1 | implementer | 21st call in a day gets 429 | todo (migration 0039) |
| R15 | A client can leave a trainer (withdraw consent): delete policy on `trainer_clients` + "Leave trainer" action (B7) | privacy · live+JS | P1 | implementer | client unlinks; trainer loses read access | todo |
| C3 | Failed cold-start profile read sent users to onboarding (Save overwrote the profile) | bug · JS | P1 | implementer | retry screen; `lib/authRoute.ts` + 7 tests | ✅ af3e6c4 |
| C4 | `getSession()` without catch → endless spinner | bug · JS | P1 | implementer | loading always ends | ✅ af3e6c4 |
| R11 | Gender-neutral Hebrew (16 strings) | release · JS | P1 | lead | values neutral, keys untouched | ✅ 2329434 |
| R10 | nutrition-suggest model id `claude-sonnet-5` | bug | — | — | valid, supported to ≥ 2027-06-30 (B15) | ✅ no change |
| C5, C6 | `.single()` on detail screens shows raw errors on a deleted/bad id; `data!` in handlers | bug · JS | P1 | implementer | `maybeSingle` + notFound; guarded handlers | todo (batch 2) |
| C7, C8 | Mutations without `onError` fail silently offline | bug · JS | P1 | implementer | translated alert on failure | todo (batch 2) |
| C9, C10 | Home and exercises have no error state | bug · JS | P1 | implementer | error row + retry | todo (batch 2) |
| C11, C15, C16 | Raw English Supabase errors in the Hebrew UI | bug · JS | P1 | implementer | one `friendlyError()` everywhere | todo (batch 2) |
| C12 | Not-found screens have no back button (iOS user stuck) | bug · JS | P1 | implementer | back + retry | todo (batch 2) |
| C13, C14 | Blank loading on two detail screens; undefined photo URL | bug · JS | P1 | implementer | spinner; placeholder | todo (batch 2) |
| D17 | 16 KB page-size check on the first AAB | release | P1 | Idan + lead | no Play Console warning | after the first build |
| R13 | Store package (listings, policy drafts, form answers, review notes, screenshots plan) | release | P1 | store-writer | Phase 5 files complete | after decisions |
| R14 | RUNBOOK | release | P1 | lead | current at every checkpoint | ✅ parts 0–5 drafted |
| B9–B13, B16–B20 | Write-check gaps on 4 policies, client-editable reminder stamps, anon table grants, bucket size/MIME limits, invite-code throttle, SMS number check + timeout, realtime delete ids, CORS/logging, Anthropic key in the app's .env, perf advisors | security/perf | P2 | — | — | later (one hardening migration) |
| C17–C25, D16, D20 | Lint warnings, `ltr()` on times, global error handler, JSON.parse loop, localized display name, `eas project:info` | misc | P2 | — | — | later |

## Decisions (Idan)
*(Asked at Checkpoint 0+1. Answers go here.)*

## Decisions I made (conservative defaults)
- v28 / migration 0039 stay out of 1.0 (0039 isn't applied). This branch's next free migration number is **0039**; renumber v28 if it ever lands.
- eas.json has only a `production` profile (no `expo-dev-client`, and nothing uses a preview build).
- Store builds use the `appVersion` runtime rather than `fingerprint`.
- `.easignore` excludes docs/, .claude/, supabase/ and .github/ from build uploads.
- The error screen uses the palette's hex values and the system font (the root boundary renders outside every provider).
- Photo picking no longer asks for library permission: the system picker doesn't need it, and the app then only sees the photo that was picked.
- Gender-neutral Hebrew went beyond the 11 listed keys to all 16 masculine commands found; noun forms for buttons.
- Ran the four audits during Phase 0 and built the decision-free P0/P1 items before the checkpoint, to save a round trip.
- RUNBOOK recommends GitHub Pages in a separate public repo for the legal pages.

## Migrations to apply, in order
None yet. Planned: 0039 `ai_usage` (R9), 0040 `trainer_clients` client delete policy (R15).

## Live changes waiting for Idan's OK
1. Deploy `delete-account` (9c5eed1) through the Supabase connector, then verify with a throwaway test account.
2. One-off sweep of orphaned photo folders (lists folder names only, removes those with no owner).

## Idan's manual tasks
- **Today, security:** remove his own number from Auth → Phone → test numbers (S1); confirm the Email provider is off and rotate the two dev passwords (S2); delete `send-trainer-digest` and `send-reminders` in Edge Functions (S3).
- RUNBOOK Part 0: Play account type/date, 15–20 Android testers, Apple Developer enrollment, support email.
- RUNBOOK 1.1–1.3 before the first store build.

## Facts gathered (2026-11-19)
- Supabase org plan: **free** (no backups; can pause when idle). Region **eu-central-1** (Frankfurt).
- All 18 public tables have RLS; all 8 views are `security_invoker`; the `progress-photos` bucket is private with correct folder policies (B).
- No FK is RESTRICT, so deleting any user succeeds. A trainer's deletion also removes the history app clients logged with that trainer; a client's deletion removes the trainer's packages, payments and notes for that client. `client_invites` keeps the trainer-typed label and price (B14). The privacy policy and terms must say so.
- EAS CLI 27.4 is installed and logged in as `idanrodri` on Idan's computer.

## Post-launch (moved out of scope)
- V28 volume milestones (cloud/dev caf978c)
- V24 revenue per client, CSV export, Hebrew receipt over WhatsApp
- DB performance migration: `(select auth.uid())` in 37 policies, FK indexes (B20)
- Share card "שמירה בגלריה"; "רישום האימון" on Home's next-up card; share card opt-in deltas + bigger trainer icon
- Separate dev/prod Supabase projects; Auth CAPTCHA
