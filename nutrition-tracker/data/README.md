# Pakistani + common Western food database — v9

140 dishes: 124 composed dishes plus 16 standalone raw fruits/vegetables. Every dish stores **per-100g nutrition**, not one fixed total — see "Why the schema changed" below.

## v9: Ramadan / iftar & sehri foods

Scoped against what was already in the database first — most sehri staples (paratha, omelette, daal, karahi, chana pulao, yogurt/lassi, dates, banana, watermelon) and most iftar starters (samosa, pakora, dahi bhalla, chana chaat, haleem, nihari) were already built in earlier batches. 9 dishes were genuinely missing:

`jalebi`, `sheer_khurma` (distinct from the already-built `seviyan` — sheer khurma has dates and far more milk), `kulfi`, `fruit_custard` — iftar/Eid sweets. `fruit_chaat` — a fixture of almost every iftar spread. `puri` — deep-fried bread that completes the halwa-puri-channa combo `sooji_halwa` was flagged as missing back in v1. `rooh_afza_sharbat`, `jaljeera`, `date_milk_shake` — the drinks iftar starts with, since breaking a fast starts with liquid before food.

None of these come from a specific published recipe with a stated serving count — same situation as v8's condiments, just for full dishes/desserts/drinks instead of spoonful accompaniments. Built from typical realistic serving proportions instead, with `serving_label` saying so plainly. All 9 checked against real-world calorie references for these specific items and held up — no corrections needed.

One new base ingredient: `rose_syrup_concentrate` (Rooh Afza-style concentrated syrup).

## v8: chutneys, pickles/achaar, and raita — a new category, and a different shape of dish

13 condiments: 5 chutneys (`hari_chutney`, `imli_chutney`, `lehsun_chutney`, `mango_chutney`, `tamatar_chutney`), 7 pickles/achaar (`aam_ka_achaar`, `mixed_achaar`, `nimbu_ka_achaar`, `mirch_ka_achaar`, `lehsun_ka_achaar`, `gajar_ka_achaar`, `shalgam_ka_achaar`), and `raita`. New `condiment` category added for all 13.

These are structurally different from every dish built so far: they're not meals, they're accompaniments, eaten in real portions of 1 tsp–2 tbsp (10-30g), not a bowl or plate. None of them come from a specific published recipe with a stated serving count — pickles and chutneys are made in big batches and eaten a spoonful at a time, so there's no "1 recipe = N servings" to convert. Instead each one is built from realistic small-serving proportions for that condiment, and the `serving_label` says so plainly rather than implying a sourced recipe. Checked against real-world per-tablespoon calorie references for oil-preserved pickles and chutneys and all held up (pickles ~50-65 kcal/tbsp given the oil content, chutneys lower except tamarind's sugar-heavy 94 kcal/2 tbsp) — no corrections needed.

Seven new base ingredients, several for things that had only ever been background flavoring before and needed real nutrition data now that they're a dish's primary ingredient: `mint_coriander_leaves_raw`, `tamarind_pulp`, `garlic_raw`, `raw_green_mango` (unripe keri — nutritionally distinct from the existing ripe `mango_raw`), `lemon_lime_raw`, `green_chili_raw`, `turnip_raw`.

## v7: regional variants — Sindh, KPK/Pashtun belt, Balochistan, Kashmir/Gilgit-Baltistan

Everything up to v6 was Punjab-leaning (most "generic Pakistani" home cooking is Punjabi). This batch adds 21 dishes distinct to the other regions, scoped and confirmed with the user first.

**5 sourced from real recipes with real quantities** (grams ÷ stated servings, same methodology as every prior batch):
- `sindhi_biryani` (Fauzia's Kitchen Fun, 8 servings), `sai_bhaji` (Archana's Kitchen, 4 servings), `sindhi_kadhi` (Whiskaffair, 6 servings) — Sindh
- `kabuli_pulao` (The Foreign Fork, 6 servings) — KPK/Pashtun belt
- `kashmiri_pulao` (Veg Recipes of India, 3 servings) — Kashmir

**16 built by analogy to an already-sourced dish**, not independently sourced — each one's `serving_label` says so explicitly and names which dish it's modeled on: `koki`, `palla_machi`, `took_aloo` (Sindh); `peshawari_naan`, `charsi_tikka`, `peshawari_kahwa`, `kachalo`, `peshawari_falooda` (KPK); `sajji`, `balochi_rosh`, `kaak`, `dampukht` (Balochistan); `mamtu`, `thukpa`, `ghoshtaba`, `kashmiri_chai` (Kashmir/Gilgit-Baltistan). This is a lower-confidence tier than the sourced dishes, same as `aloo_chicken`/`arvi_gosht`/`lauki_gosht` in v3 — real, commonly-eaten dishes, but ratios estimated rather than measured from a published recipe.

Two things skipped rather than forced: Khaddi Kebab and Landhi (Balochistan) don't translate to a loggable single-serving dish — one is a whole lamb roasted in a trench, the other is preserved dried meat. Prapu and Chapshoro (Gilgit-Baltistan) were skipped for lack of any reliable nutrition reference for their apricot-oil/walnut-paste bases.

