// lib/nutritionPlan.test.ts — reading nutrition-suggest's plain-text plan
// into meals (lib/nutritionPlan.ts).

import { describe, expect, it } from "vitest";

import { parsePlan, shortMealTitle } from "./nutritionPlan";

// The shape real saved plans have: blank lines between the name, the food
// lines and the macro line.
const HEBREW = `ארוחת בוקר

- 2 ביצים מטוגנות בכף שמן זית
- פרוסת לחם מלא

קלוריות: 480 | חלבון: 18 גרם | פחמימות: 20 גרם | שומן: 32 גרם

ארוחת ביניים 1

- יוגורט טבעי (200 גרם)

קלוריות: 220 | חלבון: 10 גרם | פחמימות: 15 גרם | שומן: 12 גרם

סה"כ משוער ליום: קלוריות כ-2000, חלבון כ-50 גרם, פחמימות כ-50 גרם, שומן כ-50 גרם

כלליות בלבד — לא ייעוץ רפואי או דיאטני`;

describe("parsePlan", () => {
  it("reads meals, food lines and per-meal macros, dropping the total and the disclaimer", () => {
    const { meals, notes } = parsePlan(HEBREW);
    expect(meals).toEqual([
      {
        title: "בוקר",
        items: ["2 ביצים מטוגנות בכף שמן זית", "פרוסת לחם מלא"],
        kcal: 480,
        protein: 18,
        carbs: 20,
        fat: 32,
      },
      { title: "ביניים 1", items: ["יוגורט טבעי (200 גרם)"], kcal: 220, protein: 10, carbs: 15, fat: 12 },
    ]);
    expect(notes).toEqual([]);
  });

  it("reads English with the number before the unit and capitals in the name", () => {
    const { meals } = parsePlan(
      "BREAKFAST\n- Greek yogurt, 200g\n- 1 banana\nEstimated: ~450 kcal, 30g protein, 55g carbs, 10g fat\n\n" +
        "LUNCH\n- Chicken breast\nCalories: 1,050 | Protein: 60g | Carbs: 90g | Fat: 40g\n\n" +
        "Daily total: 1,500 kcal\ngeneral suggestions — not medical or dietetic advice",
    );
    expect(meals.map((m) => [m.title, m.kcal, m.protein, m.carbs, m.fat])).toEqual([
      ["Breakfast", 450, 30, 55, 10],
      ["Lunch", 1050, 60, 90, 40],
    ]);
  });

  it("takes the numbers from the name's own line and keeps a dash-less food line", () => {
    const { meals } = parsePlan("ארוחת ערב (500 קק״ל)\nחביתה משתי ביצים ולחם מלא\n\nנשנוש\n- תפוח");
    expect(meals).toEqual([
      { title: "ערב", items: ["חביתה משתי ביצים ולחם מלא"], kcal: 500, protein: null, carbs: null, fat: null },
      { title: "נשנוש", items: ["תפוח"], kcal: null, protein: null, carbs: null, fat: null },
    ]);
  });

  it("puts a loose sentence in notes, and gives nothing for an empty plan", () => {
    expect(parsePlan("Here is your plan.\n\nDinner\n- Salmon").notes).toEqual(["Here is your plan."]);
    expect(parsePlan("")).toEqual({ meals: [], notes: [] });
  });
});

describe("shortMealTitle", () => {
  it("drops 'ארוחת', a trailing colon and markdown, and title-cases capitals", () => {
    expect(shortMealTitle("ארוחת צהריים:")).toBe("צהריים");
    expect(shortMealTitle("**SNACK 2**")).toBe("Snack 2");
    expect(shortMealTitle("Mid-morning")).toBe("Mid-morning");
  });
});
