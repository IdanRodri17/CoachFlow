// lib/nutritionPlan.ts — reads the plain-text plan that
// supabase/functions/nutrition-suggest returns (and nutrition_plans stores)
// into meals, so both nutrition screens can draw meal rows with kcal.
//
// The function asks Claude for: the meal's name on its own line, "-" food
// lines, then that meal's estimated kcal/protein/carbs/fat; a day-total line;
// the disclaimer as the very last line. Real plans put blank lines between
// all of these, so this reads line by line — never by blank-line blocks:
//   ארוחת בוקר
//   - 2 ביצים מטוגנות בכף שמן זית
//   קלוריות: 480 | חלבון: 18 גרם | פחמימות: 20 גרם | שומן: 32 גרם
// The day total and the disclaimer are dropped (the screens show the targets
// and their own disclaimer). Anything it can't place goes to `notes`, and a
// screen falls back to the raw text when no meal comes out at all.

export type PlanMeal = {
  title: string;
  items: string[];
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};

export type ParsedPlan = { meals: PlanMeal[]; notes: string[] };

/** The edge function's mandated last line (both languages). */
const DISCLAIMER_HINTS = ["לא ייעוץ רפואי", "not medical"];
const TOTAL_HINTS = /סה["״]?כ|סך הכול|סך הכל|\btotal\b|\bdaily\b/i;
const BULLET = /^(?:[-–—•·]|\*(?!\*))\s*/;
/** A line that starts like a meal's name — always a new meal. */
const MEAL_WORDS =
  /^(?:ארוחת|ארוחה|בוקר|ביניים|צהריים|ערב|לילה|נשנוש|breakfast|brunch|lunch|dinner|supper|snack|meal\b|pre-workout|post-workout)/i;

const NUM = String.raw`(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)`;
const APPROX = String.raw`(?:כ-?|~|≈|about\s+|approx\.?\s+)?`;
const KEYS = {
  kcal: String.raw`קלוריות|קק["״]ל|kcal|calories|cal\b`,
  protein: String.raw`חלבונים|חלבון|protein`,
  carbs: String.raw`פחמימות|carbohydrates|carbs`,
  fat: String.raw`שומנים|שומן|fats?\b`,
} as const;
type Nutrient = keyof typeof KEYS;

function toNumber(s: string): number {
  return Number(s.replace(/,/g, ""));
}

/** "קלוריות: 480", "480 kcal", "Protein: 18g", "18g protein", "חלבון 18 גרם". */
function findNutrient(line: string, key: Nutrient): number | null {
  const keyFirst = new RegExp(String.raw`(?:${KEYS[key]})\s*[:：=-]?\s*${APPROX}${NUM}`, "i");
  const numFirst = new RegExp(String.raw`${APPROX}${NUM}\s*(?:g|gr|גרם|ג׳|ג'|גר׳)?\s*(?:${KEYS[key]})`, "i");
  const m = line.match(keyFirst) ?? line.match(numFirst);
  return m ? toNumber(m[1]) : null;
}

function macros(line: string) {
  return {
    kcal: findNutrient(line, "kcal"),
    protein: findNutrient(line, "protein"),
    carbs: findNutrient(line, "carbs"),
    fat: findNutrient(line, "fat"),
  };
}

function isMacroLine(m: ReturnType<typeof macros>): boolean {
  const grams = [m.protein, m.carbs, m.fat].filter((x) => x != null).length;
  return m.kcal != null || grams >= 2;
}

/** "ארוחת בוקר" → "בוקר"; "BREAKFAST:" → "Breakfast". */
export function shortMealTitle(raw: string): string {
  let s = raw.replace(/[#*_]/g, "").replace(/[:：]\s*$/, "").trim();
  s = s.replace(/^ארוחת\s+/, "").replace(/^ארוחה\s+/, "");
  if (/[A-Za-z]/.test(s) && s === s.toUpperCase()) {
    s = s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  }
  return s;
}

export function parsePlan(text: string): ParsedPlan {
  const meals: PlanMeal[] = [];
  const notes: string[] = [];
  let current: PlanMeal | null = null;

  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (DISCLAIMER_HINTS.some((h) => line.includes(h))) continue;

    if (BULLET.test(line)) {
      const item = line.replace(BULLET, "").trim();
      if (!item) continue;
      if (!current) {
        current = { title: "", items: [], kcal: null, protein: null, carbs: null, fat: null };
        meals.push(current);
      }
      current.items.push(item);
      continue;
    }

    const m = macros(line);
    const macroLine = isMacroLine(m);
    // The day's total isn't a meal's.
    if (macroLine && TOTAL_HINTS.test(line)) continue;

    // A meal's name always starts a new meal, even with its numbers on the
    // same line ("ארוחת בוקר (480 קק״ל)").
    const name = line.replace(/[#*_]/g, "").trim();
    if (MEAL_WORDS.test(name)) {
      const title = macroLine ? name.split(/[(:：|–—]/)[0] : name;
      current = { title: shortMealTitle(title), items: [], kcal: null, protein: null, carbs: null, fat: null };
      if (macroLine) Object.assign(current, m);
      meals.push(current);
      continue;
    }

    if (macroLine) {
      // A macro line before any meal, or a second one, belongs to no meal.
      if (current && current.kcal == null) Object.assign(current, m);
      continue;
    }

    // A plain line: a new meal's name — unless the meal above has no food yet,
    // in which case it's that meal's food written without a dash.
    if (current && current.items.length === 0) {
      current.items.push(line);
    } else {
      current = { title: shortMealTitle(line), items: [], kcal: null, protein: null, carbs: null, fat: null };
      meals.push(current);
    }
  }

  // A "meal" with no food and no numbers was really a loose sentence.
  const real = meals.filter((meal) => {
    if (meal.items.length > 0 || meal.kcal != null) return true;
    if (meal.title) notes.push(meal.title);
    return false;
  });
  return { meals: real, notes };
}
