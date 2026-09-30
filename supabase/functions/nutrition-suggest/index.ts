// supabase/functions/nutrition-suggest/index.ts — V15: AI nutrition assistant.
//
// Called directly from the app (trainer taps "Suggest" on a client's
// Nutrition card) via supabase.functions.invoke. This function ONLY calls
// Claude and returns the generated plan text — it never touches the database.
// The app saves the result to nutrition_plans on "Save", through the
// trainer's own RLS-protected session, exactly like every other write in
// this app.
//
// AUTH: an earlier version of this file relied on the platform's default JWT
// verification alone, reasoning that "only a signed-in user can reach this."
// That is true but insufficient — sign-in uses shouldCreateUser:true
// (lib/auth.tsx), so anyone can self-serve a valid session in a minute, and
// every existing CLIENT-role user already had one. The trainer-only gate was
// client-side only (app/dashboard/[refId].tsx). Since each call spends real
// money against ANTHROPIC_API_KEY, this function now verifies the caller's
// session itself and requires profiles.role = 'trainer' — same pattern as
// supabase/functions/delete-account/index.ts.
//
// SECRETS (set once: `supabase secrets set NAME=value`):
//   ANTHROPIC_API_KEY — from https://console.anthropic.com/settings/keys.
//                        Server-side only — never put this in the app bundle.
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are injected
// automatically into every edge function — nothing to set for those.

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

// The free-text preferences field is interpolated into the system prompt, so
// it is capped — an unbounded string is both a cost and a prompt-injection
// surface. Long enough for any real dietary note.
const MAX_PREFERENCES_LENGTH = 300;

const DISCLAIMER: Record<"he" | "en", string> = {
  he: "כלליות בלבד — לא ייעוץ רפואי או דיאטני",
  en: "general suggestions — not medical or dietetic advice",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicApiKey) {
    return json({ error: "ANTHROPIC_API_KEY secret is not set." }, 500);
  }

  // Verify the caller is a signed-in TRAINER before spending any money.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Not authenticated." }, 401);

  // Read the role with the service key: profiles' RLS only lets a user select
  // their OWN row, which is exactly this row — but using the service client
  // keeps this check independent of any future RLS change.
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileErr) return json({ error: profileErr.message }, 500);
  if (profile?.role !== "trainer") {
    return json({ error: "Only a trainer can generate a nutrition plan." }, 403);
  }

  let body: {
    calories?: number;
    protein_g?: number;
    carbs_g?: number;
    fat_g?: number;
    preferences?: string;
    locale?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const { calories, protein_g, carbs_g, fat_g } = body;
  const locale: "he" | "en" = body.locale === "he" ? "he" : "en";
  if (
    !Number.isFinite(calories) ||
    !Number.isFinite(protein_g) ||
    !Number.isFinite(carbs_g) ||
    !Number.isFinite(fat_g)
  ) {
    return json({ error: "calories, protein_g, carbs_g and fat_g must all be numbers." }, 400);
  }
  const preferences = body.preferences?.slice(0, MAX_PREFERENCES_LENGTH);

  const languageName = locale === "he" ? "Hebrew" : "English";
  const system = [
    "You are a nutrition assistant inside a fitness trainer's client-tracking app.",
    `Generate one sample day of meals (breakfast, lunch, dinner, and one or two snacks) that together approximate these daily targets: ${calories} kcal, ${protein_g}g protein, ${carbs_g}g carbs, ${fat_g}g fat.`,
    preferences ? `Dietary preferences or restrictions to respect: ${preferences}.` : "",
    "For each meal: list the foods with rough portions, then an estimated kcal/protein/carbs/fat for that meal.",
    "End with a short line totaling the day's estimated macros.",
    "Format as plain text only — no markdown syntax (no #, *, or _). Put the meal name in its own line in capital letters, a blank line before each meal, and use simple dashes for food items.",
    `Write the entire response in ${languageName}.`,
    `The response MUST end with this exact line, verbatim, as the very last line: "${DISCLAIMER[locale]}"`,
  ]
    .filter(Boolean)
    .join(" ");

  const anthropic = new Anthropic({ apiKey: anthropicApiKey });

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      // On Sonnet 5, OMITTING `thinking` runs adaptive thinking at the default
      // `high` effort, and thinking counts against max_tokens. Combined with
      // the old 2048 cap that silently truncated plans — and a truncated plan
      // loses its mandated last line, the "not medical advice" disclaimer
      // (SRS §5 V15). A one-day meal plan is a formatting task, not a
      // reasoning one, so cap the thinking with low effort and leave real
      // headroom for the plan itself.
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      max_tokens: 8192,
      system,
      messages: [{ role: "user", content: "Generate today's sample meal plan." }],
    });

    // A truncated plan reads as finished — it just stops after a meal, with the
    // disclaimer missing. Reject it rather than letting the trainer save it.
    if (message.stop_reason === "max_tokens") {
      return json({ error: "The generated plan was cut off. Please try again." }, 502);
    }

    let planMarkdown = "";
    for (const block of message.content) {
      if (block.type === "text") planMarkdown += block.text;
    }
    planMarkdown = planMarkdown.trim();

    if (!planMarkdown) {
      return json({ error: "Claude returned no text content." }, 502);
    }

    return json({ plan_markdown: planMarkdown });
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
});
