# CoachFlow 1.0 — release playbook (Google Play + App Store)

Written 2026-11-11 from the repo state at `main` a6d570e (2026-11-06) and `cloud/dev` caf978c (2026-11-07).
Facts in §2 re-verified 2026-11-19 against `main` a6d570e and the live Supabase project.

**Lead session:** Opus 5.5 since 2026-11-19, because Fable's Pro allowance ended 2026-11-16. If Fable is available again, it can take the lead. Any later session (Opus or Sonnet) continues from `docs/release/STATUS.md`.

Read this file first, then `CLAUDE.md`, `docs/release/BACKLOG.md`, and `docs/release/STATUS.md`. Don't read anything else until a phase step tells you to.

---

## 0. Ground rules for the release (these override parts of CLAUDE.md)

**Goal:** CoachFlow 1.0 live on Google Play and the App Store, for Israeli trainers and their clients.

**The scope is frozen.** In scope: the items in `docs/release/BACKLOG.md`, plus P0/P1 findings from the Phase 1 audit. Everything else (new features, refactors, "while I'm here" changes) goes to the "Post-launch" section of STATUS.md as a one-line entry, and doesn't get built.

**Branch:** `cloud/release-1.0`, created from `main` a6d570e. The name matters. `.eas/workflows/publish-preview-update.yml` publishes an EAS Update for every push to `cloud/**`, so each push reaches Idan's iPhone through Expo Go. Never push to `main`. Idan merges at the end.

**This replaces "one Vn step per session" and "1–2 files per step".** Work in batches. A batch is a set of related items, and it ends at a checkpoint (§4). When a small decision comes up inside a batch, take the conservative option, log it in STATUS.md under "Decisions I made", and keep going. Save real questions for the next checkpoint instead of stopping.

**Still in force from CLAUDE.md:**
- SQL migrations are surgical and add nullable or defaulted columns. Each one is a new file; never edit a migration that has been applied. 0039 is v28's `volume_milestones` (live since 2026-11-18; 1.0 doesn't read it), 0040 is `ai_usage` (R9), 0041 is the `trainer_clients` delete policy (R15). The next free number is **0042**.
- Every view uses `with (security_invoker = true)` and has explicit grants.
- Dates go through `lib/dates.ts` only (Asia/Jerusalem).
- RTL-first. Text uses `text-left` for the start edge; TextInput uses `directionalTextClassName()`.
- UI strings go in `lib/locales/he.json` and `en.json`. Gender-neutral Hebrew.
- Numbers are deterministic.
- `lib/database.types.ts` is hand-maintained: edit it to match each migration.
- Conventional commits: `fix(release): …`, `feat(release): …`, `chore(release): …`, `docs(release): …`. **No `Co-Authored-By` trailer.** Stage files by name, never `git add -A`.

**Commits:** you commit and push at checkpoints, once `npm run typecheck && npm run lint && npm test` pass locally (plus `npx expo export --platform ios` when app code changed). Idan smoke-tests the pushed preview update after the push. This differs from the normal V-steps in CLAUDE.md, where he tests before the commit.

**Don't touch live systems without Idan's OK.** Don't change Supabase Auth, secrets or Storage settings, run `eas build` or `eas submit`, or touch Play Console or App Store Connect. Write the SQL, the config and step-by-step instructions instead. Migrations: Idan has OK'd applying them through the Supabase MCP from his computer, after a rolled-back dry run with role impersonation; ask at the checkpoint before applying any. Cloud sessions never apply migrations. Read-only Supabase use (list tables and migrations, advisors, catalog SELECTs) is always fine. **Never SELECT rows from user tables: the live DB holds real people's health data.**

**Some docs aren't in git.** CLAUDE.md mentions `docs/COACHFLOW_ROADMAP.md`, `docs/PLAYBOOK_V17plus.md` and `docs/design/*`. They exist only on Idan's computer; never commit them. Cloud sessions: don't look for them. `docs/SRS.md` is the product spec. `docs/DEPLOYMENT.md` (June 2026) is background reading, and where it disagrees with this playbook, the playbook is right.

---

## 1. How to spend the usage budget

The lead does the thinking, and subagents do the reading and writing.

| Work | Who | Model |
|---|---|---|
| Plan, prioritize, decide, review diffs, debug what a subagent couldn't solve | lead (you) | Opus (or Fable) |
| "Where is X", "list Y", "what's the value of Z" | `scout` | Haiku |
| Read-only deep reviews (store compliance, security) | `auditor` | Opus |
| One backlog or audit item: code, test and checks | `implementer` | Sonnet |
| Store copy, privacy policy, terms, form answers, review notes | `store-writer` | Sonnet |

