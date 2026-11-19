# CoachFlow 1.0 — backlog

Built 2026-11-19 by the lead (Opus 5.5) from: the cloud-session brief (2026-11-04), the roadmap's V19/V19d release track, the kit's verified facts (RELEASE_PLAYBOOK §2), and the live DB (migrations 0001–0038 applied, 0039 not).
Format: `- [ ] id · title · type · files · done when`. Audit findings get their own ids (A*, B*, C*, D*) in STATUS.md.

## Release (store requirements)
- [ ] R1 · Privacy policy + terms, linked in the app · release · app/(auth)/onboarding.tsx, app/(tabs)/profile.tsx, lib/locales/*.json · both links open the hosted pages (he/en); the onboarding "terms" text is a link
- [ ] R2 · Account deletion removes everything · release · supabase/functions/delete-account, maybe a migration · deleting a test trainer and a test client leaves no rows, no progress-photos objects (own and managed clients'), no invites or links; a trainer's clients keep working
- [ ] R3 · Web account-deletion page (Google Play) · release · hosted page · a public URL explains how to delete in the app and by email, what's deleted, and what's kept
- [ ] R4 · Photo permissions: system picker, no READ_MEDIA_* on Android, a specific iOS purpose string · release · app.json · the merged Android manifest has no READ_MEDIA_IMAGES/VIDEO; Info.plist has a Hebrew/English NSPhotoLibraryUsageDescription
- [ ] R5 · App Review sign-in without SMS · release · Supabase Auth test phone (Idan), docs/release/store/review-notes.md · a reviewer signs in with a fixed Israeli test number + OTP and can see both the trainer and client sides
- [ ] R6 · Root error boundary · release · app/_layout.tsx · a thrown render error shows a translated "something went wrong / retry" screen, not a white screen
- [ ] R7 · eas.json, runtimeVersion split, production build workflow · release · eas.json, app.config.ts, .eas/workflows/ · Expo Go previews keep working; a production AAB builds on Idan's manual trigger with its own runtime
- [ ] R8 · AI disclosure + in-app "report this plan" · release · nutrition screens, lib/locales · every generated plan is labeled as AI-generated and has a report action (Play AI-Generated Content policy)
- [ ] R9 · nutrition-suggest per-user daily cap · release · supabase/functions/nutrition-suggest, migration · more than N plans a day per trainer gets a clear error; no unbounded Anthropic cost
- [ ] R10 · nutrition-suggest model id · bug · supabase/functions/nutrition-suggest/index.ts · the id is valid per Anthropic's models page
- [ ] R11 · Gender-neutral Hebrew in 11 keys · release · lib/locales/he.json · common.save, signIn.invalidPhone, signIn.invalidCode, signIn.sendFailed, signIn.tooManyAttempts, templates.list.emptyHint, templates.form.addAtLeastOneExercise, templates.form.noExercisesInLibrary, templates.detail.delete, templates.detail.saveChanges, templates.detail.deleteTemplate use neutral forms (values only, no reordering)
- [ ] R12 · Final app icon, adaptive icon and splash · release · assets/, app.json · no Expo template art; iOS icon 1024×1024 without alpha
- [ ] R13 · Store package · release · docs/release/store/ · listings, privacy policy/terms drafts, App Privacy + Data safety + rating answers, review notes, screenshots plan (playbook Phase 5)
- [ ] R14 · RUNBOOK for Idan · release · docs/release/RUNBOOK.md · step-by-step: build, Play Console, first upload, forms, closed test, TestFlight, submission

## Idan's decisions / tasks (not code)
- [ ] I1 · Confirm `com.idan.coachflow` as the permanent bundle id / package
- [ ] I2 · Hosting for privacy/terms/deletion pages + support email
- [ ] I3 · SMS4Free "CoachFlow" sender (decided 2026-09-30) and removing the test code for his own number
- [ ] I4 · Supabase Pro (backups, no pausing) before real customers
- [ ] I5 · LICENSE (still Expo's MIT text) and the public repo
- [ ] I6 · Sentry crash reporting before the first store build (native module)
- [ ] I7 · Recruit 12 Android testers; Play Console app + closed test
- [ ] I8 · Apple Developer Program enrollment ($99/year)

## Bugs and unfinished work from the cloud chat
*(Not visible from the local session. Idan pastes the cloud chat's list here; each line gets a B-id.)*

## Out of 1.0 (post-launch), from the cloud brief
- V28 volume milestones app code (cloud/dev caf978c; its migration 0039 went live 2026-11-18)
- V24 revenue per client, CSV export for the accountant, Hebrew receipt over WhatsApp
- DB cleanup migration: 37 RLS policies to `(select auth.uid())`, indexes on unindexed FKs
- Share card "שמירה בגלריה" (expo-media-library; adds a photo-write permission)
- "רישום האימון" button on Home's next-up card for offline clients; share card opt-in weight/waist deltas + bigger trainer icon
- Separate dev/prod Supabase projects
