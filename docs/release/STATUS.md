# Release 1.0 — status (updated 2026-11-27 by Opus 5.5)
Phase: 1 done (audits A, B, C, D merged) · **Checkpoint 0+1 answered 2026-11-20** (see "Decisions (Idan)") · Branch: `cloud/release-1.0`
**Priority (Idan, 2026-11-20): one united session; bugs and UI/UX first, deployment after.** Since 2026-11-20 a single local session ("CoachFlow: bugs & UI/UX, then release") does all the work. The release lead, the cloud session and 6 older local sessions are archived, and every cloud branch is contained in this one, except v28's app code (post-launch, on cloud/dev). Work from the "Now: bugs and UI/UX" list below; the release table after it is parked.
Baseline at a6d570e: typecheck ✓ · lint ✓ (0 errors, 6 warnings) · tests 138/138 (9 files)
Now (2026-11-27, night): typecheck ✓ · lint ✓ (0 errors, 4 warnings) · tests 206/206 (16 files) · `expo export` iOS ✓ Android ✓ · expo-doctor 20/20 ✓

P0 = blocks store submission or leaks data · P1 = before the public launch · P2 = after launch.
Audit ids: A = store compliance, B = Supabase security, C = app robustness, D = build config.
Ship type: **JS** = reaches testers by OTA update · **native** = needs a new store build · **live** = a change to Supabase/expo.dev, no build.

## Now: bugs and UI/UX (united list, 2026-11-20)
Merged from the cloud session's final report (it checked each item against cloud/dev and this branch on 2026-11-20), its fixes document ([CoachFlow — רשימת תיקונים](https://claude.ai/artifact/Cvg1hpxbs6CTiBkYF5kzzj), status section last updated 2026-11-06, now historical) and the release audits. Items that already had an id keep it; new ones get **U** ids. (The fixes document's own ids D1/D3/D4/P1–P3/F6 collide with the audit ids, so they're only quoted.) Ordered in the order to work them.