- The subagent definitions are in `.claude/agents/` (they load when a session starts). `CLAUDE_CODE_SUBAGENT_MODEL=sonnet` (set in `.claude/settings.json`) is the fallback for any other subagent. **Never spawn a subagent on Fable.** When you call a subagent ad hoc, pass the model explicitly.
- For the robustness and build-config audits (Phase 1 C and D), use `model: sonnet`.
- Give each subagent a tight brief: the item, the acceptance criterion, the files to read, and what to return. Ask for summaries of 30 lines or fewer, never file dumps.
- Review implementer work through `git diff --stat` and the diffs of the touched files. Don't re-read whole files.
- Run items in parallel only when they're independent. Implementers that might touch the same files run one after another. Parallel implementers run with worktree isolation, and you merge their work.
- **State lives in files, not in the chat.** Update `docs/release/STATUS.md` at every checkpoint. If the session is cleared or the model changes, the next session must be able to continue from STATUS.md alone.

---

## 2. Known facts (verified 2026-11-19; trust them unless the code says otherwise)

**Stack:** Expo SDK 58 (RN 0.88.1, React 19.3), Expo Router, NativeWind 4 + Tailwind 3, TanStack Query, i18next (he/en), Supabase (project ref `cybvavqwbvfctbfevzha`).
- Edge functions: `send-sms-hook`, `send-reminders`, `send-sms-reminders`, `send-trainer-digest`, `delete-account`, `nutrition-suggest`.
- Migrations 0001–0038 are on `main` **and applied to the live DB**. `0039_volume_milestones.sql` (feature v28) was applied on 2026-11-18. It's additive (a view and a wider badge-type check), and this branch carries the same file. v28's app code stays on `cloud/dev`, out of 1.0.

**Login:** phone OTP only (`AUTH_MODE = "sms"` in `lib/auth.tsx`; `lib/devAuth.ts` is gone).
- Only Israeli `05X` numbers are accepted (`toE164IL`).
- SMS4Free sends the codes, through the Supabase Auth "Send SMS" hook.
- On SMS4Free's free tier, the codes come from the account owner's own mobile number, and codes sent to that same number never arrive. Buying the "CoachFlow" sender was decided on 2026-09-30 (still to confirm).
- Idan's real trainer data is on the account `trainer@coachflow.dev` (phone-linked). Never delete it.

**CI/CD:**
- GitHub Actions runs typecheck, lint and vitest on every push.
- An EAS Workflow publishes a preview update for each branch (`main`, `cloud/**`, `handoff/**`) with runtime `exposdk:58.0.0`, for Expo Go.
- EAS project id `dad06d81-16b5-4bf1-ba4c-138a1f38ca82`, owner `idanrodri`.

**app.json:**
- Name CoachFlow, version 1.0.0, `userInterfaceStyle: light`, scheme `coachflow`.
- `ios.bundleIdentifier` and `android.package` are `com.idan.coachflow`. They become permanent with the first store upload, so confirm them first.
- `supportsTablet: false`, `runtimeVersion.policy: "sdkVersion"`.
- The plugins list has no config for `expo-image-picker` or `expo-notifications` (both are dependencies).
- `.gitignore` already ignores `/android` and `/ios`.
- **There's no `eas.json` and no development build, and no store build has ever been made.**

**What the app does today:**
- **Account deletion:** Profile → `delete-account` edge function → `auth.admin.deleteUser`. Removing the data relies on FK cascades. Cascades don't delete Storage objects, and nobody has checked the trainer↔client links.
- **Progress data:** weight, waist and chest measurements, and optional private photos. The photos live in the private Storage bucket `progress-photos` under `<client_id>/…` (or `<managed_client_id>/…` for offline clients) and are shown through signed URLs.
- **Onboarding:** there are "terms" and "health disclaimer" checkboxes, but the terms text isn't a link. **There's no privacy policy or terms page anywhere.**
- **Permissions:** the image picker uses the media library only (base64, no camera). Notifications are local only (`lib/restAlerts.ts`).
- **nutrition-suggest:** sends calorie and macro targets, plus free-text dietary preferences (which may include allergies), to the Anthropic API with model id `"claude-sonnet-5"`. It verifies the JWT and is for trainers only. **It has no per-user rate limit.**
- No error boundary and no crash reporting.
- `LICENSE` is still Expo's MIT text (© 650 Industries), and the repo is public.

**Store rules that shape the plan:**
- **Google Play, general:**
  - New apps must target API 36 (required since 2026-08-31).
  - Builds are AAB. You need a Data safety form and a content rating.
  - The privacy policy goes in the listing **and inside the app**.
  - Account deletion must be possible in the app **and** through a web link.
  - Photo & Video Permissions policy: an app that uses photos only occasionally must use the system photo picker and must not declare `READ_MEDIA_IMAGES` or `READ_MEDIA_VIDEO`.
  - AI-generated content policy: apps that generate content with AI need a way to report or flag it from inside the app.
  - `eas submit` can create a new app's first release (on the internal testing track by default) once a Google Service Account key has been uploaded to EAS. A manual first upload in Play Console works too.
