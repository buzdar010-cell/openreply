import { type DishRow } from "./db.ts";
import { type ParsedLogEntryResult } from "./parseLog.ts";

export interface ResolvedPortion {
  resolved_grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
}

/**
 * Turns one parsed log entry into final grams + nutrition, using the same
 * precedence the whole nutrition-tracker/data build has assumed throughout:
 *   1. An explicit custom_grams the user stated wins outright.
 *   2. Otherwise, a named portion_preset (if the dish has one and it matches).
 *   3. Otherwise, the dish's own default_serving_g.
 * `quantity` (e.g. "two rotis") multiplies whichever base grams was chosen --
 * it's a count of that portion, not an alternative to it.
 */
export function resolvePortion(entry: ParsedLogEntryResult, dish: DishRow): ResolvedPortion {
  let baseGrams: number;

  if (entry.custom_grams != null) {
    baseGrams = entry.custom_grams;
  } else if (entry.portion_preset && dish.portion_presets_json) {
    const presets = JSON.parse(dish.portion_presets_json) as Record<string, { grams: number }>;
    const preset = presets[entry.portion_preset];
    baseGrams = preset ? preset.grams : dish.default_serving_g;
  } else {
    baseGrams = dish.default_serving_g;
  }

  const totalGrams = baseGrams * entry.quantity;
  const factor = totalGrams / 100;

  return {
    resolved_grams: round1(totalGrams),
    kcal: round1(dish.per_100g_kcal * factor),
    protein_g: round1(dish.per_100g_protein_g * factor),
    carbs_g: round1(dish.per_100g_carbs_g * factor),
    fat_g: round1(dish.per_100g_fat_g * factor),
    fiber_g: round1(dish.per_100g_fiber_g * factor),
    sugar_g: round1(dish.per_100g_sugar_g * factor),
    sodium_mg: round1(dish.per_100g_sodium_mg * factor),
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
