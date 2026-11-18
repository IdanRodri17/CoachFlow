import type { ConfigContext, ExpoConfig } from "expo/config";

// app.json holds the whole config; this file only picks the runtime version.
//
// - Expo Go previews (every push to main, cloud/**, handoff/**) keep the
//   sdkVersion runtime (exposdk:58.0.0), the only one Expo Go loads.
// - Store builds set APP_VARIANT=production (eas.json → build.production.env)
//   and get the appVersion runtime ("1.0.0"), so a preview update can never
//   reach a store binary. A production OTA fix must be published with the
//   same variable:  APP_VARIANT=production eas update --channel production --environment production
// - Bump `version` in app.json for every store build that changes native code
//   (a native package, a config plugin, the SDK). See CLAUDE.md → Versioning.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  runtimeVersion:
    process.env.APP_VARIANT === "production"
      ? { policy: "appVersion" }
      : { policy: "sdkVersion" },
});
