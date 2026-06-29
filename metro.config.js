// Metro is the JavaScript bundler Expo uses (like Webpack/Vite for the web).
// NativeWind needs to hook into Metro so it can compile our Tailwind classes
// (defined via ./global.css + tailwind.config.js) into styles the app can use.
//
// We start from Expo's default Metro config and wrap it with NativeWind's
// `withNativeWind`, telling it where our CSS entry file lives.
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: "./global.css" });
