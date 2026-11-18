# CoachFlow 1.0 — RUNBOOK (Idan's steps)

Everything here is done by Idan, in a browser or with one command. The lead session keeps this file current.
Times are typical, not promises. Store rules: see RELEASE_PLAYBOOK §2.

---

## Part 0 — Start today (no build needed)

These take the longest to come back, so they run while the code is being fixed.

### 0.1 Google Play: check which rules apply to your account
1. Open https://play.google.com/console → **Settings** (left) → **Developer account** → **Account details**.
2. Note the **account type** (Personal / Organization) and the **date it was created**.
   - Personal and created after 13 Nov 2023 → the **closed test rule** applies: at least **12 testers opted in for 14 days in a row** before you can apply for production. Plan for it (0.2).
   - Organization → no testing rule; you can go to production after review.
3. If the console asks you to verify your identity, a phone number, or access to an Android device, finish that now. Device verification needs any Android phone with the **Google Play Console** app installed (borrow one if needed).

### 0.2 Recruit Android testers (only if the closed-test rule applies)
- Aim for **15–20 people**, not 12: if someone opts out during the 14 days, the count drops below 12 and the clock stops counting toward the requirement.
- Each tester needs an **Android phone** and the **Google account (Gmail) they use in the Play Store**.
- Collect the Gmail addresses in one list. The trainer, his clients, family and friends are fine.
- Tell them now: "In a few days you'll get a link. Tap it, choose *Become a tester*, install CoachFlow from the Play Store, and keep it installed for at least two weeks. Open it once in a while."

### 0.3 Apple Developer Program
1. https://developer.apple.com/programs/enroll → sign in with your Apple ID (two-factor authentication must be on).
2. Enroll as an **Individual**. Your legal name is shown as the seller on the App Store. (An Organization needs a registered company and a D-U-N-S number, so it takes longer.)
3. Pay **$99/year**. Approval usually takes 1–2 days; Apple may ask for ID through the Apple Developer app.
4. Nothing else is needed on the Apple side until the iOS build (Part 4).

### 0.4 A public support email
Both stores show a contact email publicly, and the privacy policy needs one. A dedicated address (for example a new Gmail for CoachFlow) keeps your personal inbox off the store page.

### 0.5 Where the privacy policy, terms and deletion page will live
Both stores need public URLs. The lead recommends **GitHub Pages in a separate small public repo** (for example `coachflow-site`): free, HTTPS, about 10 minutes, and it stays public even if the main repo goes private later. Your VPS can replace it any time; only the URLs in the app and the store forms would change.
Steps (once the lead has written the HTML pages):
1. https://github.com/new → name `coachflow-site` → Public → Create.
2. Upload the HTML files from `docs/release/store/site/` (Add file → Upload files) → Commit.
3. **Settings** → **Pages** → Source: *Deploy from a branch* → Branch `main`, folder `/ (root)` → Save.
4. After a minute the pages are at `https://<your-github-user>.github.io/coachflow-site/…`. Send the URLs to the lead.

---

## Part 1 — Backend and accounts for the store build

### 1.1 Production environment on expo.dev (needed before the first store build)
Today only the `preview` environment holds the Supabase URL and anon key. A store build reads the `production` environment, and without the keys the app would have no backend.
- expo.dev → project **coachflow** → **Environment variables**:
  1. Open `EXPO_PUBLIC_SUPABASE_URL` → tick **production** as well → Save. Same for `EXPO_PUBLIC_SUPABASE_ANON_KEY`. (Both are public values: they ship inside the app anyway.)
  2. **Add variable** → name `APP_VARIANT`, value `production`, environment **production** only, visibility *Plain text*.
- Never add the `service_role` key or the Anthropic key here.
- *The lead can do this from this computer (`eas env:…`), since you're logged in to EAS here. Just say so.*

### 1.2 Test phone numbers for App Review
Apple's reviewer (and Google's, for "App access") can't receive your SMS. Supabase test numbers sign in with a fixed code and send no SMS.
1. Supabase → **Authentication** → **Sign In / Providers** → **Phone** → **Test Phone Numbers and OTPs**.
2. Add two numbers (the app accepts only Israeli 05X numbers; write them without "+"):
   `972500000101=<6-digit code>,972500000102=<6-digit code>`. Pick codes that aren't 123456.
3. **Test OTPs Valid Until**: about 3 months from today. Renew it before every App Store review, because Apple re-reviews each update.
4. **Security:** anyone who knows a test number and its code can sign in as that user. So:
   - These two numbers only ever hold demo data.
   - **Remove your own number from this list** as soon as the paid SMS sender works. Today it gives anyone who knows your number and the code access to your real trainer account.

### 1.3 Demo data the reviewer will see
Sign in with 972500000101 as a trainer ("מאמן לדוגמה"), invite a client, sign in with 972500000102 on another phone (or after signing out), join with the code, fill in the intake, then as the trainer schedule 3–4 workouts and complete one. The reviewer must see a working app, not empty screens. *(The lead can seed this with SQL instead, with your OK.)*

### 1.4 Migrations and edge functions
Listed in STATUS.md → "Migrations to apply". The lead applies them through the Supabase connector after a rolled-back dry run, once you OK it.

---

## Part 2 — The first Android build

1. Confirm the package name `com.idan.coachflow` (it can never change after the first upload).
2. From the repo folder (or ask the lead to run it):
   ```
   npx eas-cli build --platform android --profile production
   ```
   - The first time, EAS creates the Android upload keystore and stores it for you. Say yes.
   - The free queue takes about 15–45 minutes. The result is an `.aab` file, linked from the build page on expo.dev.
