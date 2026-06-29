// Babel tells Metro (Expo's bundler) how to transform our code before it runs
// on the phone. We need two things here:
//
//   1. babel-preset-expo  — the standard Expo transform. The
//      `jsxImportSource: "nativewind"` option is what lets NativeWind turn a
//      `className="..."` prop on a React Native <View>/<Text> into real styles.
//
//   2. "nativewind/babel" — NativeWind's own preset, required by NativeWind v4.
//
// NOTE: We do NOT add the Reanimated/worklets Babel plugin by hand.
// babel-preset-expo (SDK 56) automatically injects "react-native-worklets/plugin"
// when react-native-worklets is installed (which it is, via Reanimated 4).
// Adding it manually would register it twice and break the build.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
