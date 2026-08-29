# Roadmap

Last updated: 2026-08-29 (exercise logging). Reflects the full-app audit (rated 6.5/10 as a
working beta, not yet public-launch-ready) plus a competitive review against
MyFitnessPal, Cronometer, Lose It, and HealthifyMe.

## P0 — Launch blockers (security/trust)

Fix before anyone outside trusted testers uses the app.

1. ✅ **Real authentication** — DONE. Every endpoint used to trust a
   client-sent `device_id` string with zero verification; now every account
   is a real email+password login, resolved server-side from a session
   token. Step-up email code only on a new device or location change
   (Cloudflare's free `request.cf.country` signal), not every login.
   Forgot/reset password included. Currently signup and step-up are both
   set to skip the emailed code (`REQUIRE_EMAIL_VERIFICATION = false` in
   `index.ts`) until a real domain is verified in Resend — right now
   Resend's shared sender can only deliver to the account owner's own
   inbox, so a real user's code would never arrive. Flip that flag back on
   once a domain is verified.
   - **1a. Google / Facebook login** — not started. Plan: OAuth
     "Continue with Google/Facebook" buttons, backend exchanges the
     provider's code for the user's verified email server-side, links to
     an existing account by email or creates a new one, then issues a
     session the same way password login does. Blocked on the user
     creating a Google Cloud OAuth client and a Meta developer app and
     sharing the client ID/secret pairs — nothing on the code side is
     blocked.
2. ✅ **Per-account rate limiting** — DONE. Two caps, both keyed per
   account/email via a generic Durable Object token bucket
   (`KeyedRateLimiterDO`), not per-IP: food logging is capped at
   5/minute and 40/day per account (bounds one account's share of the
   shared 500/day Gemini budget, checked before the Gemini call so a
   denied request never spends quota); login, signup, forgot-password,
   and code verification are each capped at 5 attempts per 15 minutes
   per email (verify-signup/verify-login/reset-password share one
   bucket, since all three are the same "guess a 6-digit code" attack).
   Denied requests get a friendly "try again in N minutes" message.

## P1 — Real risk gaps (at or shortly after launch)

3. ✅ **Account backup/recovery** — DONE. Real accounts (item 1) already
   solved actual recovery: data lives in D1 now, not localStorage, so
   switching phones or clearing site data just means logging back in. The
   remaining gap -- CSV export only covering food logs, not profile/goal/
   streak state -- is closed with a separate "Export my data" action in
   Settings that downloads everything as one JSON file. No import path,
   deliberately: an account already IS the restore mechanism now, nothing
   to import back into.
4. **Legal basics** — no privacy policy, no "these are estimates, not
   medical advice" disclaimer anywhere. Deferred for now, will come back
   to it.
5. **Custom domain + branding** — everything is currently on Cloudflare's
   own subdomains (`*.workers.dev`, `*.pages.dev`) under the placeholder
   name "Nutrition Tracker," which is a description, not a brand. Needs:
   an actual product name, a purchased domain, the Worker (API) and Pages
   (frontend) pointed at branded subdomains of it (straightforward, both
   already run on Cloudflare), and email sent from an address on that
   domain. That last part also unblocks item 1a's `REQUIRE_EMAIL_VERIFICATION`
   flag (currently off because Resend's shared sender can only reach the
   account owner's own inbox) and makes the Google/Facebook OAuth consent
   screens look like a real product instead of a raw `workers.dev` URL.

   **Decided:** name is **Nourly**, domain is **nourly.app**, to be
   bought at Spaceship ($4.98 first year, $14.69/yr renewal). Blocked on
   funds to buy it -- pick this back up once that's sorted.

   **How it'll get wired up once bought:** the user registers the domain
   at Spaceship (only step that needs their login) and switches its
   nameservers to Cloudflare's. Everything after that -- adding the zone
   to the Cloudflare account, DNS records, pointing `app.nourly.app` (or
   similar) at the Pages frontend and an API subdomain at the Worker,
   SSL, and eventually a Resend sending domain on it -- Claude can do
   directly with the same Cloudflare API access already used all
   session for Workers/D1/R2/Pages.

## P2 — Product completeness

6. ✅ **Exercise/activity logging** — DONE. `daily_calorie_target` used to
   come from a fixed `activity_level` baked into the profile and never
   adjusted for what someone actually did that day. Now: a simple
   activity picker (walk/run/cycling/gym/sports/yoga/housework) +
   duration, calories burned via the standard MET formula server-side
   (no AI call, doesn't touch the Gemini budget). Home's ring shows
   target + exercise burned as the real budget; Logs shows food and
   exercise merged into one time-sorted feed, each independently
   deletable.
7. **Macro targets on Home** — calories get a real target + progress bar;
   protein/carbs/fat just show raw totals with nothing to compare against.
8. **Backdating a log** — the backend already supports a custom
   `loggedAt`, but the UI never exposes it. Can't record a forgotten meal
   against the right time (e.g. logging breakfast at dinner time).
9. **Real personalized content** — "Tips for you" on Home is 3 hardcoded
   static tips for everyone, not actually personalized or rotating.
10. **Weight-trend tracking + adaptive coaching** — let people log their
    weight daily, smooth it (e.g. 7-day moving average, not reactive to
    single-day swings), and compare the trend against their goal — keep
    the calorie target if it's working, surface a tip/suggest a
    recalculation if it isn't.

## P3 — Nice-to-have (pull from as capacity allows)

11. **Water tracking** — cheap, expected, low effort, no real downside.
12. **Barcode scanning** — real gap for packaged/branded foods, but not
    core to the differentiator (home-cooked Pakistani dishes). Needs
    either building a barcode/UPC database or integrating a third party
    (e.g. Open Food Facts — free, but weak Pakistani-brand coverage).
13. **Conversational AI coach** — natural extension of the Gemini
    integration already in place (ask it questions, get suggestions, not
    just one-way logging). Real cost risk: the whole rate-limiting setup
    was built around the 500/day free-tier ceiling for logging alone —
    open-ended chat would eat into that fast. Prototype small first.
14. **Urdu / multi-language support** — matters more for this market than
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
