# Pakistani food database — v0

29 dishes across bread, daal/rice, curry, rice dishes, vegetables, snacks, grilled, breakfast, and beverages. Computed, not guessed — see below.

## Files

- `ingredients.json` — per-100g nutrition for ~28 base ingredients (atta, rice, daals, meats, ghee/oil, dairy, common vegetables). Values match standard, well-established nutrition references (USDA FoodData Central-consistent) for these items.
- `recipes.json` — each dish as a real recipe: base ingredients + realistic gram quantities for one typical home-cooked serving.
- `build_dishes.py` — computes dish-level nutrition from the two files above. Run with `python3 build_dishes.py`.
- `dishes.json` — the generated output. Don't hand-edit this file — edit `recipes.json` or `ingredients.json` and re-run the script instead, so the numbers stay traceable to a real recipe.

## Why this method, not just typing numbers

Every dish total here can be traced back to specific ingredients and quantities. That means if one ingredient's data turns out to be off, fixing it in one place and re-running the script corrects every dish that uses it — and anyone (including future us) can check *why* a number is what it is instead of taking it on faith.

## Known limitations — read before trusting this at scale

- **Serving sizes are estimates of "typical," not measured.** Real households vary a lot, especially on oil/ghee. Treat these as a reasonable starting point, not gospel.
- **One correction already made**: the first pass overestimated oil absorption in the samosa recipe (15g → 6g), which had inflated it to 227 kcal against a well-established real-world figure of ~130-150 kcal. Fixed and re-verified. Worth spot-checking a few more dishes against known references before this goes live, rather than assuming every number is already right.
- **Restaurant/roadside versions run higher** than these home-cooked estimates, especially for karahi and biryani (more oil, richer meat cuts). These numbers represent modest home cooking, not restaurant portions — worth surfacing that distinction in the app rather than pretending one number covers both.
- **29 dishes is a starting set**, not the full list. Expand based on what people actually try to log and can't find — that's a better prioritization signal than guessing the next 50 dishes up front.

## Next steps (not done yet)

- Spot-check remaining dishes (especially the richer curries) against known reference values.
- Decide serving-size conventions with real user feedback once logging starts.
- Turn `dishes.json` into D1 seed data once the app schema exists.