| # | id | problem | where | type | state |
|---|----|---------|-------|------|-------|
| 1 | CF1 | Phone check of the layout fix: the "+" circle, rows side by side, swipe actions (incl. the Hebrew swipe direction, never checked on a phone) | tab bar, מתאמנים, תרגילים, תבניות, לוח זמנים | JS | **Idan:** smoke steps 1–7 and 9 below |
| 2 | CF2 | Unticking someone in a group session leaves their package one session too many used; re-ticking counts it twice | group attendance | live | ✅ **0043 live 2026-11-20** (3c3ac7d); in-app check: untick someone on a group sheet, the package gets the session back |
| 3 | U1 | Packages already miscounted by past unticks aren't corrected | client card → package | live data | ✅ checked 2026-11-20, nothing to fix: the live DB has 1 package, in no group session. Its used_sessions = 4 = exactly the completed workouts whose log `completed_at` is after the package's `created_at` (13 more were done before it existed and correctly don't count). The app only ever completes a workout by UPDATE, so the AFTER UPDATE trigger sees every completion. Re-check if group sessions get real use before 0043 matters |
| 4 | R2 | Deleting an account leaves progress photos on the server | Profile → delete account | live | code ✅ 9c5eed1; deploy delete-account (OK'd 2026-11-20, not done) |
| 5 | C5, C6 | A deleted or wrong item opens a raw error | detail screens | JS | ✅ f8b60fb (PGRST116 → the screen's own not-found text; handlers guard instead of `data!`) · phone check |
| 6 | C7, C8 | Saves and deletes fail with no message when offline | most editing screens | JS | ✅ f8b60fb (mutations `networkMode: "always"` + MutationCache alert unless `onError`/`meta.inlineError`) · phone check |
| 7 | C9, C10 | Home and the Library show no error or retry when loading fails | Home, Library | JS | ✅ f8b60fb (`InlineError` + retry on both Homes, Library, templates, clients, schedule, money, nutrition) · phone check |
| 8 | C11, C15, C16 | Raw English server errors in the Hebrew app (e.g. finishing a workout) | many | JS | ✅ f8b60fb (`lib/friendlyError.ts` + 7 tests; no `(x as Error).message` left on screen) · phone check |
| 9 | C12 | "Not found" screens have no back button; iPhone users get stuck | detail screens | JS | ✅ f8b60fb (`ScreenMessage`: back, with a fallback route, + retry when it helps) · phone check |
| 10 | C13, C14 | Two detail screens are blank while loading; a missing photo address shows a broken image | detail screens, progress photos | JS | ✅ f8b60fb (`ScreenLoading` on exercise + template; photos already filtered to signed ones, assertions removed) · phone check |
| 11 | A9 | The delete-account warning mentions "messages" (none exist) and doesn't say what a trainer's deletion removes | Profile → delete account | JS | ✅ f8b60fb (role-specific he/en text) · true for photos only once delete-account (#4) is deployed |
| 12 | U2 | The finished-workout summary still uses the pre-redesign colours (fixes doc D1) | workout summary | JS | ✅ see row 23 (`CompletedWorkout` in the kit's look) |
| 13 | U3 | A white flash before the background appears; old styling left in the exercise video box (fixes doc D3) | app start, exercise screen | JS (+ native for the splash colour) | ✅ (2026-11-27 evening push) the flash was the tabs layout's white loading screen (`bg-white`) between the splash and Home → `ScreenLoading` on chalk; the root view and the navigator theme (expo-router `ThemeProvider`) are chalk too, so nothing white shows behind a screen that hasn't painted. The video box is the design's: 16:9 of its width, radius 20, ink. The splash's own colour is native: it rides with R12 (icon + splash) · phone check |
| 14 | U4 | No "renew package": the trainer types a running total (10 → 20), and typing 10 again still shows it used up (fixes doc P1) | client card → package | JS (+ maybe live) | ✅ (2026-11-27 evening push) Idan: carry it over. "חידוש חבילה" on the package card (dark when 2 or fewer are left): pick the size (5/8/10/12/20 or typed) and the price; what's left carries over and sessions done beyond the package count against the new one (`lib/packageRenewal.ts`, +4 tests), shown before saving ("אחרי החידוש: נשארו 12 מתוך 12"). Same packages row, no migration · phone check |
| 15 | U5 | No way to archive or remove a client; the list only grows (fixes doc P2) | מתאמנים | JS + live | ✅ (2026-11-27 evening push) Idan: archive only. **0048 live**: `archived_at` on trainer_clients and managed_clients + `set_client_archived` (one transaction: stamps it and deletes the client's sessions still scheduled from today on; history, workouts, package and money stay). "לארכיון" in a row's swipe actions and on the client card (the confirm says how many upcoming sessions go); archived clients leave the list, the schedule pickers, quick-add and Home's attention feed; the "ארכיון" filter lists them with "החזרה", and their card has "החזרה מהארכיון". Names in past sessions and Money still resolve · phone check |
| 16 | U6 | A mistaken "mark as done" can't be undone outside group sessions (fixes doc P3); the DB side is ready in 0043 | calendar → workout | JS | after #2 |
| 17 | U7 | Badges (incl. volume) aren't awarded when the trainer logs the workout, only at the client's next own save | client Progress → badges | JS or live | ✅ (2026-11-27 evening push) Progress runs the badge check when it loads (idempotent), and "first workout" is the earlier of the first log and the first session marked done, so a "with trainer" session the trainer marked counts (`lib/badgeRules.ts`, +5 tests). Volume badges are v28's (post-launch) · phone check |
| 27 | U6 | Undo a mistaken "סימון כבוצע" | calendar → session (completed, no log) | JS | ✅ (this push) "ביטול הסימון" on a completed session with no workout log; 0043 returns the package session. **Idan to undo 4.7 and 11.7** (marked by mistake 2026-11-21) · phone check |
| 28 | P8 | Clients saw only upcoming workouts, not previous ones | client Home | JS | ✅ (this push) "אימונים קודמים": the last 5 completed (logged or marked), each opens its summary; a later day's hero says "צפייה באימון" · phone check |
| 29 | P9 | The shared progress image was named with a UUID | share card → share sheet | JS | ✅ (this push) copied to `CoachFlow-<name>-<date>.png` first (`lib/shareFileName.ts` + 5 tests; expo-file-system now a direct dependency, ~58.0.14, bundled in Expo Go) · phone check |
| 30 | P10 | Workout pages (previous workout, preview) started under the header: "too high, I need to scroll down to see the title" | workout → summary / preview | JS | ✅ 2nd fix (Idan's video 2026-11-23: the automatic inset opened the page half-scrolled, title still under the header): the workout pages hide the stack header and draw their own back bar under the safe area, like group and share card · phone check |
| 31 | F1 | Last time, set by set: the set screen shows the same set from the last session ("בפעם הקודמת (20.11): 42.5 × 8", that session's last set when it had fewer); the overview and the preview list last time's sets; each set prefills from last time's same set (weight: the higher of it and the template target; reps: the target, else last time) | workout | JS | ✅ (this push) `lastSessionOf` / `lastTimeSet` / `prefillSet` / `numbersAt` in lib/workoutSession.ts + 7 tests; history keeps set_index, workout_log_id and completed_at. No migration. Without a last session the next set keeps what was just logged, as before · phone check |
| 32 | P11 | Tomorrow's session showed "בוצע" and couldn't be undone. Cause: on 21.11 at 10:06 (smoke step 9, before "opens on its day" shipped) the client finished 4 free workouts dated 22.11, 23.11, 24.11, 29.11 with 0 sets; each has an empty workout_log, so U6's undo (no-log only) didn't show | calendar → session | live + JS | ✅ **0045 live**: `trg_prevent_early_completion` (no completion before the scheduled day, Asia/Jerusalem, any path) + `reopen_workout()` (trainer-only; removes an empty log, refuses `workout_has_sets`). The undo now shows for any session without sets or skips/swaps. **Reopened 2026-11-23 with Idan's OK** (reopen_workout as his trainer account): 22.11, 23.11, 24.11, 29.11 back to scheduled, their 4 empty logs removed, the client's package 12 → 8 used. 22.11 now reads as missed (derived). Left alone: 22.11 07:00 (marked done, no log) · phone check |
| 33 | P12 | "Start workout" on a free workout (no template) jumped straight to Finish: no clock, sets or exercises | workout | JS | ✅ (this push) Idan: pick exercises as you go. A free workout starts on a picker (library + search, running clock); each pick runs like a planned exercise (ADDED_SETS = 3, last time, PRs, rest) and the workout returns to the picker when it's done; any workout can "הוספת תרגיל" from the overview. Added exercises survive minimize/resume (SavedSession.added). +7 tests · phone check |
| 34 | P13 | Solo sessions can start before their day again (people training on their own choose when); "with trainer" ones still open on their day | workout, client Home | JS | ✅ (this push) Idan: solo only. Finished early, saveWorkout first moves the session to today (0045 refuses completing anything dated later). +1 access test · phone check |
| 35 | P14 | Scheduling at a time that already passed: allow, with a warning | session form | JS | ✅ (this push) "הזמן הזה כבר עבר" confirm on save; an edit that keeps its own day and time isn't asked · phone check |
| 36 | P15 | The stack header covered the top of the dark workout screens ("סיימת!" cut off) | workout | JS | ✅ (this push) the workout route hides the stack header; FinishView gets its own minimize · phone check |
| 37 | P16 | A finished workout couldn't be fixed (a forgotten set, a typo in the reps or the weight); the undo only worked with nothing logged | workout summary | live + JS | ✅ (2026-11-27 push) Idan: edit in place. "עריכה" on the summary for whoever logged it (the client their own, the trainer an offline client's): tap a set to change its reps and weight or delete it, add a set, add an exercise, change effort and note. **0046 live** (`edit_workout_log`: one transaction, the caller's own RLS). The PRs are replayed over the subject's whole history of the exercises involved (`lib/workoutEdit.ts`, +10 tests): fixing a 600 kg typo gives later sessions their PRs back. Package, money and streak don't move · phone check |
| 38 | P17 | Clients train on their own too, and the trainer wants to see it (a parked idea until now) | client Home, client card | live + JS | ✅ (2026-11-27 push) Idan: start it now; the trainer sees it on the client card only; not in the streak. "אימון עצמאי" on Home starts a free workout (the picker) at `/workout/own-<log id>`, saved by `log_own_workout` (**0047 live**: `workout_logs.scheduled_workout_id` nullable; trainer read-only policies through trainer_clients). It isn't a scheduled session, so it uses no package session, isn't income, gets no reminder, is never missed and doesn't touch the streak; it counts for PRs, last time, progress and volume. Listed in "אימונים קודמים" and on the trainer's client card ("עצמאי", no paid chip); the client can edit it. One with nothing logged is dropped, not saved. +3 access tests · phone check |
| 39 | P18 | A client training only on their own showed as "gone quiet" in the at-risk list (P17's catch) | trainer Home, clients list | live | ✅ (2026-11-27 evening) Idan: count them. **0050 live**: `client_risk`'s gone_quiet also needs no own workout in the last 10 days; missing two scheduled sessions still flags the client |
| 40 | P19 | "6 unpaid" on the client card, but nowhere to see which: sessions marked done without a workout log were counted, not listed | client card → package | JS | ✅ (2026-11-27 night) tapping "X אימונים לא שולמו" ("פירוט") lists each one: date, time, with/without trainer, its price, "שולם" per row (`components/UnpaidSessionsSheet.tsx`) · phone check |
| 41 | P20 | Home's today row showed "—" twice for a session with no template and no time | trainer Home, quick-add | JS | ✅ "אימון חופשי" and an empty time (`todaySessionsQuery` returns null for no template) · phone check |
| 42 | P21 | "לארכיון" never showed in the clients list's swipe: ActionRow shows 3 actions and archive was 4th | clients list | JS | ✅ the swipe is WhatsApp, phone, archive (the card is the row's own tap); a long-press now lists every action, in ActionRow itself · phone check |
| 43 | P22 | The own workout was "אימון עצמאי" and its chip "עצמאי", the word solo sessions already use: Idan read a solo session on Home as the client's own workout | client Home, client card | JS | ✅ renamed "אימון נוסף" / chip "נוסף" (Extra workout / Extra) · phone check |
| 44 | P23 | No standard exercises: each trainer typed the whole library by hand (Idan: common exercises with general videos, which each trainer can change) | Library → תרגילים | live + JS | ✅ (2026-11-27 night) Idan: every trainer starts with it. **0051 live**: `exercise_catalog`, 44 common exercises (legs, glutes, back, chest, shoulders, arms, core, other), with Hebrew and English names and cues, default sets × reps and a YouTube demo each (every video checked on 2026-11-27: it exists and allows embedding). Each trainer gets the whole list as their own exercises (`exercises.catalog_slug`): a new trainer on sign-up, in their language; existing trainers once, by the migration. They edit or delete them like any exercise. When some are missing, a "ספרייה כללית" card on תרגילים adds them back, one or all (`components/CatalogSheet.tsx`, `add_catalog_exercises`, which skips what's already there) · phone check |
| 45 | P24 | Test data that touches each feature, on Idan's test trainer, app client and offline clients | everywhere | live data | ✅ (2026-11-27 night) seeded; see "Test data and previews". The 4 old test exercises and 2 old templates were replaced; the app client's SMS reminders are off · phone check |
| 46 | P25 | Pressing an exercise's video opened the YouTube app; the standard library's long links ran past the link field | Library → exercise (trainer), exercise (client) | JS | ✅ (2026-11-27 night) the trainer's preview handed the link to iOS (`Linking.openURL`), which opens YouTube's app. It now plays in place with the in-app player, and both posters start the video on the first tap (`ExerciseVideo` autoPlay; the client used to tap twice). A recognized link is shown and saved in its short form (`https://youtu.be/ID`, `canonicalVideoUrl` + `lib/video.test.ts`), which fits the one-line field as the design draws it. The first try, a wrapping field (86643b0), didn't grow on iOS, and the second line hung below the box (Idan's screenshot). YouTube's own title and logo inside the player still lead to YouTube, as YouTube's player does · phone check |
| 47 | P26 | A workout's "last time" and PR baseline read the client's history in one request, which the API cuts at 1,000 rows in no set order: an active client would pass it within months and lose the newest sets (old "last time", PRs against an old best) | workout, client exercise screen | JS | ✅ (night test, 37ae322) `subjectHistory` and the client's exercise history page through `subjectSets`, as the editor already did |
| 48 | P27 | An extra workout in the client's "אימונים קודמים" read "אימון נוסף · … · עצמאי", the word P22 kept for solo sessions | client Home | JS | ✅ (night test, 0c5a81b) the row shows the day only · phone check |
| 49 | D-doc | expo-doctor: 15 Expo packages a few patches behind SDK 58's expected versions | build | JS | ✅ (night test, 50df23b) `npx expo install --fix` (expo 58.1.0, expo-router 58.0.33, …); doctor 20/20, both bundles build. Same SDK: the preview runtime and Expo Go are unaffected |
| 18 | U8 | Changing a client's price rewrites past months' income and unpaid amounts (fixes doc F6) | money screen, Home money card, client card | live + JS | ✅ (2026-11-27 evening push) Idan: from now on only. **0049 live**: `scheduled_workouts.price`, set by a trigger when a session completes (the package's price then), cleared when it's reopened, and nobody can change it through the app or the API; backfilled for the 26 finished sessions that had a package price (the money checksum was identical before and after). `trainer_monthly_money` and the app's "owed" use the session's own price, the package's only for upcoming sessions or ones that had none · phone check |
| 19 | P1 (phone test 2026-11-21) | Smoke steps 3/5: swipe actions popped in; WhatsApp not green | clients, calendar, every WhatsApp button | JS | ✅ 78620a9 (`colors.whatsapp` #25D366 + ink; actions fade in and grow) · phone check |
| 20 | P2 | Smoke step 9: finishing another day's session showed today's date | finish screen | JS | ✅ 975e95c (shows the scheduled date) |
| 21 | P3 | Client card → upcoming session crashes ("something went wrong"). Logs: the session loads (200), then the first render throws before the form mounts | client card → upcoming → schedule/[id] | JS | ✅ (this push) Idan's screenshot: "cannot add postgres_changes callbacks for realtime:schedule:… after subscribe()". The client card pushes a tab route from outside the tabs, so a 2nd tab layout mounts; realtime-js returns the 1st one's subscribed channel for the same topic. `useScheduleRealtime` now uses a unique topic per mount · phone check |
| 22 | P4 | Nobody starts a workout before its day; everyone can preview it (exercises, sets × reps, recommended weight); the trainer previews an app client's open workout instead of a "not yours" wall | workout screen | JS | ✅ (this push) `workoutAccess` preview kind + `components/workout/WorkoutDetail.tsx` · phone check |
| 23 | U2 | Previous workout opened the pre-redesign summary | client card → previous → workout | JS | ✅ (this push) `CompletedWorkout` in the kit's look: duration, effort, both notes, sets with PRs, skips/swaps · phone check |
| 24 | P5 | Trainer can't add a weigh-in for an app client (by design today: "add weight" only for clients without the app) | client card → weight | live + JS | ✅ Idan: yes. **0044 live** (insert-only, linked clients, no photo) + the card offers "add weight" for every client; the sheet hides the photo button for app clients · phone check |
| 25 | P6 | Trainer can't mark an app client's session done ("we trained together") | client card, Home, calendar | JS | ✅ Idan: "with trainer" only. Home, calendar and the client card offer it. **Fixed 2026-11-21:** the card offered the OLDEST unmarked session (it reached July: 4.7 and 11.7 got marked, each taking a package session), now the newest of the last 7 days. Undo via U6 below; RLS already allowed it (scheduled_workouts_trainer_all). Once marked, the client can't add a set log to it · phone check |
| 26 | P7 | Upcoming session from the client card: edit its exercises and the package | client card → upcoming | JS | ✅ Idan: via the template. The session-edit screen links to "edit the exercises" (the template) and to the package (client card). Blocked on the P3 crash for reaching it from the client card · phone check |
| — | R12 | Icon and splash are still Expo's blue "A" (approved CF icon not wired) | home screen, launch | native | parked with the release work (Expo Go can't show it) |
| — | R1 | "Terms of use" is underlined but opens nothing; no privacy link | onboarding, Profile | JS | blocked: hosting (decision 4) |
| — | S1–S4 | Idan's number as a test number; dev passwords in git history; two old functions accept any user; SMS abuse | Supabase | live | **Idan's tasks** (table below) |
| — | C17 | Six old lint warnings (setState in effects, Date.now() in render, ref read in render, i18n import style) | code health | JS | P2 |
| — | — | v28 volume card uses stand-in icons; `client_volume` typed by hand on cloud/dev | cloud/dev only | — | post-launch, with v28 |

## Release table (parked until Idan reopens deployment)

| id | item | type | P | owner | done when | state |
|----|------|------|---|-------|-----------|-------|
| R7 | eas.json, store runtime split, build workflow, .easignore, versioning rule (D1–D3, D9, D10, D19) | release | P0 | lead | previews resolve sdkVersion, production appVersion; workflow validates | ✅ 4d7a346 |
| R6 | Error boundaries: root, tabs, workout (C1, C2) | release · JS | P0 | implementer | a render crash shows a translated retry screen | ✅ af3e6c4 |
| R4 | Store-safe permissions: photo purpose string, camera/mic/READ_MEDIA_*/overlay blocked, no Face ID string, no Photos prompt, `usesNonExemptEncryption: false` (D6, D7, D12) | release · native | P0 | lead | introspected Info.plist + manifest clean | ✅ 3d2c607 (re-verified by audit A) |
| R2 | Account deletion removes progress photos (own + managed clients' folders) before the user (B2) | release · live | P0 | lead | code ✅; deployed; a throwaway account leaves no objects | ✅ 9c5eed1 code · **deploy needs OK** |
| R2b | One-off sweep of photo folders whose owner no longer exists (B2) | data · live | P0 | lead with OK | no orphan folders | needs OK |
| S1 | Test OTP on Idan's real number = his real trainer account behind one static code; the number was in a public code comment (B1) | security · live | P0 | Idan | number removed from Auth → Phone → test numbers | comment fixed e7e35d1 · **Idan** |
| S2 | Shared dev password for trainer@/client@coachflow.dev is in public git history (B8) | security · live | P0 | Idan | Email provider confirmed OFF; both passwords rotated | **Idan** |
| R7b | `production` environment on expo.dev: Supabase URL + anon key + `APP_VARIANT=production` (D4) | release · live | P0 | Idan (or lead with OK) | `eas env:list --environment production` shows all three | todo (RUNBOOK 1.1) · asked at checkpoint |
| R12 | Real app icon, adaptive icon, splash, notification icon (D5, D8, D14, A5) | release · native | P0 | lead | no Expo template art in assets/ | **approved 2026-11-20** (`docs/release/icons/preview.png`) · todo: run make_icons.py into assets/ + wire app.json (Resume step 3) |
| R1 | Privacy policy + terms + support linked in the app: onboarding consent text with two tappable links that don't toggle the checkbox (A1); a "Legal & support" card in Profile for both roles with policy, terms, support email, web deletion page (A2); sign-in footer (A16, P2) | release · JS | P0 | implementer + Idan (hosting) | both links open the hosted he/en pages; URLs live in one `lib/legal.ts` | blocked: decision (hosting + support email) |
| R3 | Web account-deletion page, incl. an email route for offline (managed) clients who have no account (A4, A12) | release | P0 | store-writer + Idan (hosting) | public URL live | blocked: decision |
| A3 | **Third-party AI consent (Apple 5.1.2(i)).** Before a trainer's first "יצירת תפריט", a one-time sheet names Anthropic and says what is sent (targets, diet chips, free-text preferences; no names or phone numbers); hint under the preferences field not to type names or medical details; covered in the privacy policy | release · JS | P0 | implementer | first plan request shows the sheet; declining sends nothing; accepted once per user per device | todo (batch R8+A3+A9) · **decided 2026-11-20: the sheet names Anthropic (Claude); no Hebrew brand name for the feature** |
| R8 | AI disclosure + in-app report: an "AI-generated" label on the trainer's plan (A7: `[refId].tsx` chip ~368, `nutritionAi.disclaimer`) and the client's plan (A6: `nutrition.tsx` ~85, `nutrition.disclaimer`); "Report this plan" on both (A8) inserting into `ai_reports` (planned migration 0042: plan id, reporter, reason; RLS insert-own, no select for app roles) | release · JS+live | P0 | implementer | every plan labeled; a report lands in `ai_reports` | todo (batch R8+A3+A9) |
| R5 | App Review sign-in: test numbers, demo data, review notes. Plus A10: an idempotent seed SQL that recreates both demo accounts onboarded, linked and with data (reviewers often test "delete account"), and a third test number for deletion testing; say sign-up is Israel-only | release · live | P0 | Idan + store-writer + lead (seed SQL) | a reviewer signs in on both sides | todo (RUNBOOK 1.2–1.3) |
| I1 | Bundle id / package (D11) | release · native | P0 | lead | app.json `ios.bundleIdentifier` + `android.package` = `com.coachflow.app` before the first build | **decided 2026-11-20: `com.coachflow.app`** (not `com.idan.coachflow`) · todo: change app.json; check the id is free when creating the Play/App Store Connect app |
| S3 | Live `send-trainer-digest` and `send-reminders` accept any app JWT (deployed versions predate the cron gate); unused since email was dropped (B3, B6) | security · live | P1 | Idan | both deleted in Supabase → Edge Functions | **Idan** |
| S4 | SMS abuse: random Israeli numbers cost an SMS each; one IP can exhaust the hourly SMS quota and block logins (B4) | security · live | P1 | Idan | Auth rate limits sized; SMS4Free balance alert; CAPTCHA later | todo |
| R9 | nutrition-suggest daily cap per trainer: `ai_usage` + `consume_ai_call` (service role only), 20/day/Israel day, 429 `daily_limit`, fail closed; translated message; Anthropic spend limit (B5) | release · live+JS | P1 | implementer | 21st call in a day gets 429 | ✅ 2a7d0ae · **live 2026-11-20**: 0040 applied, nutrition-suggest v6 (verify_jwt true) · ✅ verified end to end (one plan from the app; `count(*)` on ai_usage = 1) · header comment line 5 still says "never touches the database" (fix with the next function change) |
| CF2 | cloud/dev 18139dd: unticking a group session gives it back to the package (trigger 0043 + a comment in `app/group/[groupId].tsx`) | bug · live+JS | P1 | other local session | used_sessions goes back down on untick | ✅ 3c3ac7d (patch identical to 18139dd) · **0043 applied 2026-11-20** (Idan's OK in the united session). Live check: `trg_increment_used_sessions` is AFTER UPDATE FOR EACH ROW with no WHEN, and its body matches 0043's "+1" branch, so 0043 only adds the give-back |
| R15 | A client can leave a trainer (withdraw consent): delete policy on `trainer_clients` + "Leave trainer" action (B7) | privacy · live+JS | P1 | implementer | client unlinks; trainer loses read access | todo (migration 0041) |
| A9 | Delete-account confirm mentions "messages" (none exist) and doesn't tell a trainer it also wipes app clients' workout history with them and all offline clients' records and photos (B14) | release · JS | P1 | implementer | role-specific `deleteAccountMessage` (he/en) | todo (batch R8+A3+A9) |
| A11 | Minimum age stated nowhere (Play target audience, Apple age rating; clients upload body photos) | decision | P1 | Idan | age in terms consent + Terms; Play target audience | **decided 2026-11-20: 13+** · lead's note: say in the Terms that 13–17 need a parent's or guardian's consent (health data + body photos); Play target audience 13–15, 16–17, 18+ (no under-13, so no Families policy) |
| A12 | Trainers enter non-users' data (offline clients: name, phone, metrics, photos, nutrition) | release · docs | P1 | store-writer | Terms make the trainer responsible for consent; policy + R3 page give non-users an email route; declared in both forms | with R13 |
| A15 | No `ios.privacyManifests` while several pods ship no PrivacyInfo | release · native | P1 | lead | no ITMS-91053 email after the first TestFlight upload | after the first iOS build |
| C3 | Failed cold-start profile read sent users to onboarding (Save overwrote the profile) | bug · JS | P1 | implementer | retry screen; `lib/authRoute.ts` + 7 tests | ✅ af3e6c4 |
| C4 | `getSession()` without catch → endless spinner | bug · JS | P1 | implementer | loading always ends | ✅ af3e6c4 |
| CF1 | cloud/dev 79c3231: Pressables lost their function style under NativeWind (rows stacked, swipe actions blank, "+" lost its circle); gesture-handler 3 swipe direction in RTL | bug · JS | P1 | lead | rows, swipe actions and "+" look right on the phone | ✅ 0e0fc60 + c95b3c4 · smoke test |
| R11 | Gender-neutral Hebrew (16 strings) | release · JS | P1 | lead | values neutral, keys untouched | ✅ 2329434 |
| R10 | nutrition-suggest model id `claude-sonnet-5` | bug | — | — | valid, supported to ≥ 2027-06-30 (B15) | ✅ no change |
| C5, C6 | `.single()` on detail screens shows raw errors on a deleted/bad id; `data!` in handlers | bug · JS | P1 | implementer | `maybeSingle` + notFound; guarded handlers | todo (batch 2) |
| C7, C8 | Mutations without `onError` fail silently offline | bug · JS | P1 | implementer | translated alert on failure | todo (batch 2) |
| C9, C10 | Home and exercises have no error state | bug · JS | P1 | implementer | error row + retry | todo (batch 2) |
| C11, C15, C16 | Raw English Supabase errors in the Hebrew UI | bug · JS | P1 | implementer | one `friendlyError()` everywhere | todo (batch 2) |
| C12 | Not-found screens have no back button (iOS user stuck) | bug · JS | P1 | implementer | back + retry | todo (batch 2) |
| C13, C14 | Blank loading on two detail screens; undefined photo URL | bug · JS | P1 | implementer | spinner; placeholder | todo (batch 2) |
| D17 | 16 KB page-size check on the first AAB | release | P1 | Idan + lead | no Play Console warning | after the first build |
| R13 | Store package (listings, policy drafts, form answers, review notes, screenshots plan). Audit A's data inventory (below) is the source for App Privacy / Data safety; A13 Health apps declaration is RUNBOOK 3.3 | release | P1 | store-writer | Phase 5 files complete | after decisions |
| R14 | RUNBOOK | release | P1 | lead | current at every checkpoint | ✅ parts 0–5 drafted |
| A14 | `LICENSE` is Expo's MIT "© 650 Industries" in a public repo (= I5) | release | P1 | Idan + lead | repo private; LICENSE says "All rights reserved" | **decided 2026-11-20: both** · Idan: GitHub → Settings → Change visibility → Private · lead: replace LICENSE |
| A16–A20 | Sign-in footer links (with R1); Hebrew photo purpose string via `locales`; block READ/WRITE_EXTERNAL_STORAGE (maxSdk 32) after testing Android 10–12; policy mentions the trainer's phone shown to clients and YouTube/Vimeo embeds; review note "payments are manual records, nothing is sold in the app" | release | P2 | — | — | later (A17/A18 are native: ride the next build) |
| B9–B13, B16–B20 | Write-check gaps on 4 policies, client-editable reminder stamps, anon table grants, bucket size/MIME limits, invite-code throttle, SMS number check + timeout, realtime delete ids, CORS/logging, Anthropic key in the app's .env, perf advisors | security/perf | P2 | — | — | later (one hardening migration) |
| C17–C25, D16, D20 | Lint warnings, `ltr()` on times, global error handler, JSON.parse loop, localized display name, `eas project:info` | misc | P2 | — | — | later |

## Resume here (2026-11-20, handover to the united session)
Idan's priority (2026-11-20): **bugs and UI/UX first, deployment after.** So the release work below waits until he reopens it; when he does, start here. Nothing is half-done: the tree was clean at the handover, and every release commit is pushed.
When release work resumes, in this order:
1. Code-only items decided at the checkpoint (no live system touched):
   - I1: app.json `ios.bundleIdentifier` + `android.package` → `com.coachflow.app` (before any build).
   - R12: run `docs/release/icons/make_icons.py` (usage in its header) into `assets/`, set app.json `icon`, `android.adaptiveIcon` (foreground, monochrome, `backgroundColor` `#131416`), the `expo-splash-screen` plugin (image + `backgroundColor` `#131416`), and an `expo-notifications` plugin entry with `icon` + `color`. Read the v58 docs for both plugins first. Expo Go doesn't show the app icon; verify with `npx expo config --type introspect`.
   - A14: LICENSE → "Copyright (c) 2026 IdanRodri17. All rights reserved." (ask Idan if he wants his full name there).
   - Sentry (decision 9): Idan creates a sentry.io account (EU data region) + a React Native project and hands over the DSN; then `npx expo install @sentry/react-native`, its config plugin, init in app/_layout.tsx with `sendDefaultPii: false`, no session replay (screens show health data), user id only, low traces. Check the v58 docs and Expo Go behaviour first.
2. One implementer batch, same files, run sequentially: **R8 + A3 + A9** (nutrition screens, profile delete copy, locales, migration 0042 `ai_reports`). A3's sheet names Anthropic (Claude); the plans are labeled "AI-generated" / "נוצר בעזרת AI", no brand name. Dry-run 0042 like 0040.
3. Live changes Idan OK'd on 2026-11-20 that are **not done yet** (list under "Live changes"): deploy delete-account + verify; the orphan photo sweep (list first; confirm the count with Idan before deleting, it can't be undone); production variables on expo.dev.
4. R1 + R3: store-writer drafts the he/en privacy, terms and deletion pages for GitHub Pages (`coachflow-site`); implementer adds `lib/legal.ts` and the links once Idan has the repo URL and the CoachFlow Gmail.
5. R15 (0041), A10 seed SQL, then batch 2 (C5–C14).
- ~~Ask Idan for the cloud chat's remaining bug list~~ Merged 2026-11-20 into "Now: bugs and UI/UX" at the top.
- ~~0043 (CF2, the group untick fix)~~ Applied 2026-11-20 after a rolled-back dry run (see "Migrations").
- Two local sessions shared this folder on 2026-11-19/20 and handed changes back and forth cleanly. Before editing, check `git status` for files you didn't touch.

## Test data and previews (2026-11-27 night)
- **Fresh start on trainer@coachflow.dev** (Idan's choice, after a rolled-back dry run): deleted all its 94 sessions (app client Idan 92: 26 done, 23 missed from July–October, 43 upcoming to March 2027; offline Idan 2), with their 22 workout logs (21 + 1 own; 15 sets, 1 adjustment) and 382 reminder_log rows (cascade), and Idan's 3 badges; his package is 0 used of 50 at ₪200. Kept: the accounts and links, 4 exercises, 2 templates, 5 weigh-ins, notes, nutrition, check-ins. A copy of everything deleted is in the schema **`backup_20261127`** (no grants to anon/authenticated, not exposed to the API): drop it once Idan no longer needs it (`drop schema backup_20261127 cascade`).
- **Seeded 2026-11-27 night** (Idan: data that tests each feature; 4 offline clients; replace the old test exercises and templates; no SMS reminders for the app client). It ran as one guarded transaction: a final check compared 17 expected counts and would have rolled everything back on any mismatch, and it passed. A script generated it and replayed every set through `lib/pr.ts`, so the PR flags are the app's own. The seed and its generator stay in the session scratchpad, not in the repo. Dates run from 1.10 to 16.12 around "today" = 27.11.
  - **Library:** the 44 standard exercises (0051) replace the 4 old test exercises. 4 templates replace the 2 old ones: רגליים וישבן, פלג גוף עליון, גוף מלא, ליבה וכושר.
  - **App client Idan:**
    - Package 16 at ₪180, raised to ₪200 on 10.11: 9 finished sessions keep ₪180 and 6 are at ₪200. 15 are used, so renewal shows.
    - Sundays 18:00 with the trainer, Wednesdays 07:00 solo. 21.10 and 4.11 were missed; 11.10 is marked done with no log.
    - The group session on Thursday 19.11.
    - 2 extra (own) workouts, 13.11 and 20.11.
    - A swap on 22.11 and a skip on 25.11, with reasons.
    - 4 unpaid; streak 7.
    - Today at 19:00, solo. A weekly series of 6 from 29.11, plus the group on 3.12.
    - 9 weigh-ins (82.4 → 79.7, 3 with measurements), 7 check-ins, 3 private notes. SMS reminders off.
  - **Offline clients** (no phone numbers, so no SMS):

    | client | what it tests | package |
    |---|---|---|
    | offline Idan | 4 trainer-logged Tuesdays, one with a skip | 4/10 at ₪150 |
    | עידן | gone quiet since 3.11 | 3/8 |
    | נועה לוי | two missed Mondays, so at risk | 4/10 at ₪170 |
    | יואב כהן | used up; today 08:00 done and unpaid | 8/8 |
    | מיכל אברהם | 4 unpaid | 8/12 at ₪180 |
    | דני פרץ | missed the 19.11 group; today 17:00 not marked yet | 2/10 |
  - **The views afterwards, as the trainer:**
    - Attention: 3 adjustments, 1 package low, 1 used up, 3 PRs, 3 at risk (נועה for missed sessions; עידן and דני gone quiet).
    - Money: October 16 sessions, ₪2,720; November 28 sessions, ₪4,870, of which ₪1,680 unpaid.
    - 64 sessions (44 done) and 20 workout logs (304 sets, 42 PRs).
    - The 5 older weigh-ins (July and 21.11) and the June check-in were left as they were.
- **Expo Workflows minutes ran out** on the free plan (60/month; reset 2026-12-01 00:00 UTC). The push-triggered preview fails with "Free plan CI/CD … limit reached" until then. With Idan's OK (2026-11-27) previews are published from this computer instead, which uses no CI minutes: `npx eas-cli update --branch cloud/release-1.0 --environment preview --message "…" --non-interactive`.

## Night test (2026-11-27, while Idan slept: "do some tests and fix what is problematic")
Nothing in Idan's data changed: every write ran in a transaction that rolled back, and reads were counts.
- **Logs, last 24 h:** no failed API request (all 1,074 were 2xx/101); every database error came from my own rolled-back dry runs; the edge functions logged no errors (send-sms-reminders runs hourly and sent nothing after the seed: Idan's SMS is off, the offline clients have no phones).
- **Security:**
  - Every view is security_invoker; every table has RLS; every SECURITY DEFINER function pins its search_path.
  - Anon sees 0 rows in all 16 tables it's granted. A signed-in stranger sees 0 everywhere except the public exercise catalog. The app client sees only their own rows: no private notes, no offline clients, no other client's sessions, logs, weigh-ins, check-ins or packages; its 241 sets are exactly its own.
  - The client can read `trainer_monthly_money`, but under RLS it only adds up their own sessions (the app doesn't show it).
  - Advisors: nothing new. Known: the 4 intended SECURITY DEFINER RPCs, `ai_usage` without policies (intended), leaked-password protection (the app uses OTP, no passwords). Performance: Step 2g's 37 policies and now 13 FK indexes (0051's `catalog_slug` FK added one; it's only used if a catalog row is deleted).
- **Data invariants (all 0 violations):**
  - Packages: used = finished sessions for all 7; none negative.
  - Sessions: one owner each; priced and paid only when completed; none completed in the future.
  - Logs: none on unfinished sessions, no duplicates, no owner mismatch; sets use the session's trainer's exercises.
  - Groups share a slot. No archived client has upcoming sessions. Both trainers have the 44 catalog copies.
- **Flows (16, as the client and the trainer, rolled back):**
  - The client finishes today's session (₪200, package 16/16, streak 8; a retry returns the same log).
  - Refused, as they should be: a future session (`workout_not_yet`), moving a trainer-led session, marking paid. Setting a price leaves it unchanged.
  - A solo session done early moves to today (package 17/16: overdrawn, which the card shows as 0 left / used up and the renewal counts against the new package).
  - An extra workout uses no package session and no streak, and its edit saves.
  - The trainer can't reopen a session with sets. Marking an offline client done → package +1, ₪160; undo → back, no price.
  - Paid lowers what's owed by exactly ₪160; a price change leaves earned unchanged.
  - Archiving נועה removed her 1 upcoming session and restoring works (the view keeps archived clients; the app's feed and lists filter them).
  - A deleted catalog exercise comes back once.
  - The trainer edits an offline client's log but not an app client's (`workout_not_found`). A client calling `add_catalog_exercises` gets `trainers_only`.
- **App checks:**
  - Text keys: 1,097 key uses (10 dynamic) all exist in he and en; the two files have the same keys; all 38 plural keys have one/two/other.
  - No masculine imperatives in he.json. No UTC date slicing outside lib/dates.ts; no right-aligned Text.
  - Code review of today's changes (renewal, unpaid list, archive, the workout editor, client Home) found the two bugs fixed above (P26, P27).
- **Left as is, for Idan:**
  - `npm audit`: 8 advisories in the production tree, all in build tooling (xmldom, browserslist, shell-quote, source-map-js, minimatch via the CLI and config plugins). None ships in the app bundle; npm's only "fix" for `expo` is a downgrade to SDK 52. Revisit with `npm audit fix` before the store build.
  - Tomorrow the seeded 27.11 sessions that weren't done (Idan's solo 19:00, דני's 17:00) count as missed, so the client's streak shows 0. That's the rule (a missed session breaks it), not a bug.
  - `exercise_catalog_label` is executable by anon (a pure text lookup, harmless).
  - The backup schema `backup_20261127` is still there.

## What's left (checked 2026-11-27)
Against `docs/COACHFLOW_ROADMAP.md`, `docs/PLAYBOOK_V17plus.md`, `docs/design/PLAYBOOK.md`, `RELEASE_PLAYBOOK.md` and this file. Built: V17 (offline clients' logging), V18/18a/18b/18c, V19's hygiene (CI, tests, lint, query keys, refresh, encrypted session), V23 (series + groups), V25 (`trainer_attention`), V26 (client context), the whole redesign D19–D31, and the bugs/UI rows above.
1. **Bugs and UI/UX still open** (table above): R1 the terms link (blocked on the hosting decision), C17 the 4 old lint warnings, and the native splash colour (with R12). U3, U4, U5, U7 and U8 were done on the evening of 2026-11-27.
2. **Release** (parked until Idan reopens it): "Resume here" steps 1–5 and the release table: bundle id, icon/splash, LICENSE, Sentry; R8 + A3 + A9 (AI label, consent sheet, report: 0042); deploy delete-account + the orphan photo sweep; production variables on expo.dev; legal pages (needs the Gmail + `coachflow-site`); R15 leave a trainer (0041); A10 review seed; the store package; the first Android build → Play closed test (12+ testers for 14 days); iOS once the Apple Developer account exists. Idan's own tasks: S1–S4, the Anthropic spend limit, the RUNBOOK Part 0 items.
3. **Roadmap features not built:** playbook Step 1's development build (needs the Apple account) → V27 push notifications, V20 health-store sync, V21 readiness score, V22 AI training advice; V24 business layer (Hebrew receipt over WhatsApp, revenue per client, CSV for the accountant); V28 volume milestones' app code (cloud/dev; its 0039 is live); Step 2g's performance migration (`(select auth.uid())` in 37 policies, 12 FK indexes).
4. **Ideas, not decided:** workout insights after a session (Idan, "for later"); an "edited" mark on changed workouts for the trainer; a full workout history screen for the client; the client generating their own nutrition plan.
- Idan's deployment lessons (written 2026-11-19, private artifact): https://claude.ai/artifact/EQso9No98gJD2jLQziwbA4

## Decisions (Idan)
Asked at Checkpoint 0+1 on 2026-11-19; answered 2026-11-20.
1. Bundle id / package → **`com.coachflow.app`** (not `com.idan.coachflow`). Permanent after the first upload.
2. Icon: the volt italic "CF" on ink (`docs/release/icons/preview.png`) → **yes**
3. 1.0 free (pilot) → **yes**
4. Legal pages + support email → **GitHub Pages repo `coachflow-site` now, VPS later; a new CoachFlow Gmail**
5. Buy the SMS4Free "CoachFlow" sender before launch → **yes** (also unblocks S1)
6. Supabase Pro before the closed test → **no, stay on free for now.** Known risks: no automatic backups, and the project pauses after a week with no activity. Revisit before real customers depend on it; until then, a manual `supabase db dump` before risky migrations.
7. Repo private + replace Expo's LICENSE → **yes**
8. Israel only for 1.0 → **yes**
9. Sentry before the first store build → **yes**
10. Minimum age → **13+** (recommendation was 18+; see A11 for the guardian-consent note)
11. AI consent (A3) → **name Anthropic in the sheet** ("anthropic is okay"); no Hebrew brand name for the feature
12. Live changes → **yes** (0040 + nutrition-suggest done and verified; the rest under "Live changes")

### Answers (2026-11-27)
- Fixing a finished workout → **edit it in place** (not reopen-and-continue): P16.
- A client's own workout → **start it now** from Home (no planning days ahead); the trainer sees it **on the client card only**; it **doesn't count in the streak** ("they're extra"): P17.
- Renewing a package → **carry what's left over** (and count sessions done beyond it against the new one): U4.
- Taking a client off the list → **archive only** (no delete): U5.
- A price change → **from now on only**: every finished session keeps the price it was done at: U8.
- Own workouts in the at-risk list → **count them** as activity: P18.

### Phone test answers (2026-11-21)
- A workout starts only on its day; trainer and client can open it before then and see the exercises and recommended weights (built: P4).
- Trainer weigh-ins for app clients: **yes** (P5, 0044). Trainer marks an app client's session done: **"with trainer" sessions only** (P6). An upcoming session's exercises change **through the template** (P7), no per-session exercise list.

### Checkpoint 0+1 smoke test (as sent, 2026-11-19; open the `cloud/release-1.0` update in Expo Go)
1. The "+" in the tab bar has its volt circle.
2. מתאמנים: each row shows the name and details side by side.
3. מתאמנים: swipe a row. The actions open from the side you swiped and have colour, and closed rows show nothing behind them.
4. תרגילים and תבניות: rows look right and open.
5. לוח זמנים: swipe a workout row; the actions work.
6. התקדמות: add a weight; the sheet saves.
7. בית: tap an item in the attention feed.
8. מתאמנים ← a client ← תפריט תזונה ← יצירת תפריט: a plan generates as before (the cap isn't live yet).
9. Start a workout and finish it; the buttons on the finish screen respond.
Result so far: step 8 passed on 2026-11-20 (with the cap live; `ai_usage` count = 1). Steps 1–7 and 9 not reported yet.

## Decisions I made (conservative defaults)
- Batch 2 (2026-11-20): mutations use `networkMode: "always"` (queries keep "online"). Paused-while-offline saves looked like a frozen button and the app has no persisted offline queue, so failing fast with "no connection" + retry is the honest option; the workout save is safe to retry (complete_workout, F3). `.single()` stays on detail reads: `screenError()` turns its PGRST116 into the screen's not-found text, which needed no query-shape changes.
- Migration 0039 is v28's `volume_milestones` (the `client_volume` view + 5 `volume_*` badge types). It went live on 2026-11-18 from the cloud session. It's additive, and 1.0 code doesn't read it. This branch carries the same file, byte for byte from cloud/dev, so its migrations match the live DB. v28's app code stays post-launch. R9's `ai_usage` became **0040**, R15's `trainer_clients` policy **0041**, R8's `ai_reports` is planned as **0042**. **0043** is cloud/dev's `uncomplete_returns_session` (18139dd, numbered after the release branch on purpose). **0044** is `trainer_app_weigh_in` (P5, live 2026-11-21), **0045** `reopen_and_not_before_its_day` (P11, live 2026-11-23), **0046** `edit_workout_log` (P16) and **0047** `own_workouts` (P17), **0048** `client_archive` (U5), **0049** `session_price` (U8) and **0050** `risk_counts_own_workouts` (P18), all live 2026-11-27, and **0051** `exercise_catalog` (P23), live the same night. The next free number is **0052**.
- Cherry-picked cloud/dev 79c3231 (the Pressable/swipe fix): it doesn't depend on v28 (the only shared file, progress.tsx, differs by one import line). Its new lint rule flagged `ErrorScreen.tsx`; exempted it (c95b3c4) rather than importing the kit, because the root boundary renders outside every provider and uses a plain object style.
- R9: cap 20 calls per trainer per Asia/Jerusalem day; counted after the request validates and before the Anthropic call, so a failed Anthropic call still counts; the function fails closed (500) if the check errors. `consume_ai_call` is plpgsql: the dry run showed Postgres rejects a data-modifying WITH nested inside `exists()`.
- R8's report goes to an `ai_reports` table rather than a mailto, so it works before the support email exists and needs nothing from the reporter's mail app (pending the batch).
- A3 consent is stored on the device (SecureStore, per user id), so the app doesn't depend on a migration being applied first; the privacy policy carries the durable disclosure.
- The icon candidate's script and preview live in `docs/release/icons/` so they survive a cleared scratchpad.
- eas.json has only a `production` profile (no `expo-dev-client`, and nothing uses a preview build).
- Store builds use the `appVersion` runtime rather than `fingerprint`.
- `.easignore` excludes docs/, .claude/, supabase/ and .github/ from build uploads.
- The error screen uses the palette's hex values and the system font (the root boundary renders outside every provider).
- Photo picking no longer asks for library permission: the system picker doesn't need it, and the app then only sees the photo that was picked.
- Gender-neutral Hebrew went beyond the 11 listed keys to all 16 masculine commands found; noun forms for buttons.
- Ran the four audits during Phase 0 and built the decision-free P0/P1 items before the checkpoint, to save a round trip.
- RUNBOOK recommends GitHub Pages in a separate public repo for the legal pages.

## Migrations to apply, in order
Live: 0001–0040 and 0043–0051. Planned and not applied: 0041, 0042. Next free number: **0052**.
- ✅ **0040 `ai_usage`** (R9), applied 2026-11-20 as `0040_ai_usage`. Dry runs ✓ 2026-11-19 and 2026-11-20 (rolled back): FK rejects unknown ids; calls 1–2 of cap 2 → true, 3–4 → false with the counter staying at 2; a second trainer counted separately; `authenticated` and `anon` denied execute, select and insert; nothing persisted. After the apply: RLS on, service_role can execute, app roles have no privileges, 0 rows. Advisors: one new INFO `rls_enabled_no_policy` on ai_usage (intended); no new WARN.
1. 0041 `trainer_clients` client delete policy (R15) — planned.
2. 0042 `ai_reports` (R8) — planned.
- ✅ **0043 `uncomplete_returns_session`** (CF2, cherry-picked as 3c3ac7d), applied 2026-11-20 as `0043_uncomplete_returns_session` (version 20261120144744). Dry run (rolled back; throwaway trainer, app client and offline client inserted with FK checks off, then updates through RLS and the guard triggers as `authenticated` with each one's JWT sub): tick → 1; paid and notes changes → still 1; untick → 0; re-tick → 1 (not 2); untick after a package reset → stays 0; offline client tick/untick → 1/0; a client completing their own workout → counted; a client unticking → still refused by `prevent_client_reschedule`; app roles can't execute the function. Nothing persisted. After the apply, the live body equals the file; advisors unchanged (no new findings). 0041 and 0042 are still unapplied, so the live DB now skips those two numbers until they land.
- ✅ **0044 `trainer_app_weigh_in`** (P5), applied 2026-11-21 as `0044_trainer_app_weigh_in`. Dry run (rolled back; throwaway trainers, linked and unlinked app clients, an offline client): linked weight + measurements → ok; with a photo → refused; unlinked client → refused; another trainer → refused; trainer update/delete → 0 rows; trainer reads it; offline weigh-ins unchanged; the client edits the trainer's row → ok. Nothing persisted; advisors unchanged.
- ✅ **0051 `exercise_catalog`** (P23), applied 2026-11-27 night (version 20261127165736) after a rolled-back dry run. Checked: the catalog holds 44 rows, has a select policy for signed-in users only, and has no write path. The test trainer got 44 copies with Hebrew names and labels (רגליים). A new trainer signing up in English got 44 ("Barbell back squat", Legs). Calling `add_catalog_exercises` again added 0; after the plank was deleted it added 1 (the plank) and kept the trainer's edits to the other copies. Copying into another trainer's library was blocked by RLS. A client got `trainers_only`, and anon can't execute. The migration seeded every existing trainer. Advisors unchanged (the functions are SECURITY INVOKER; the sign-up trigger's function can't be called directly).
- ✅ **0048 `client_archive`** (U5), **0049 `session_price`** (U8) and **0050 `risk_counts_own_workouts`** (P18), applied 2026-11-27 evening (versions 20261127154036/038/041) after one rolled-back dry run of all three, with fixtures inserted before the migration SQL so the backfill had old sessions to price (throwaway trainers t1/t2, app clients c1/c3/c4 of t1, offline m1). 0049: the backfill priced c1's and m1's finished sessions (100, 80); a price change to 150 left a finished session at 100 and its month at 180 (not 230); neither the trainer nor the client could set a price by hand; completing a session at the new price → 150; an undo cleared it and a redo set it again; c1's package 1 → 2 (one completion counted once). 0048: archiving c1 removed exactly their 2 upcoming sessions (the missed one and the finished ones stayed), restoring cleared it; m1 → 1 removed; the client, another trainer and a bad kind were refused; anon can't execute. 0050: c3, gone quiet, dropped off after an own workout 3 days ago; c4 (two missed) stayed. Live after the apply: the money view's checksum and totals (5,200 earned, 1,200 unpaid) were identical to before; 26/28 finished sessions priced (2 have no package price); advisors unchanged (all new functions SECURITY INVOKER).
- ✅ **0046 `edit_workout_log`** (P16) and **0047 `own_workouts`** (P17), applied 2026-11-27 (versions 20261127144146, 20261127144206) after one rolled-back dry run of both (throwaway trainers t1/t2, app client c1 linked to t1, unlinked c2, offline m1). 0046: c1 edits their log → 4 sets, the skip of an exercise that now has sets removed, the swap kept, effort/note saved, a later set's PR flag corrected; c1 can't edit c2's log nor flip its PR; t1 can't edit an app client's log (`workout_not_found`) but edits m1's; t2 can't; anon can't execute. 0047: c1 saves an own workout (no session, logged_by c1) and a retry writes nothing; c2 can't see it or reuse its id; t1 reads it with its sets and skips but can't write them or call `log_own_workout` (`own_workout_clients_only`); t2 sees nothing; an offline log without a session breaks the new check. Unmoved by both: c1's package (2 → 3 only from the scheduled workout completed in the same run), m1's package, c1's streak (3), t1's month (4 sessions); `client_volume` counts the own workout. Nothing persisted; advisors unchanged (both functions SECURITY INVOKER).
- ✅ **0045 `reopen_and_not_before_its_day`** (P11), applied 2026-11-23. Dry run (rolled back; throwaway trainer, other trainer, app client, package at 3): completing tomorrow refused for the client (update and complete_workout) and the trainer (`workout_not_yet`); today completes; reopen of an empty log → reopened, log gone; of a log with a set → `workout_has_sets`, untouched; of a no-log session → reopened; the client or another trainer → `workout_not_found`; anon can't execute; package 3 + 1 − 2 = 2. Nothing persisted. Advisors: one new WARN, `reopen_workout` is SECURITY DEFINER callable by authenticated — intended (the app calls it; the trainer check comes first), same as accept_invite.

## Live changes (OK'd by Idan 2026-11-20, decision 12)
1. ✅ Apply 0040, then deploy `nutrition-suggest`: done 2026-11-20 and verified (one plan from the app; `ai_usage` count = 1).
2. Not done yet: deploy `delete-account` (9c5eed1) through the Supabase connector, then verify with a throwaway test account.
3. Not done yet: one-off sweep of orphaned photo folders (list folder names and object counts only; show Idan the count and get a yes before deleting, since it can't be undone; Supabase may block direct deletes from `storage.objects`, so delete through the Storage API or the dashboard).
4. Not done yet: R7b, add the production environment variables on expo.dev with `eas env:create` from this computer (Supabase URL, anon key, `APP_VARIANT=production`).

## Idan's manual tasks
- **Today, security:** remove his own number from Auth → Phone → test numbers (S1); confirm the Email provider is off and rotate the two dev passwords (S2); delete `send-trainer-digest` and `send-reminders` in Edge Functions (S3).
- Set a monthly spend limit in the Anthropic console (R9's second half).
- From the checkpoint answers: make the GitHub repo private (A14); create the CoachFlow Gmail and the public `coachflow-site` repo with Pages on (decision 4, RUNBOOK 0.4–0.5); buy the SMS4Free "CoachFlow" sender (decision 5); create the sentry.io account (EU region) and send the DSN (decision 9).
- Report the rest of the Checkpoint 0+1 smoke test (steps 1–7 and 9).
- RUNBOOK Part 0: Play account type/date, 15–20 Android testers, Apple Developer enrollment, support email.
- RUNBOOK 1.1–1.3 before the first store build.

## Store data inventory (audit A, 2026-11-19; source for R13's App Privacy and Data safety answers)
Not used for tracking or ads. Supabase, SMS4Free, Anthropic and Expo are service providers. Encrypted in transit; deletion in the app (web path = R3). No analytics, crash or ads SDK; no push tokens (local notifications only); no location or contacts.
| data (store category) | purpose | processor | linked | optional |
|---|---|---|---|---|
| Phone number (Contact info) | OTP sign-in, SMS reminders, trainer WhatsApp | Supabase Auth, SMS4Free | yes | required |
| Name, business name (Name) | app functionality, share card | Supabase | yes | name required |
| User ID | auth | Supabase | yes | required |
| Workouts: sets, reps, weights, effort, duration, notes, skip/swap reasons (Fitness) | core | Supabase | yes | required for use |
| Weight, waist/chest (Health) | progress | Supabase | yes | optional |
| Intake: goals, injuries, equipment, experience (Health) | plan building | Supabase | yes | optional |
| Weekly check-in: sleep, energy, soreness, adherence (Health) | progress | Supabase | yes | optional |
| Progress photos (Photos) | progress | Supabase Storage (private, signed URLs) | yes | optional |
| Nutrition targets, diet preferences, possibly allergies (Health) | AI plan | Supabase (linked); Anthropic (no name or id sent) | yes / no | optional |
| AI plan text (Other content) | shown to trainer + client | Supabase; generated by Anthropic | yes | optional |
| Packages, price, paid flags (Financial → other) | trainer bookkeeping | Supabase | yes | optional |
| Offline clients' data entered by trainers; client contact phones | client management, reminders | Supabase; SMS4Free | yes | optional |
| Trainer notes about clients (Other user content) | coaching | Supabase | yes | optional |
| Consent timestamps, locale, reminder opt-out (App activity) | compliance, settings | Supabase | yes | required |
| Install id (EAS-Client-ID), platform/runtime headers; IP in auth logs (Device ids / Diagnostics) | OTA delivery, auth security | Expo, Supabase | no | required |
Also: YouTube/Vimeo embeds (trainer demo videos) load third-party players that see IP and device; say so in the policy.

## Facts gathered (2026-11-19)
- Supabase org plan: **free** (no backups; can pause when idle). Region **eu-central-1** (Frankfurt).
- All 18 public tables have RLS; all 8 views are `security_invoker`; the `progress-photos` bucket is private with correct folder policies (B).
- No FK is RESTRICT, so deleting any user succeeds. A trainer's deletion also removes the history app clients logged with that trainer; a client's deletion removes the trainer's packages, payments and notes for that client. `client_invites` keeps the trainer-typed label and price (B14). The privacy policy and terms must say so.
- EAS CLI 27.4 is installed and logged in as `idanrodri` on Idan's computer.
- Live `trainer_clients` policies: client_read, trainer_delete, trainer_read, trainer_update (no client delete yet → R15).
- Security advisors (2026-11-20): WARN authenticated can execute SECURITY DEFINER `accept_invite`, `create_invite`, `my_trainer` (intended: app RPCs; review in the P2 hardening migration); WARN leaked-password protection off (email/password sign-in is off, so it matters little).
- Audit A could not verify (needs a real build): the Gradle-merged manifest and targetSdk 36 (`bundletool dump manifest` on the first AAB), and the real Info.plist's `NSAllowsArbitraryLoads` (introspection shows the fallback template's `true`).

## Post-launch (moved out of scope)
- V28 volume milestones app code (cloud/dev caf978c; its migration 0039 is already live)
- V24 revenue per client, CSV export, Hebrew receipt over WhatsApp
- DB performance migration: `(select auth.uid())` in 37 policies, FK indexes (B20)
- Share card "שמירה בגלריה"; "רישום האימון" on Home's next-up card; share card opt-in deltas + bigger trainer icon
- Separate dev/prod Supabase projects; Auth CAPTCHA
- ~~Idea (Idan, 2026-11-21): a client logs workouts of their own~~ Built 2026-11-27 at Idan's request (P17).
- Idea (Idan, 2026-11-27): insights after a workout. "Maybe for later."
- Idea (Idan, 2026-11-21): maybe move AI nutrition-plan generation to the client. Undecided.
