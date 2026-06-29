/** @type {import('tailwindcss').Config} */
// Tailwind config for NativeWind. Two things matter here:
//
//   - `content`: the files Tailwind scans for className="..." usage so it knows
//     which utility classes to generate. Add new folders here as the app grows.
//   - `presets`: NativeWind's preset, which teaches Tailwind how to emit styles
//     that work in React Native (not the browser).
//
// IMPORTANT: NativeWind v4 requires Tailwind CSS v3 (we pinned ^3.4.17).
// Tailwind v4 changed its engine and is not yet supported by NativeWind.
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {},
  },
  plugins: [],
};