- **Google Play, personal accounts created after 2023-11-13:**
  - Every new app needs a closed test with at least 12 testers, opted in for 14 continuous days, before it can apply for production.
  - Uploading new builds during the test doesn't reset the clock. Pausing the track does.
  - So the first compliant Android build should reach closed testing **as early as possible**, and fixes keep shipping during the 14 days. Idan confirms whether this applies to his account.
- **Apple:**
  - Account deletion in the app.
  - A privacy policy link both in the app and in App Store Connect.
  - A specific purpose string for every permission.
  - The reviewer has to be able to sign in without receiving an SMS. That means a test phone number with a fixed OTP, set up in Supabase Auth and written in the review notes. It must be in Israeli format, because the app rejects other numbers.
  - There's no third-party login, so Sign in with Apple isn't required.
  - The App Privacy answers must match the code and the Play Data safety form.
- **Both stores:**
  - Declare the processors: Supabase (database, auth, storage), SMS4Free (SMS), Anthropic (AI nutrition plans), Expo (updates).
  - Declare the fitness and health data as such: weight, measurements, nutrition and preferences, workouts, progress photos.
  - Release in Israel only. It's the simplest start, since login works only with Israeli numbers.

---

## 3. Phases

### Phase 0 — Orient (lead + scout; keep it cheap)
1. Check out `cloud/release-1.0`.
2. Run `npm ci`, then typecheck, lint and test, and record the baseline in STATUS.md.
3. Turn `docs/release/BACKLOG.md` into the STATUS.md table (template in §6), with these columns: id, item, type (bug/feature/release), priority, owner (agent or Idan), acceptance criterion. P0 = blocks store submission or leaks data. P1 = needed before the public launch. P2 = after launch.

→ **Checkpoint 0:** send the table, the baseline and the decisions Idan needs to make (§5).

### Phase 1 — Release audit (4 `auditor` runs in parallel, read-only)
Each run returns a findings table: id · P0/P1/P2 · file:line · problem · fix in 1–2 lines. At most 25 rows, most severe first.

