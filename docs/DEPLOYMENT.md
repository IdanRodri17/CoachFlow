# CoachFlow — Deployment Guide (Google Play + Apple App Store)

This ships an Expo (React Native) app to **both** stores using **EAS** — Expo's cloud build + submit service — so you don't need a Mac for the iOS build. You already have a Google Play account ($25, one-time); the only new spend is the **Apple Developer Program ($99/year)**, which covers all your apps under one membership.

> Order of operations: get assets ready → configure the app → build with EAS → test internally (TestFlight + Play internal track) → fix → submit for review → release.

---

## 0. Prerequisites (one-time)

- **Apple:** Apple Developer Program membership ($99/year). Enroll at developer.apple.com. *(Individual vs. Organization: enroll as an Organization only if your friend's business is a registered entity and wants the listing under the business name; otherwise Individual is fine for an MVP under your account.)*
- **Google:** Google Play Console account (you already have this).
- **Expo + EAS:** Create a free Expo account, then `npm i -g eas-cli` and `eas login`.
- **Privacy policy URL** (publicly hosted) and a **support URL/email** — both stores require these. A simple page on your father's-business-style Netlify/GitHub Pages works.

---

## 1. Assets you must prepare

| Asset | Spec | Used by |
|---|---|---|
| App icon | 1024×1024 PNG, no transparency, no rounded corners | Both |
| Adaptive icon (Android) | foreground + background | Google |
| Splash screen | per Expo splash config | Both |
| Phone screenshots | a few per platform, real app flows (capture in simulator/device) | Both |
| Tablet screenshots | only if you support tablets | Both |
| Feature graphic | 1024×500 | Google |
| Short + full description | store copy (write a Hebrew version too) | Both |
| Privacy policy URL | hosted page | Both |
| Support URL / email | hosted/contactable | Both |

Tip: capture screenshots by running the app on a device/simulator, walking the main flows (today's workout, logging + rest timer, progress chart, trainer dashboard, shareable card), and taking native screenshots.

---

## 2. Configure the app (`app.config.js` / `app.json`)

Set these before your first build:

- `name`: CoachFlow (or the friend's brand)
- `slug`: coachflow
- `version`: `1.0.0` (the user-facing version)
- `ios.bundleIdentifier`: e.g. `com.idan.coachflow` — **immutable once published**, choose carefully
- `android.package`: same reverse-DNS id
- `ios.buildNumber` / `android.versionCode`: bump every build you submit
- `icon`, `splash`, `ios.supportsTablet` (false unless you did tablet screenshots)
- Plugins for the native libs you used (image-picker, etc.) so the native build includes them
- `extra.eas.projectId`: created by `eas init`

> **HealthKit note:** because CoachFlow does **not** use HealthKit, do not add the HealthKit entitlement. (This avoids the classic "missing NSHealthShareUsageDescription" rejection — that error only appears when a HealthKit entitlement was added without the usage string. We're not using it, so we leave it out entirely.)

Run `eas init` once to link the project, then `eas build:configure` to generate `eas.json` (build profiles: development, preview, production).

---

## 3. Build with EAS (cloud — no Mac needed)

**Android (AAB for Play):**
```
eas build --platform android --profile production
```

**iOS (signed in the cloud):**
```
eas build --platform ios --profile production
```
For iOS, EAS will prompt to manage your **certificates and provisioning profiles** automatically — let it. This is the part that bites first-timers, and EAS handles it for you. You'll sign in with your Apple Developer account when prompted.

Build both, or run them together. Each produces a downloadable artifact and stays in your EAS dashboard.

---

## 4. Test internally before you ever hit "submit"

**iOS — TestFlight:**
```
eas submit --platform ios --latest
```
This uploads the build to App Store Connect. Add your friend as an internal tester → they install via TestFlight and smoke-test the real app on their phone. Fix issues, bump `buildNumber`, rebuild, re-submit to TestFlight until it's solid.

**Android — Internal testing track:**
```
eas submit --platform android --latest
```
In Play Console, push the upload to the **Internal testing** track and add your friend's email. Same loop.

> This internal round is where your friend confirms the flows feel right before real users or reviewers see anything.

---

## 5. App Store Connect — listing + review prep (iOS)

In App Store Connect, create the app record (matching your bundle id) and fill:

- **App Privacy ("nutrition label"):** declare what you collect. CoachFlow collects the user's **phone number** (for SMS login) + account info + the fitness/progress data the user enters. Note Twilio (or your SMS provider) as a processor. Be accurate — this is a common rejection point.
- **Age rating** questionnaire.
- Screenshots, description (English + Hebrew), keywords, support URL, privacy policy URL.
- **Sign in with Apple:** *not required* — phone/SMS OTP is a first-party method, not a third-party social login, so it doesn't trigger the requirement. **It only kicks in if you later add a social login like Google or Facebook**, at which point Apple also requires Sign in with Apple.
- **Reviewer can't receive your SMS — handle this or you'll get rejected.** Because login is phone-OTP, Apple's reviewer can't get the code on your phone. Configure a **test phone number with a fixed OTP** in Supabase Auth (Supabase supports preset test numbers/codes), and put that number + code in the reviewer notes. Same applies to Google Play review. This is the single most likely rejection for an OTP app — don't skip it.
- **Account deletion:** because the app has login, Apple requires an in-app way to delete the account (not just "email us"). Make sure that path exists before submitting.
- **Demo accounts for the reviewer:** provide a working demo **trainer** and demo **client** (reachable via the test phone number above) so the reviewer can actually use both sides of the app.
- **Minimum functionality:** not a concern here — scheduling, logging, charts, and a dashboard are plenty of real native functionality. (This rule mainly bites thin "wrapped website" apps; CoachFlow is a real app.)

Then submit for review. First review typically lands in a few days; you'll get a reply (approved or with requested changes).

---

## 6. Google Play Console — listing + review prep (Android)

In Play Console:

- **Data safety form:** the Android equivalent of Apple's privacy label — declare collection/sharing accurately.
- **Content rating** questionnaire.
- Store listing: screenshots, feature graphic, short + full description (English + Hebrew), privacy policy URL.
- **Target audience & content** + any required declarations.
- Promote your tested build from **Internal testing** → **Closed/Open testing** (optional) → **Production**.

Google review is usually faster than Apple's but can still take a day or more for a new app/account.

---

## 7. Pre-submission checklist (don't get rejected twice)

- [ ] Privacy policy URL live and accurate
- [ ] Support URL/email reachable
- [ ] iOS: in-app **account deletion** present
- [ ] **Test phone number with fixed OTP** configured in Supabase + listed in reviewer notes (iOS & Android) — reviewers can't receive real SMS
- [ ] iOS: **demo trainer + client accounts** in reviewer notes
- [ ] App Privacy label (iOS) and Data Safety form (Android) match what the app actually collects — including **phone number** and the SMS provider
- [ ] SMS provider (Twilio or similar) account live + Israeli sender registration done (has lead time — start early)
- [ ] No HealthKit entitlement (we don't use it)
- [ ] Screenshots show real flows, both platforms
- [ ] Bundle id / package name final (immutable after publish)
- [ ] `version` + `buildNumber`/`versionCode` bumped for the submitted build
- [ ] Hebrew store copy added (your audience is Israeli)
- [ ] Friend has smoke-tested via TestFlight + Play internal track

---

## 8. After launch — updates

- **JS-only changes** (copy, layout, logic, most features): ship instantly over-the-air with **`eas update`** — no new store review. Great for fast iteration.
- **Native changes** (new native library, permission, icon, version bump for a store-visible release): requires a new `eas build` + `eas submit` + review.
- Bump `version` for user-facing releases; always bump `buildNumber`/`versionCode` per submitted binary.

---

## 9. Reusing this for your own two apps
Everything above is per-**account**, not per-app. Your two ready apps go through the exact same EAS build → submit → review flow under the same Apple membership and Play account — and the certificate/provisioning pain you solved here doesn't recur. After CoachFlow, your own two are basically a victory lap.
