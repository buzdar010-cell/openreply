"""
Computes dish-level nutrition from ingredients.json + recipes.json.

Why this exists rather than typing dish totals directly: it keeps the
methodology auditable — anyone can check which ingredients and quantities
produced a given number, and re-run this after refining a single
ingredient's data instead of re-deriving every dish by hand.

These are recipe-based estimates, not lab-measured values. Real oil/ghee
quantities vary a lot by household — treat this as a reasonable starting
point to seed the app, refine against user feedback once people are
actually logging meals.
"""
import json
from pathlib import Path

DATA_DIR = Path(__file__).parent

with open(DATA_DIR / "ingredients.json") as f:
    ingredients = json.load(f)
with open(DATA_DIR / "recipes.json") as f:
    recipes = json.load(f)

FIELDS = ["kcal", "protein_g", "carbs_g", "fat_g", "fiber_g"]

dishes = {}
for dish_id, recipe in recipes.items():
    if dish_id.startswith("_"):
        continue
    totals = {field: 0.0 for field in FIELDS}
    for ing_id, grams in recipe["ingredients"].items():
        ing = ingredients[ing_id]
        factor = grams / 100.0
        for field in FIELDS:
            totals[field] += ing.get(field, 0.0) * factor

    dishes[dish_id] = {
        "category": recipe["category"],
        "serving_label": recipe["serving_label"],
        **{field: round(totals[field], 1) for field in FIELDS},
    }

output = {
    "_readme": (
        "Computed dish-level nutrition per typical serving. Derived from "
        "ingredients.json + recipes.json via build_dishes.py — see that "
        "script for methodology. Estimates, not lab measurements."
    ),
    "dishes": dishes,
}

with open(DATA_DIR / "dishes.json", "w") as f:
    json.dump(output, f, indent=2)

print(f"Built {len(dishes)} dishes -> dishes.json")
for dish_id, d in sorted(dishes.items()):
    print(f"  {dish_id:28s} {d['kcal']:6.0f} kcal  |  P {d['protein_g']:5.1f}g  C {d['carbs_g']:5.1f}g  F {d['fat_g']:5.1f}g   ({d['serving_label']})")
