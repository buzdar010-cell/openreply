# Pakistani + common Western food database — v4

83 dishes: 67 composed dishes plus 16 standalone raw fruits/vegetables. Every dish stores **per-100g nutrition**, not one fixed total — see "Why the schema changed" below.

## v4: the rest of the confirmed-URL batch, plus a real inconsistency found

Went back to Tea for Turmeric after the rate limit cleared (paced with delays between requests this time, not fired in parallel). 6 of the remaining 8 confirmed dishes came through clean: `maash_ki_daal`, `kali_daal` (whole masoor), `aloo_methi`, `yakhni_pulao`, `mutton_korma`, `kadhi_pakora`. Two didn't make it in:

- **Achari Chicken** — hit the bot-verification page again on this specific URL even with pacing. Not retried further; still just a name + URL for a future pass.
- **Chicken Kofta** — the recipe came through fine, but it turned out to be a Western-fusion version (panko breadcrumbs, mozzarella/parmesan, olive oil), not a traditional Pakistani kofta curry. Not built — passing that off as an authentic home-cooked dish would have been dishonest, given the whole point of this database is getting Pakistani food actually right.

**A real inconsistency this batch surfaced, not silently fixed:** the newly-sourced `kali_daal` and `maash_ki_daal` use ~50g of cooked lentil per serving (derived directly from a real recipe: 200g lentil, 4 servings). The earlier, self-estimated `chana_daal` and `moong_daal` use 200g of lentil per bowl — roughly 4x more. That's not a rounding difference; it's a real disagreement about what "one bowl of daal" means; a hearty standalone bowl, or a lighter portion eaten as one part of a bigger thali. Both are legitimate framings, but the database currently has both conventions in it at once, inconsistently. Worth a decision before this goes further, not a silent pick on my part.

## v3: real sourced recipes, not estimated ones

The 9 newest dishes (aloo_gosht, gobi_gosht, chana_pulao, palak_chicken, bhindi_masala, sarson_ka_saag, aloo_baingan, chicken_chargha, toriyan) are converted directly from real, published recipes on **Tea for Turmeric** (teaforturmeric.com), a Pakistani/South Asian home-cooking site with real tested quantities — not estimated from scratch the way earlier dishes were. Each recipe's `serving_label` notes the source and how many servings the original recipe made, so the conversion is traceable.

**A real cross-check, not just a hope**: the Chana Pulao source page published its own nutrition figures — 463 kcal, 75g carbs, 11g protein, 14g fat per serving. My independent computation, built purely from their stated ingredient quantities run through our own ingredient database, came out to **481 kcal, 77.9g carbs, 11.7g protein, 13.3g fat** — within ~4% across every field. That's a genuine, external validation that the gram-conversion methodology is sound, not just internally consistent with itself.

Four new base ingredients were added to support these: `mustard_greens_cooked` (sarson), `zucchini_cooked` (toriyan), `corn_flour` (saag thickener), `fenugreek_leaves_dried` (kasuri methi, used in gram-scale flavoring quantities).

## Analogy-built dishes — a different, lower confidence tier

`aloo_chicken`, `arvi_gosht`, `lauki_gosht` are **not** independently sourced. No dedicated recipe for these three was found on Tea for Turmeric or Pakistan Eats despite searching directly. Rather than skip them or invent numbers from nothing, they're built by direct analogy to the sourced `aloo_gosht` recipe — same structure, same ratios, just the vegetable or protein swapped (taro for potato, bottle gourd for potato, chicken for mutton). Their `serving_label` says exactly this, so it's visible in the data itself, not just this README. Arvi gosht and lauki gosht were confirmed as real, commonly-cooked dishes directly by the user (who is Pakistani) — that's real validation of the dish's existence, just not of these specific ratios.

## Hit a real wall partway through this pass

Tea for Turmeric started serving a bot-verification page after repeated rapid requests against the same domain — not a content problem, a rate-limit/anti-bot response. Stopped rather than push through it. Came back after ~2 hours, paced requests with delays, and got through 6 of the remaining 8 (see v4 above). **Still outstanding:**

- Achari Chicken — `teaforturmeric.com/achari-chicken/` (blocked again on this specific URL even with pacing)
- Chicken Kofta — real recipe exists at `teaforturmeric.com/chicken-kofta/`, but it's a Western-fusion version, not traditional — would need a different, more traditional source instead

