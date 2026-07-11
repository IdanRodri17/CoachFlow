// supabase/functions/nutrition-suggest/index.ts — V15: AI nutrition assistant.
//
// Called directly from the app (trainer taps "Suggest" on a client's
// Nutrition card) via supabase.functions.invoke — Supabase's default JWT
// verification means only a signed-in user's session can reach this
// function, so there's no auth check to write here. This function ONLY
// calls Claude and returns the generated plan text — it never touches the
// database. The app saves the result to nutrition_plans on "Save", through
// the trainer's own RLS-protected session, exactly like every other write
// in this app.
//
// SECRETS (set once: `supabase secrets set NAME=value`):
//   ANTHROPIC_API_KEY — from https://console.anthropic.com/settings/keys.
//                        Server-side only — never put this in the app bundle.

import Anthropic from "npm:@anthropic-ai/sdk";

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

  const { calories, protein_g, carbs_g, fat_g, preferences } = body;
  const locale: "he" | "en" = body.locale === "he" ? "he" : "en";
  if (
    !Number.isFinite(calories) ||
    !Number.isFinite(protein_g) ||
    !Number.isFinite(carbs_g) ||
    !Number.isFinite(fat_g)
  ) {
    return json({ error: "calories, protein_g, carbs_g and fat_g must all be numbers." }, 400);
  }

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
      max_tokens: 2048,
      system,
      messages: [{ role: "user", content: "Generate today's sample meal plan." }],
    });

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