**A. Store compliance (Opus).** Check everything in §2 "Store rules that shape the plan" against the code:
- privacy and terms links (onboarding and Profile);
- deletion, both in the app and through a web path;
- permission purpose strings;
- the photo picker and photo permissions in the final Android manifest (app config plus each native library's own manifest);
- the reviewer's way to sign in;
- the data inventory behind the App Privacy and Data safety answers (grep what is collected and where it's sent);
- AI-generated content (nutrition plans): a disclosure, and a way to report a bad plan from inside the app.

Use `npx expo config --type introspect` and the libraries' `android/src/main/AndroidManifest.xml` files. If you prebuild, do it in a temporary copy of the repo and delete it afterwards. Never leave `android/` or `ios/` in the working tree.

**B. Supabase security and data (Opus):**
- RLS on every table;
- every view is security-invoker and has explicit grants;
- Storage buckets and their policies;
- how each edge function authenticates: JWT, webhook signature, any use of `--no-verify-jwt`;
- the service-role key is used only on the server;
- `delete-account` removes everything a user owns: rows, the `progress-photos/<id>/` objects, invites and links. Check what happens to a deleted trainer's clients;
- rate limits: nutrition-suggest cost, SMS pumping;
- whether `"claude-sonnet-5"` is still a valid model id.

**C. App robustness (`model: sonnet`):**
- crash paths and a root error boundary;
- offline and slow-network behavior;
- loading, empty and error states;
- keys missing between `he.json` and `en.json`;
- RTL glitches and hard-coded strings;
- the iPhone layout still holds in iPad compatibility mode.

**D. Build config (`model: sonnet`):**
- the `eas.json` profiles (development, preview, production);
- a runtimeVersion strategy that keeps the Expo Go preview flow for Idan's iPhone **and** gives store builds their own runtime;
- target SDK 36 and 16 KB page-size support;
- rules for version, buildNumber and versionCode;
- `ios.config.usesNonExemptEncryption: false`;
- the icon, adaptive icon and splash specs.

→ Merge the findings into STATUS.md, remove duplicates and re-prioritize.
→ **Checkpoint 1:** the P0/P1 list for Idan to approve.

### Phase 2 — Store-blocking fixes and the first Android build (fast track)
Goal: the earliest build Google will accept into closed testing.
1. The P0 compliance items, one `implementer` run each:
   - privacy policy and terms links (in-app pages or hosted URLs, per the §5 decision);
   - permissions and the photo picker;
   - complete deletion, plus the web deletion path;
   - the reviewer test-number path, documented;
   - a root error boundary.
2. `eas.json`, the runtimeVersion strategy, and an EAS Workflow that builds a production Android AAB when Idan triggers it (a manual trigger or a tag). No Expo token is ever stored in a session.
3. `docs/release/RUNBOOK.md`, with Idan's exact steps:
   1. trigger the build;
   2. create the app in Play Console;
   3. get the first AAB in: either a one-time Google Service Account key in EAS and then `eas submit` from a workflow, or a manual upload;
   4. fill in Data safety, content rating and app access (the reviewer credentials), using the drafted answers;
   5. create the closed-testing track and invite the testers.

→ **Checkpoint 2:** Idan smoke-tests, then starts the closed test.

### Phase 3 — Backlog and P1 items (in batches, while the closed test runs)
- Order: P0/P1 bugs, then the BACKLOG features Idan kept, then P1 robustness and security.
- For each item: an `implementer` run with its acceptance criterion, then you review the diff, then you commit. Every logic change gets a vitest test.
- Testers get JS-only fixes through EAS Update on the store build's channel. Native changes need a new build. Record which is which in STATUS.md.
- Each batch ends with a push, a preview update and a **checkpoint**. Idan gets a smoke-test list of at most 10 steps, written as Hebrew UI paths ("פרופיל ← מחיקת חשבון ← …").

### Phase 4 — iOS (once Idan's Apple Developer account is active)
Build iOS for production, send the build to TestFlight (Idan and the trainer), fix what they find, then prepare the App Store Connect package from Phase 5.

### Phase 5 — Store package (`store-writer`)
Write these into `docs/release/store/`:
- `listing-he.md` and `listing-en.md`: name, subtitle or short description, full description, keywords and promotional text, each within the store's limits.
- `privacy-policy-he.md`/`-en.md` and `terms-he.md`/`-en.md`, plus one static HTML page per language, ready to host. These are drafts, and Idan has them reviewed.
- `app-privacy-answers.md` (App Store Connect), `data-safety-answers.md` (Play), `content-rating-answers.md` and `age-rating-answers.md`. Every claim must trace back to the code.
- `review-notes.md`: placeholders for the test phone number and OTP, a demo trainer and a demo client, and a 5-step walkthrough of both sides.
- `screenshots-plan.md`: 6 screens per platform, with the data state for each and Hebrew captions. Idan captures them on a device.

→ **Final checkpoint:** every P0/P1 item is done, the store package is complete, and the RUNBOOK is current. Idan submits.

---

## 4. Checkpoints: handing over to Idan
Idan often reads on his phone. At each checkpoint, write to him briefly, in the language he last wrote in:
1. What's done, one line per item.
2. A smoke test of at most 10 numbered steps, done in the preview update.
3. The decisions he needs to make, numbered, each with your recommendation, so he can reply "1 yes, 2 no".
4. The manual tasks that are now unblocked for him.

Then stop and wait for his reply.

## 5. Decisions only Idan makes (record the answers in STATUS.md)
1. Is the bundle id / package `com.idan.coachflow` final? It becomes permanent with the first upload.
2. ~~Does `cloud/dev` (v28 and migration 0039) go into 1.0?~~ Answered: v28's app code is post-launch. Its migration 0039 went live on 2026-11-18 (additive; 1.0 doesn't read it).
3. Is 1.0 free (a pilot) or paid? Charging trainers inside the app brings in Apple's in-app purchase rules, so the simplest 1.0 is free.
4. Where are the privacy policy, terms and web deletion page hosted (GitHub Pages, his VPS, or another site), and what's the support email?
5. SMS: buy the "CoachFlow" sender before launch (decided 2026-09-30), or stay on the free tier?
6. Supabase plan: free projects pause after a period of inactivity and have no backups. Move to Pro before real customers?
7. `LICENSE` and the public repo: fix before launch?
8. Countries: Israel only for 1.0?
9. Crash reporting (Sentry, parked 2026-10-10): add it before the first store build? It's a native module, so adding it later means another build.

## 6. STATUS.md template
```
# Release 1.0 — status (updated YYYY-MM-DD HH:MM by <model>)
Phase: … · Next checkpoint: … · Branch head: <sha>
Baseline: typecheck ✓/✗ · lint ✓/✗ · tests n/n

| id | item | type | P | owner | done when | state |
|----|------|------|---|-------|-----------|-------|

## Decisions (Idan)
## Decisions I made (conservative defaults)
## Migrations to apply, in order
## Idan's manual tasks
## Post-launch (moved out of scope)
```

## 7. Definition of done
- Every P0/P1 row is done, or Idan explicitly moved it out of scope.
- CI is green on `cloud/release-1.0`. Idan has smoke-tested the final build on Android (closed test) and on iOS (TestFlight).
- The store package and the RUNBOOK are complete, and no store form answer contradicts the code.
- Idan has merged to `main` and tagged `v1.0.0`.
