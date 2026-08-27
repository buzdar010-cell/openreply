# Pakistani + common Western food database — v1

49 dishes: the original 29 Pakistani home-cooking staples plus 20 more — 12 additional Pakistani dishes (kebabs, kormas, desserts) and 8 Western/fast-food items that are genuinely common in Pakistan (burgers, pizza, fries, shawarma, pasta, chowmein, manchurian). Computed, not guessed — see below.

## Files

- `ingredients.json` — per-100g nutrition for ~28 base ingredients (atta, rice, daals, meats, ghee/oil, dairy, common vegetables). Values match standard, well-established nutrition references (USDA FoodData Central-consistent) for these items.
- `recipes.json` — each dish as a real recipe: base ingredients + realistic gram quantities for one typical home-cooked serving.
- `build_dishes.py` — computes dish-level nutrition from the two files above. Run with `python3 build_dishes.py`.
- `dishes.json` — the generated output. Don't hand-edit this file — edit `recipes.json` or `ingredients.json` and re-run the script instead, so the numbers stay traceable to a real recipe.

## Why this method, not just typing numbers

Every dish total here can be traced back to specific ingredients and quantities. That means if one ingredient's data turns out to be off, fixing it in one place and re-running the script corrects every dish that uses it — and anyone (including future us) can check *why* a number is what it is instead of taking it on faith.

## Full audit log

Every dish (all 49) was checked against known real-world reference ranges for that item — not just spot-checked. Three real errors were found and fixed, all from the same root cause (overestimating oil/fat absorption in fried or rich dishes):

| Dish | First-pass result | Fix | Corrected result | Reference range |
|---|---|---|---|---|
| Samosa | 227 kcal | oil 15g → 6g | 147 kcal | ~130–150 kcal/piece |
| Pakora | 417 kcal/100g | oil 20g → 14g | 364 kcal/100g | ~300–380 kcal/100g |
| Shami kebab (2pc) | 363 kcal | mince/daal/egg/oil all reduced to real small-kebab portions | 210 kcal | ~150–200 kcal/2pc |

Also fixed: `halwa_puri_halwa` was renamed to `sooji_halwa` and its serving label clarified — it only represents the halwa component, not the full halwa-puri-channa breakfast combo. The original name implied more than the recipe actually modeled.

Everything else (46 of 49 dishes, plus all 40 ingredients) fell within plausible real-world reference ranges on review — including the richer dishes (nihari, korma, karahi, biryani, gulab jamun) that could plausibly have been over- or under-estimated given how much oil/ghee/sugar varies by household. Nothing else needed correction, but "checked and fine" is a real finding here, not a rubber stamp — each one was compared against a known range, not assumed correct by default.

## Known limitations — read before trusting this at scale

- **Serving sizes are estimates of "typical," not measured.** Real households vary a lot, especially on oil/ghee. Treat these as a reasonable starting point, not gospel.
- **Restaurant/roadside versions run higher** than these home-cooked estimates, especially for karahi, biryani, and the fast-food items (pizza/burger cheese content varies a lot by chain). These numbers represent modest, typical portions — worth surfacing that distinction in the app rather than pretending one number covers both.
- **The Western/fast-food entries are approximations of common chain-style versions** (zinger burger, pizza slice, etc.), not any specific restaurant's actual recipe — real values vary by chain and will need refinement once compared against real menus.
- **49 dishes is still a starting set**, not the full list. Expand based on what people actually try to log and can't find — that's a better prioritization signal than guessing the next 50 dishes up front.

## Next steps (not done yet)

- Continue expanding toward the full common Pakistani + Western-in-Pakistan dish list.
- Decide serving-size conventions with real user feedback once logging starts.
- Turn `dishes.json` into D1 seed data once the app schema exists.
