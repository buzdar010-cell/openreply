# Roadmap

Last updated: 2026-08-28. Reflects the full-app audit (rated 6.5/10 as a
working beta, not yet public-launch-ready) plus a competitive review against
MyFitnessPal, Cronometer, Lose It, and HealthifyMe.

## P0 — Launch blockers (security/trust)

Fix before anyone outside trusted testers uses the app.

1. **Real authentication** — every endpoint currently trusts a client-sent
   `device_id` string with zero verification. Anyone who obtains one has
   permanent full read/write access to that account with no way to revoke it.
2. **Per-device rate limiting** — nothing currently stops one device from
   burning through the whole app's shared Gemini quota (15 RPM / 500 RPD).
   Designed earlier (Cloudflare edge IP rules + per-device cooldown) but
   never actually implemented.

## P1 — Real risk gaps (at or shortly after launch)

3. **Account backup/recovery** — device ID lives only in browser
   localStorage. Clearing site data or switching phones loses everything
   (profile, streaks, log history) forever, no login, no restore. CSV
   export only covers food logs, not profile/goal/streak state, and
   there's no import path at all.
4. **Legal basics** — no privacy policy, no "these are estimates, not
   medical advice" disclaimer anywhere.

## P2 — Product completeness

5. **Exercise/activity logging** *(elevated to must-have)* — completes the
   calorie-target feature already shipped; without it, targets are
   silently wrong for anyone who exercises regularly.
6. **Macro targets on Home** — calories get a real target + progress bar;
   protein/carbs/fat just show raw totals with nothing to compare against.
7. **Backdating a log** — the backend already supports a custom
   `loggedAt`, but the UI never exposes it. Can't record a forgotten meal
   against the right time (e.g. logging breakfast at dinner time).
8. **Real personalized content** — "Tips for you" on Home is 3 hardcoded
   static tips for everyone, not actually personalized or rotating.
9. **Weight-trend tracking + adaptive coaching** — let people log their
   weight daily, smooth it (e.g. 7-day moving average, not reactive to
   single-day swings), and compare the trend against their goal — keep
   the calorie target if it's working, surface a tip/suggest a
   recalculation if it isn't.

## P3 — Nice-to-have (pull from as capacity allows)

10. **Water tracking** — cheap, expected, low effort, no real downside.
11. **Barcode scanning** — real gap for packaged/branded foods, but not
    core to the differentiator (home-cooked Pakistani dishes). Needs
    either building a barcode/UPC database or integrating a third party
    (e.g. Open Food Facts — free, but weak Pakistani-brand coverage).
12. **Conversational AI coach** — natural extension of the Gemini
    integration already in place (ask it questions, get suggestions, not
    just one-way logging). Real cost risk: the whole rate-limiting setup
    was built around the 500/day free-tier ceiling for logging alone —
    open-ended chat would eat into that fast. Prototype small first.
13. **Urdu / multi-language support** — matters more for this market than
    it would for a generic competitor. Worth testing whether Roman Urdu
    text input already works today (Gemini just parses whatever text
    arrives) before committing to a full UI translation effort.

## Explicitly not planned right now

Deliberately parked, not forgotten:

- **Micronutrient tracking** (vitamins/minerals) — would need sourced
  data backfilled for all 228 dishes; wrong nutrition data is worse than
  no data, and it's not what this audience is asking for.
- **Apple Health / wearable sync** — partly blocked by the PWA
  architecture itself: Apple HealthKit isn't accessible to web apps at
  all, only native apps.
- **Recipe import / meal planning** — different use case than "quickly
  log what I already ate."
- **Human expert marketplace** (nutritionist/trainer access) — a
  staffing/business-model feature, not a software one; not viable
  pre-revenue.
- **Social features / leaderboards** — actively rejected, not just
  deprioritized. Gamification was deliberately built low-pressure and
  opt-in because research showed competitive/comparison mechanics
  correlate with disordered-eating risk in this category. Leaderboards
  would undo that on purpose.

## Reference

- Live backend: `https://nutrition-tracker.buzdar0003.workers.dev`
- Live frontend: `https://nutrition-tracker-app-ahu.pages.dev`
- Cloudflare account: Buzdar0003@gmail.com's Account
  (`f96412a263b2bb5af0b28992ad944a3d`)
- 228-dish Pakistani food database, audited twice (see
  `data/dishes.json` and the build/audit scripts alongside it)
