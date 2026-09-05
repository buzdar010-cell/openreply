"""
Computes dish-level nutrition from ingredients.json + recipes.json.

Handles two kinds of recipe ingredient entries:
  - fixed:  "onion_raw": 15                          -> exactly that ingredient, that many grams
  - role:   "protein": {"role": "protein_cut",
                         "options": [...],
                         "default": "chicken_thigh_skin_cooked",  # OR "blend": [...]
                         "grams": 150}
            A role with "default" resolves to that one ingredient's nutrition.
            A role with "blend" (no single default makes sense, e.g. chicken roast
            with no cut specified) resolves to the average of the listed ingredients'
            per-100g nutrition.

Outputs, per dish:
  - per_100g: nutrition per 100g, so the app can scale to any portion the user
    actually logs (a real fix for "we don't know if it's a small/medium/large
    slice" — store the rate, not one fixed total).
  - default_serving_g + default_serving: the recipe's own total weight and
    nutrition, i.e. what you get if nothing is swapped or resized.
  - portion_presets (if the dish defines any): named real-world portion sizes
    (pizza slice sizes, chicken roast quarter/half/full) computed from per_100g.

These are recipe-based estimates, not lab-measured values.
"""
import json
from pathlib import Path

DATA_DIR = Path(__file__).parent
FIELDS = ["kcal", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g", "sodium_mg"]

with open(DATA_DIR / "ingredients.json") as f:
    ingredients = json.load(f)
with open(DATA_DIR / "recipes.json") as f:
    recipes = json.load(f)


def ingredient_per_100g(ing_id):
    ing = ingredients[ing_id]
    return {field: ing.get(field, 0.0) for field in FIELDS}


def resolve_entry(entry):
    """Returns (per_100g nutrition dict, grams) for one ingredient-list entry."""
    if isinstance(entry, (int, float)):
        raise ValueError("resolve_entry expects (key, value) handled by caller for fixed entries")
    grams = entry["grams"]
    if "default" in entry:
        per_100g = ingredient_per_100g(entry["default"])
    elif "blend" in entry:
        blend_ids = entry["blend"]
        per_100g = {field: 0.0 for field in FIELDS}
        for ing_id in blend_ids:
            src = ingredient_per_100g(ing_id)
            for field in FIELDS:
                per_100g[field] += src[field] / len(blend_ids)
    else:
        raise ValueError(f"role entry has neither 'default' nor 'blend': {entry}")
    return per_100g, grams


def scale(per_100g, grams):
    factor = grams / 100.0
    return {field: per_100g[field] * factor for field in FIELDS}


dishes = {}
for dish_id, recipe in recipes.items():
    if dish_id.startswith("_"):
        continue

    totals = {field: 0.0 for field in FIELDS}
    total_weight = 0.0

    for key, value in recipe["ingredients"].items():
        if isinstance(value, dict):
            per_100g, grams = resolve_entry(value)
            contribution = scale(per_100g, grams)
        else:
            grams = value
            contribution = scale(ingredient_per_100g(key), grams)
        for field in FIELDS:
            totals[field] += contribution[field]
        total_weight += grams

    per_100g_dish = {field: round(totals[field] * 100.0 / total_weight, 2) for field in FIELDS}

    entry = {
        "category": recipe["category"],
        "serving_label": recipe["serving_label"],
        "default_serving_g": round(total_weight, 1),
        "per_100g": per_100g_dish,
        "default_serving": {field: round(totals[field], 1) for field in FIELDS},
    }

    if "portion_presets" in recipe:
        entry["portion_presets"] = {}
        for preset_name, preset_grams in recipe["portion_presets"].items():
            entry["portion_presets"][preset_name] = {
                "grams": preset_grams,
                **{field: round(per_100g_dish[field] * preset_grams / 100.0, 1) for field in FIELDS},
            }

    dishes[dish_id] = entry

output = {
    "_readme": (
        "Computed dish-level nutrition. Every dish exposes per_100g (scale to any "
        "portion) plus default_serving (the recipe's own typical portion) and, where "
        "relevant, named portion_presets. Derived from ingredients.json + recipes.json "
        "via build_dishes.py — see that script and README.md for methodology. "
        "Estimates, not lab measurements."
    ),
    "dishes": dishes,
}

with open(DATA_DIR / "dishes.json", "w") as f:
    json.dump(output, f, indent=2)

print(f"Built {len(dishes)} dishes -> dishes.json\n")
for dish_id, d in sorted(dishes.items()):
    ds = d["default_serving"]
    print(f"  {dish_id:28s} {ds['kcal']:6.0f} kcal  |  P {ds['protein_g']:5.1f}g  C {ds['carbs_g']:5.1f}g  F {ds['fat_g']:5.1f}g   ({d['serving_label']}, {d['default_serving_g']}g)")
    if "portion_presets" in d:
        for name, p in d["portion_presets"].items():
            print(f"      -> {name:22s} {p['kcal']:6.0f} kcal  ({p['grams']}g)")
