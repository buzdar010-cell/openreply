import { buildSearchIndex, shortlist, type DishRecord } from "../src/candidateSearch.ts";
import { parseTextLog } from "../src/parseLog.ts";

const sampleDishes: DishRecord[] = [
  { dish_id: "chicken_karahi", category: "curry", serving_label: "1 serving (~1/4 karahi)" },
  { dish_id: "chicken_curry", category: "curry", serving_label: "1 serving" },
  { dish_id: "kali_mirch_chicken", category: "curry", serving_label: "1 serving, black pepper chicken curry (sourced: Pakistan Eats, 6 servings)" },
  { dish_id: "chicken_handi", category: "curry", serving_label: "1 serving, restaurant-style creamy chicken curry" },
  { dish_id: "mutton_karahi", category: "curry", serving_label: "1 serving" },
  { dish_id: "roti", category: "bread", serving_label: "1 medium roti (~40g)" },
  { dish_id: "naan", category: "bread", serving_label: "1 tandoori naan" },
  { dish_id: "chicken_biryani", category: "rice_dish", serving_label: "1 plate" },
];

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY not set");
  process.exit(1);
}

const index = buildSearchIndex(sampleDishes);
const query = "chicken karahi and two rotis, chicken thigh";
const candidates = shortlist(index, query, 12);

console.log("Shortlisted candidates:", candidates.map((c) => c.dish_id));

const result = await parseTextLog(query, candidates, apiKey);
console.log("Parsed result:", JSON.stringify(result, null, 2));