Also named as existing (from the earlier roundup and Pakistan Eats' homepage) but not yet URL-confirmed for a direct fetch: Rajma Masala, Matar Paneer, Dahi Bhalla, Aloo Tikki, Matar Pulao, Zarda, Hariyali Chicken, Kali Mirch Chicken, Chicken Keema, Prawn Biryani, Seviyan, Sweet Dalia.

## Next steps (not done yet)

- Come back to the 8 confirmed-URL dishes above once the rate limit has cooled off, or pull them from Pakistan Eats/another source instead.
- Chase down the remaining named-but-unconfirmed dishes.
- Decide serving-size conventions with real user feedback once logging starts.
- Turn `dishes.json` into D1 seed data once the app schema exists.

## Files

- `ingredients.json` — ~40 base ingredients, per-100g nutrition. Includes swap-option variants (e.g. `atta_multigrain` alongside `atta_whole_wheat_flour`) and raw fruit/veg with a `unit_g` field for natural "1 medium X" logging.
- `recipes.json` — each dish's recipe. An ingredient entry is either a fixed amount (`"onion_raw": 15`) or a **swappable role** (see below).
- `build_dishes.py` — resolves recipes into `dishes.json`. Re-run after any edit to `recipes.json` or `ingredients.json`.
- `dishes.json` — generated output. Don't hand-edit.

## Why the schema changed (v1 -> v2)

v1 stored one fixed total per dish ("1 slice pizza = 325 kcal"), which broke down immediately on real questions: what size pizza? What if someone cooks with refined flour instead of whole wheat? What if the chicken roast is a leg piece, not a breast piece? A fixed-total-per-dish model can't answer any of that without a new hardcoded dish for every combination.

v2 fixes this two ways:

**1. Per-100g storage, portion resolved at logging time.** Every dish exposes `per_100g` nutrition plus its own `default_serving`. Dishes with genuinely different real-world sizes also expose `portion_presets` — e.g. `pizza_slice_cheese` now has `slice_small_pizza` / `slice_medium_pizza` / `slice_large_pizza` as three real weights, not one guess.

**2. Swappable ingredient roles**, resolved by what the user actually said, not asked as a form. A role entry looks like:
```json
"flour": { "role": "flour", "options": ["atta_whole_wheat_flour", "maida_refined_flour", "atta_multigrain"], "default": "atta_whole_wheat_flour", "grams": 35 }
```
If someone just says "roti," the default applies — nothing is asked. If they say "roti with maida" or "multigrain roti," the parser maps directly to that option. No user-facing form, no extra taps in the common case.

Four roles are modeled this way across the dishes that plausibly vary: **flour** (whole wheat / refined / multigrain), **protein_cut** (chicken breast / thigh, on every chicken dish), **fat** (ghee / cooking oil), **dairy** (regular / low-fat yogurt or milk).

## Chicken roast: the worked example that shaped this design

Chicken roast comes in real, meaningfully different variants — quarter/half/full, and a quarter is specifically either a leg piece or a breast piece, which differ a lot nutritionally (dark meat vs. lean white meat). This is handled as:

- `chicken_roast` — the generic entry, cut unspecified. Uses a **blend** (not a single default) of breast + thigh, because there's no honest single "default" cut for an unspecified quarter — guessing one would be wrong roughly half the time. `portion_presets` gives quarter/half/full as real weights.
- `chicken_roast_leg_quarter` / `chicken_roast_breast_quarter` — separate, simple fixed-ingredient entries for when the cut *is* specified, since half/full naturally contain both cuts anyway (no ambiguity there) but a quarter genuinely is one piece or the other.
- **Important basis note, and a real fix made during this build**: the underlying chicken ingredients (`chicken_breast_cooked`, `chicken_thigh_skin_cooked`) are per-100g *edible meat*, not bone-in as-served weight. The first pass used bone-in-style portion weights (275g/550g/1100g for quarter/half/full) against edible-meat-basis nutrition data, which overstated calories — a full roast came out to 2282 kcal. Recalibrated to edible-meat-weight portions (190g/375g/750g), bringing quarter down to a realistic 394 kcal. Documenting this because it's the same category of error as the samosa/pakora fixes in v1 — mixing two different weight bases without noticing.

## Raw fruits & vegetables — a genuinely different case

These aren't composed recipes; the ingredient *is* the loggable item. Two things that made this its own thing rather than "more dishes":

- Each fruit/veg ingredient carries a `unit_g` (e.g. 1 medium apple ≈ 180g), so natural logging ("I had a banana") maps directly without anyone touching grams.
- They're deliberately prioritized for what's actually eaten in Pakistan, not a generic global fruit list: mango, banana, apple, guava, watermelon, **kinnow** (a citrus Pakistan is a major producer of, and almost certainly absent or poorly modeled in MyFitnessPal-style apps — this is exactly the kind of gap the whole idea is betting on), grapes, pomegranate, dates. Plus vegetables genuinely eaten raw rather than cooked into a dish: cucumber, radish, carrot, and kachumber salad as the first dish built entirely from raw ingredients.

## Full audit log (cumulative)

| Item | Issue found | Fix | Reference basis |
|---|---|---|---|
| Samosa | 227 kcal | oil 15g -> 6g | ~130-150 kcal/piece |
| Pakora | 417 kcal/100g | oil 20g -> 14g | ~300-380 kcal/100g |
| Shami kebab (2pc) | 363 kcal | portions resized to real small-kebab weights | ~150-200 kcal/2pc |
| Chicken roast (full) | 2282 kcal | portion weights recalibrated from bone-in to edible-meat basis | consistency with own ingredient data |

`halwa_puri_halwa` was also renamed to `sooji_halwa` in v1 since it only modeled the halwa component, not the full combo the old name implied.

Every other dish (61 of 65) was checked against known reference ranges and held up — including the richer/riskier ones (nihari, korma, karahi, biryani, gulab jamun, the fast-food entries).

## Known limitations — unchanged from v1, still true

- Serving sizes and swap defaults are "typical," not measured. Real households vary.
- Restaurant/roadside versions run higher than these home-cooked estimates, especially karahi, biryani, and the fast-food entries (which approximate common chain-style versions, not any specific restaurant's actual recipe).
- 65 dishes is still a starting set. Expand based on what people actually try to log and can't find.

Add a one-time profile-level default for flour type (set once at onboarding, applied silently after) — this is a UI/app-layer decision, not a data-file one, so it's not implemented here.
