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
//
// D19a: the "Chalk & Iron" design tokens (docs/design/DESIGN.md §2). Copied
// value-for-value from the design handoff — don't round or rename them. Every
// token name is new (nothing in the app used these class names before), and
// Tailwind deep-merges `extend`, so the built-in palettes the current screens
// use (slate, emerald, …) — and sky-50…950 next to our sky/sky-soft — keep
// working until each screen is rebuilt.
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./lib/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      // §2.1. Volt is a fill, never text on a light background; on iron it's
      // fine. smoke fails contrast on mist; ash-2 only on iron / iron-2.
      colors: {
        chalk: "#F5F4EF", // app background
        paper: "#FFFFFF", // cards, sheets, tab bar
        mist: "#ECEAE3", // subtle fills, segmented-control track, neutral chips
        line: { DEFAULT: "#E3E0D7", strong: "#D6D3C9" }, // hairlines / input + secondary-button borders
        ink: "#131416", // text, primary button
        graphite: "#55585E", // secondary text
        smoke: "#6B6E75", // captions — only on chalk/paper
        volt: { DEFAULT: "#D5F24B", soft: "#EEF8C6", ink: "#3E5000" },
        ember: { DEFAULT: "#B0381B", soft: "#FDE6DD" }, // missed, at-risk, pain
        gold: { DEFAULT: "#724F00", soft: "#FFF0C4" }, // money owed, package running out
        sky: { DEFAULT: "#1D4DA3", soft: "#E2EBFB" }, // session with the trainer
        iron: { DEFAULT: "#0D0E10", 2: "#17191C", 3: "#212428", line: "#2B2F34" }, // workout mode
        bone: "#F3F2EC", // text on iron
        ash: { DEFAULT: "#A4A8AE", 2: "#80858C" }, // secondary text on iron
        "bar-past": "#8C8F95", // de-emphasised chart marks
      },
      // §2.2. React Native picks no font file from fontWeight, so every weight
      // is its own family. The names are the keys app/_layout.tsx loads with
      // useFonts. Numbers get their own <Text> with font-num / font-num-bold.
      fontFamily: {
        display: ["Karantina_700Bold"],
        num: ["BarlowCondensed_600SemiBold"],
        "num-bold": ["BarlowCondensed_700Bold"],
        sans: ["IBMPlexSansHebrew_400Regular"],
        "sans-medium": ["IBMPlexSansHebrew_500Medium"],
        "sans-semibold": ["IBMPlexSansHebrew_600SemiBold"],
        "sans-bold": ["IBMPlexSansHebrew_700Bold"],
      },
      // §2.3. Status chips and avatars use the built-in rounded-full.
      borderRadius: {
        segment: "10px", // selected segment inside a Segmented track
        chip: "12px", // select chip, workout secondary actions
        btn: "14px", // buttons up to 52 tall, Segmented track
        "btn-lg": "16px", // 56-tall CTAs
        "btn-xl": "20px", // 64-tall buttons, workout stepper buttons
        "btn-2xl": "24px", // the 72-tall workout button, workout steppers
        card: "20px",
        hero: "28px", // hero cards
        sheet: "28px", // bottom-sheet top corners
      },
    },
  },
  plugins: [],
};
