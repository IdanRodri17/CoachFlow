// eslint.config.js — V19 (Step 2b). https://docs.expo.dev/guides/using-eslint/
//
// eslint-config-expo includes eslint-plugin-react-hooks, whose rules-of-hooks
// is an error here and in CI (.github/workflows/ci.yml runs `npm run lint`).

const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      "dist/*",
      // The redesign session's git worktree lives inside this folder; it is
      // linted from its own checkout, not twice from here.
      ".claude/**",
      // Deno edge functions: `npm:` / `jsr:` imports aren't resolvable by
      // Node's resolver, and tsconfig excludes them for the same reason.
      "supabase/functions/**",
      // Untracked design reference material (HTML/JS prototypes).
      "docs/**",
    ],
  },
  {
    // React Compiler-era rules from eslint-plugin-react-hooks v6+. They flag
    // four known, currently-harmless spots, all in code the redesign rewrites
    // or in auth's load effect — so they WARN for now instead of failing CI:
    //   set-state-in-effect  components/AdjustmentModal.tsx (reset on open, D20c)
    //                        lib/auth.tsx (clear profile on sign-out)
    //   purity               app/workout/[id].tsx useRef(Date.now()) (D20a)
    //   refs                 components/TemplateBuilder.tsx key counter (D29a)
    // Flip them back to "error" once those are rewritten.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
    },
  },
]);
