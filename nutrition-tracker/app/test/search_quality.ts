/**
 * Regression test for candidateSearch.ts, loading the real 228-dish database
 * directly from nutrition-tracker/data/dishes.json (the source of truth) --
 * self-contained, no manual setup required.
 *
 * Exists because the naive first version of the scoring function passed
 * every hand-picked small test but failed silently against the real,
 * full-size database: "chicken karahi and two rotis" never shortlisted
 * `roti` at all, because common words like "chicken" (in dozens of dish
 * names) drowned out roti's one specific, rare match, and the raw
 * (unstripped) serving_label was polluting the index with confidence-tier
 * disclosure boilerplate. Fixed with IDF weighting + a stopword filter +
 * indexing the cleaned label -- this test locks that fix in place.
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { buildSearchIndex, shortlist, type DishRecord } from "../src/candidateSearch.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dishesPath = join(__dirname, "..", "..", "data", "dishes.json");

interface DishesFile {
  dishes: Record<string, { category: string; serving_label: string }>;
}

const raw: DishesFile = JSON.parse(readFileSync(dishesPath, "utf-8"));
const records: DishRecord[] = Object.entries(raw.dishes).map(([dish_id, d]) => ({
  dish_id,
  category: d.category,
  serving_label: d.serving_label,
}));

const index = buildSearchIndex(records);

interface TestCase {
  query: string;
  mustInclude: string[]; // dish_ids that MUST appear in the shortlist
}

const cases: TestCase[] = [
  {
    query: "chicken karahi and two rotis, chicken thigh",
    mustInclude: ["chicken_karahi", "roti"],
  },
  { query: "one samosa", mustInclude: ["samosa"] },
  { query: "gol gappay", mustInclude: ["gol_gappay"] },
  { query: "chicken biryani with extra raita", mustInclude: ["chicken_biryani", "raita"] },
  { query: "I had a bowl of daal chawal", mustInclude: ["daal_chawal_masoor"] },
  { query: "bun kebab and a mango shake", mustInclude: ["bun_kebab", "mango_shake"] },
];

let failures = 0;
for (const { query, mustInclude } of cases) {
  const results = shortlist(index, query, 12).map((r) => r.dish_id);
  const missing = mustInclude.filter((id) => !results.includes(id));
  if (missing.length > 0) {
    console.error(`FAIL: "${query}" -- missing ${missing.join(", ")} from [${results.join(", ")}]`);
    failures++;
  } else {
    console.log(`PASS: "${query}" -- found ${mustInclude.join(", ")}`);
  }
}

console.log(`\n${cases.length - failures}/${cases.length} passed`);
if (failures > 0) process.exit(1);
