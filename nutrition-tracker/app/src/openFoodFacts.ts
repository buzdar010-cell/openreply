/**
 * Open Food Facts lookup -- free, no API key, no per-request cost. The
 * realistic free option for barcode data; coverage is decent for
 * multinational brands sold in Pakistan (crowdsourced worldwide) and thin
 * for purely local ones, which is exactly the gap the label-photo AI
 * extraction fallback (parseBarcodeLabel.ts) exists to cover.
 */

export interface OffProduct {
  name: string;
  servingSizeG: number | null;
  perG: {
    kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
    sugar_g: number;
    sodium_mg: number;
  };
}

function parseServingSizeG(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const match = raw.match(/([\d.]+)\s*g/i);
  return match ? parseFloat(match[1]) : null;
}

interface OffNutriments {
  "energy-kcal_100g"?: number;
  proteins_100g?: number;
  carbohydrates_100g?: number;
  fat_100g?: number;
  fiber_100g?: number;
  sugars_100g?: number;
  sodium_100g?: number; // OFF reports this in grams, not mg
}

/** Returns null on any miss -- not found, or found but missing the calorie/name data needed to actually log it. */
export async function lookupOpenFoodFacts(code: string): Promise<OffProduct | null> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,nutriments,serving_size`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Nourly-NutritionTracker/1.0 (contact: buzdar0003@gmail.com)" },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    status?: number;
    product?: { product_name?: string; nutriments?: OffNutriments; serving_size?: string };
  };
  if (data.status !== 1 || !data.product) return null;

  const name = data.product.product_name;
  const n = data.product.nutriments ?? {};
  const kcal = n["energy-kcal_100g"];
  if (!name || typeof kcal !== "number") return null;

  return {
    name,
    servingSizeG: parseServingSizeG(data.product.serving_size),
    perG: {
      kcal,
      protein_g: n.proteins_100g ?? 0,
      carbs_g: n.carbohydrates_100g ?? 0,
      fat_g: n.fat_100g ?? 0,
      fiber_g: n.fiber_100g ?? 0,
      sugar_g: n.sugars_100g ?? 0,
      sodium_mg: typeof n.sodium_100g === "number" ? n.sodium_100g * 1000 : 0,
    },
  };
}