3. Nothing reaches users yet: the file only goes where you upload it.

---

## Part 3 — Play Console: the app, the forms, the closed test

### 3.1 Create the app
Play Console → **Home** → **Create app**:
- App name: `CoachFlow`. Default language: **Hebrew (עברית – iw-IL)**. App. **Free**. A free app can never become paid later; subscriptions are still possible.
- Tick the declarations → **Create app**.

### 3.2 First upload, to internal testing (no review, minutes)
1. **Test and release** → **Testing** → **Internal testing** → **Testers** → create an email list with yourself (and anyone with Android who'll check it first).
2. **Create new release** → accept **Play App Signing** (Google-generated key) → upload the `.aab` from expo.dev → release notes in Hebrew → **Next** → **Save and publish**.
3. Open the tester link on an Android phone and install. This is the first real build: check sign-in, a workout, and progress photos.
4. If Play Console warns about **16 KB page size** on the bundle, tell the lead before going further.

*(Later uploads can go through `eas submit` with a Google service account key. Manual upload is simpler for the first one.)*

### 3.3 App content (Policy → App content)
Fill in each item using the drafted answers in `docs/release/store/`. Play Console lists what's still outstanding.
- **Privacy policy**: the hosted URL from 0.5.
- **Ads**: no ads.
- **App access**: "some functionality is restricted" → the test number, the code, and the steps from `review-notes.md`.
- **Content rating**: the questionnaire (`content-rating-answers.md`).
- **Target audience**: 18+ only. That keeps the app out of the Families policy.
- **Data safety**: `data-safety-answers.md`.
- **Health apps**: required for every app. Tick **Activity and Fitness** and **Nutrition and Weight Management**.
- Government apps, financial features, news: no.

### 3.4 Store listing
**Grow users** → **Store presence** → **Main store listing**:
- name, short description (80), full description (4000) from `listing-he.md`;
- app icon 512×512, feature graphic 1024×500, 4–8 phone screenshots;
- category **Health & Fitness**, contact email.

### 3.5 Closed test (the 14-day clock)
1. **Testing** → **Closed testing** → open the default track → **Testers**: add the email list of 15–20 testers.
2. **Countries/regions**: Israel.
3. **Create release** → **Add from library** (the same bundle) → **Save** → **Publishing overview** → **Send changes for review**. The first review takes hours to a few days.
4. Once approved, copy the **opt-in link** from the Testers tab and send it to everyone. The 14 days count from when at least 12 testers are opted in.
5. Fixes keep shipping during the test (new bundles or OTA updates) without resetting the clock. **Don't pause the track.**
6. Keep a WhatsApp group with the testers and collect their feedback: Google asks about it next.

### 3.6 Production access, then the release
1. After 14 days: **Dashboard** → **Apply for production**. It asks how you recruited testers, how they used the app, what feedback you got and what you changed, plus the target audience and expected installs. Review usually takes up to 7 days.
2. Then **Production** → **Countries/regions**: Israel → **Create release** → add the latest bundle → review → live.

---

## Part 4 — iOS: build, TestFlight, App Store Connect
*(Once the Apple Developer account is active.)*

### 4.1 Create the app record
App Store Connect → **Apps** → **+** → **New App**: iOS, name, primary language **Hebrew**, bundle ID `com.idan.coachflow` (it appears after the first build registers it, or register it under Certificates, Identifiers & Profiles), SKU `coachflow-ios`.
- **The name must be unique on the whole App Store.** If "CoachFlow" is taken, use a variant such as "CoachFlow – אימון אישי". The name on the phone's home screen stays "CoachFlow".

### 4.2 First iOS build (interactive, once, on this computer)
```
npx eas-cli build --platform ios --profile production
```
Sign in with your Apple ID when asked. EAS registers the bundle ID and creates the distribution certificate and provisioning profile. Later builds reuse them.

### 4.3 Upload to TestFlight
```
npx eas-cli submit --platform ios --latest
```
Sign in again if asked. The build shows up in App Store Connect → **TestFlight** after processing (10–30 minutes). Add yourself (and the trainer, as an App Store Connect user) as internal testers, then install it through the TestFlight app.

### 4.4 The App Store page
- **App Information**: subtitle, category **Health & Fitness**, age rating questionnaire (Apple's ratings are now 4+, 9+, 13+, 16+, 18+; use `age-rating-answers.md`).
- **Pricing and Availability**: Free, **Israel** only.
- **App Privacy**: privacy policy URL + the answers in `app-privacy-answers.md`.
- **Version 1.0**: screenshots at the size App Store Connect asks for (iPhone only; no iPad screenshots, since the app is iPhone-only), promotional text, description, keywords, support URL.
- **App Review Information**: sign-in required → user name: the trainer test number; password: its code; notes: the walkthrough from `review-notes.md` (both test numbers, and which one is the client).
- **Submit for review**: usually 1–2 days. If it's rejected, paste the message to the lead.

---

## Part 5 — After launch
- **JS-only fix** (no new native package or plugin): it reaches installed apps in minutes, with no store review:
  ```
  APP_VARIANT=production npx eas-cli update --channel production --environment production --message "what changed"
  ```
- **Native change** (new native package, plugin or SDK): bump `version` in app.json, build again (Parts 2 and 4.2), and submit it to both stores for review.
- Never create a git branch named `production`.