**Two corrections made during the audit pass**, same discipline as every prior batch — flagged and fixed, not silently accepted:
- `sindhi_biryani` initially computed to 870 kcal for a 572g "plate" — the source recipe (5 cups rice, 1kg meat, 4 potatoes ÷ 8) is sized for a family gathering, and dividing straight through produced an oversized single serving next to every other biryani/pulao in the database. Scaled down ~0.66x to 575 kcal / 379g, matching chicken_biryani (653/340g) and yakhni_pulao (600/374g).
- `mamtu`: "4 dumplings" at 100g total worked out to 25g/dumpling, too small for a real steamed dumpling. Rescaled to ~40g/dumpling (425 kcal/160g total).

Five new base ingredients: `dried_plums_prunes` (aloo bukhara, Sindhi biryani), `green_beans_cooked` (sai bhaji), `mixed_nuts_dry` (generic almond/cashew/walnut average — used across pulaos and naan garnish rather than adding a separate ingredient per nut type), `raisins_dry`, `coconut_desiccated` (Peshawari naan filling).

## v6: the original 14 "remaining recipes" list is now fully cleared

The 6 dishes v5 couldn't find on Pakistan Eats turned out to exist — just not under a site-restricted search on that one domain. A broader search found all of them:

- `rajma_masala` (379 kcal/bowl), `matar_paneer` (451 kcal/bowl), `dahi_bhalla` (186 kcal/serving), `zarda` (377 kcal/portion) — real recipes on **Tea for Turmeric**.
- `sweet_dalia` (221 kcal/bowl), `prawn_biryani` (499 kcal/plate) — real recipes on **Pakistan Eats**, just not surfaced by the earlier site-search wording.
- **Chicken Kofta**: still not built, and for a real reason rather than a sourcing gap. Every Chicken Kofta recipe found (including the one flagged in v4) is a Western-fusion take. Traditional Pakistani kofta curry is a beef/mutton mince meatball curry, not a chicken dish — so instead of forcing a chicken version, built `beef_kofta_curry` (401 kcal/serving) as the actual traditional dish, from a real Tea for Turmeric recipe, with a note on the dish itself explaining why chicken wasn't used.

All 7 new dishes checked against real-world reference ranges for these dishes and held up — no corrections needed this batch.

Three new base ingredients were added: `kidney_beans_cooked` (rajma), `cracked_wheat_dry` (dalia, raw/dry weight before cooking in milk), `prawns_cooked` (shrimp/prawns, cooked).

**Roadmap addition (from the user, not built yet):** weight-loss / weight-gain goal variants of dishes — lighter or higher-calorie versions of the same recipes people actually cook when trying to lose or gain weight (e.g. grilled instead of fried, less oil, boiled-chicken-breast curry versions, higher-protein versions). Queued after the phases below.

## v5: 7 of the 14 "remaining recipes" sourced from Pakistan Eats

Went back to the list of 14 named-but-unbuilt dishes from v4. Rather than keep hammering Tea for Turmeric, pulled these from **Pakistan Eats** (pakistaneats.com) instead — real published recipes with stated ingredient quantities and serving counts, same conversion method as the Tea for Turmeric batches (grams ÷ servings).

Built this pass: `achari_chicken` (438 kcal/serving), `matar_pulao` (574 kcal/plate), `chicken_keema` (367 kcal/serving), `hariyali_chicken` (410 kcal/serving), `kali_mirch_chicken` (402 kcal/serving), `aloo_tikki` (164 kcal/patty), `seviyan` (364 kcal/bowl). All checked against real-world reference ranges for these dishes and held up — no corrections needed this batch (unlike v1's samosa/pakora/kebab fixes).

Three new base ingredients were needed and added to `ingredients.json`: `peas_cooked` (matar, for matar_pulao), `chicken_mince_cooked` (ground chicken, for chicken_keema — distinct from the existing beef mince entry), `vermicelli_dry` (seviyan, raw/dry weight before cooking in milk).

**Still not found** (searched Pakistan Eats directly, no match): Rajma Masala, Matar Paneer, Dahi Bhalla, Zarda, Sweet Dalia, Prawn Biryani, and a *traditional* (non-fusion) Chicken Kofta — the recipe found on Tea for Turmeric in v4 was Western-fusion (panko, mozzarella, olive oil) and wasn't built for that reason. These 6-7 will need a different source in a future pass.

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

All 14 originally-named "remaining recipes" are now built, across v5 and v6 (see v6 above for the last 6 plus the beef-kofta-curry resolution).

## Next steps (not done yet)

- Regional variants (v7), chutneys/pickles/raita (v8), and Ramadan foods (v9) are done. Next per the agreed roadmap: expanded Western fast food.
- **Weight-loss / weight-gain goal variants** (added to the roadmap by the user, not built yet): lighter/"diet" and higher-calorie/bulking versions of dishes people actually cook when trying to lose or gain weight — e.g. grilled instead of fried, less oil/ghee, boiled chicken breast versions of curries, protein-added versions for weight gain. Comes after the phases above; not scoped in detail yet.
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
