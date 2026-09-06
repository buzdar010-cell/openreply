# Roadmap

Last updated: 2026-09-06 (monitoring kickoff + billing infrastructure, paused). Reflects the full-app audit (rated 6.5/10 as a
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
4. ✅ **Legal basics** — DONE. New Settings → "Privacy & Disclaimer"
   sub-screen: not-medical-advice disclaimer, what's collected, how it's
   used, which third parties are involved (Cloudflare, Gemini, Open Food
   Facts, Resend, Paddle), and how to request account deletion by email
   until a self-serve option (item 6) exists. Short one-line disclaimer
   also added to the Settings footer for visibility. Also removed the
   "Reset app" button while in here -- real risk of a tester tapping it
   by accident, no benefit now that real accounts exist.
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
   bought at Spaceship ($4.98 first year with promo code `SPSR86`,
   $14.69/yr renewal). Blocked on funds to buy it, but very close --
   about PKR 200-260 short as of 2026-09-06. Pick this back up once
   that's sorted.

   **How it'll get wired up once bought:** the user registers the domain
   at Spaceship (only step that needs their login) and switches its
   nameservers to Cloudflare's. Everything after that -- adding the zone
   to the Cloudflare account, DNS records, pointing `app.nourly.app` (or
   similar) at the Pages frontend and an API subdomain at the Worker,
   SSL, and eventually a Resend sending domain on it -- Claude can do
   directly with the same Cloudflare API access already used all
   session for Workers/D1/R2/Pages.
6. **Self-serve account deletion** — Export exists (Settings → "Export my
   data"), but there's no way to actually delete an account and its data
   without a direct database query. Real gap on its own, and something
   app stores (item 16 below) require if this ever gets listed there.
7. **CI (automated tests on every push)** — every test that exists today
   (backend: typecheck + the goal-calc/search/content/weight-trend/
   web-push regression tests; frontend: typecheck + lint) only runs
   because it's run manually, in-session, before each deploy. A GitHub
   Actions workflow running the same commands on every push would catch
   a regression automatically regardless of who's making the change,
   instead of depending on that discipline holding forever -- worth
   doing now that there's real shared logic a change in one place could
   quietly break elsewhere (e.g. resolvePortion.ts is now used by food,
   photo, *and* barcode logging).
8. ✅ **Monitoring & alerting** — DONE (core). Delivery channel is Slack
   (not Telegram/push -- Telegram's banned in Pakistan without a VPN, push
   notifications don't work well for the user), via `SLACK_WEBHOOK_URL`
   stored as a Worker secret.

   Real-time, no polling delay: every backend error (the existing single
   top-level catch block now also posts to Slack, alongside its existing
   `error_logs` insert) and every frontend crash (new global
   `window.onerror`/`unhandledrejection` handler in `main.tsx` reporting to
   a new `POST /client-error`, globally rate-limited so a runaway loop
   can't spam the channel). Every 15 minutes: pings both live deploys,
   alerts on a 5xx or network failure (can't catch Cloudflare fully
   dropping the Worker itself -- a real limit, would need an external
   service for that specific case). Once daily: one Slack message
   combining today's activity (signups, food/exercise/water/weight logs,
   unmatched scans, errors) with all-time business totals (total/premium/
   free users, MRR computed from each subscriber's actual billing period,
   not just a head-count). All pieces live-verified against production
   (`error_logs` rows confirmed for both a real and a test-triggered
   error; daily-summary SQL run directly against prod data; both uptime
   URLs confirmed to read as healthy).

   **Not done, lower priority than what shipped:** version-staleness
   detection (tag deploys with a build id, alert when devices are stuck on
   an old one) and real server-side session verification on app load
   (defense-in-depth against a repeat of the "stuck on stale build, no
   login shown" bug -- the frontend crash reporting above would likely
   already catch a recurrence of that specific class of bug). Pick up
   later if it seems worth it.
9. **Security polish** — CORS is currently wildcard-open
   (`Access-Control-Allow-Origin: "*"`); fine while everything's on
   workers.dev/pages.dev, should tighten to the real domain once item 5
   lands. Signup also has no bot/abuse protection beyond the existing
   rate limits -- cheap to add, not urgent pre-launch.

## P2 — Product completeness

10. ✅ **Exercise/activity logging** — DONE. `daily_calorie_target` used to
    come from a fixed `activity_level` baked into the profile and never
    adjusted for what someone actually did that day. Now: a simple
    activity picker (walk/run/cycling/gym/sports/yoga/housework) +
    duration, calories burned via the standard MET formula server-side
    (no AI call, doesn't touch the Gemini budget). Home's ring shows
    target + exercise burned as the real budget; Logs shows food and
    exercise merged into one time-sorted feed, each independently
    deletable.
11. ✅ **Macro targets on Home** — DONE. Protein/carbs/fat used to show raw
    totals with nothing to compare against. Targets now computed at profile
    save (protein by bodyweight at 1.6 g/kg, fat at 30% of calories, carbs
    get the remainder -- the standard approach mainstream macro
    calculators use) and stored alongside daily_calorie_target. Each
    macro card on Home shows its own progress bar now, with a clean
    "set a goal for a target" fallback before a profile exists.
12. ✅ **Backdating a log** — DONE. Both food and exercise logging gained
    a small "When" field (defaults to now, only touched to backdate) that
    actually sends the backend's already-existing `loggedAt` support,
    which nothing in the frontend was using before this.
13. ✅ **Real personalized content** — DONE. "Tips for you" was 3 hardcoded
    static tips for everyone. Now a hand-written library (78 tips, 9 short
    articles -- not AI-generated, so it costs nothing and can't drift into
    made-up advice) matched against real signals from someone's own logs
    (sodium/protein trends, most-logged dishes, days since exercise, goal),
    seeded by day so picks rotate without needing to persist state. Home
    gained a "Worth a read" articles section with a full-screen reader.
14. ✅ **Weight-trend tracking + adaptive coaching** — DONE. New "Weight"
    mode in the log sheet; Home shows a trend card (7-day rolling average
    vs. the prior 7 days, hand-rolled SVG sparkline over the last 14
    days) comparing the actual weekly rate against what the goal implies
    (~0.5kg/week lose or gain, flat for maintain) via plain arithmetic —
    no AI, and it only ever surfaces a "recheck your profile" nudge, never
    auto-changes the calorie target. Paired with reminders so the trend
    actually has data to work with: an in-app banner after 24h+ since the
    last log, plus an opt-in "Weight log reminders" toggle in Settings
    that subscribes to real Web Push (implemented natively via Web
    Crypto — VAPID + RFC 8291 payload encryption, checked against the
    spec's own test vectors — rather than a library), delivered by a
    daily Cron Trigger to anyone overdue who's opted in.
15. ✅ **Daily todo checklist on Home** — DONE. A "Today's checklist" card
    above Tips with four items (weight, water, a meal, exercise), each
    computed server-side from real state via a new `/todo` endpoint —
    same no-AI/real-signals approach as tips/trend. Water tracking got
    pulled forward from P3 to support it: new water_logs table,
    log/list/delete endpoints, and a "Water" mode in the log sheet
    (quick +250/500/750/1000ml buttons + custom amount), with a daily
    target at 35ml/kg bodyweight (2500ml default with no profile). Each
    checklist row opens straight into the matching log-sheet mode.
    Paired with relocating "Worth a read" off Home into a "Learn" row in
    Settings (same article list + reader, just relocated) — Home stays
    focused on the actionable checklist. Weight and water logs are also
    merged into the Logs screen's feed alongside food/exercise, each
    reviewable and deletable the same way.
16. **App store presence (Play Store via TWA)** — right now this is
    PWA-only (Add to Home Screen from a browser). A lot of the target
    audience discovers and trusts apps through the Play Store
    specifically, not by installing a web app from a browser menu --
    probably the single biggest gap between "works well" and "feels
    like a real app." Wrapping this PWA for the Play Store via a
    Trusted Web Activity is realistic without a rebuild; the App Store
    is harder since Apple is stricter about PWA wrappers and would need
    more thought.
17. **Admin dashboard** — reviewing unmatched foods/barcodes and
    correcting mismatches happens through raw `/admin/*` JSON endpoints
    today. Fine while Claude is the one maintaining it, not fine for
    anyone else to operate.

## P3 — Nice-to-have (pull from as capacity allows)

18. ✅ **Barcode scanning** — DONE. Live camera scanning (`@zxing/browser`,
    lazy-loaded so its ~200KB doesn't hit everyone's bundle) with manual
    number entry always available alongside, not just as a fallback.
    Pipeline: our own dishes table (barcode-sourced rows are dish_id
    "upc_<code>", so a scanned product is instantly searchable/loggable
    through every existing dish mechanism) -> Open Food Facts (free, no
    cost -- decent for multinational brands sold in Pakistan, thin for
    local-only ones) -> if both miss, the app asks for a photo of the
    nutrition label and Gemini vision extracts it (reuses the same
    model/call shape and shared rate-limit budget as photo food-logging).
    A still-unreadable label gets queued for manual review, same pattern
    as unmatched text logs. Caught and fixed a real navigation bug along
    the way: nesting independent back-dismiss hooks three overlays deep
    (sheet -> barcode flow -> scanner) cascaded a close of any one of
    them into closing all three; fixed with a single two-level history
    handler on the sheet, mirroring the pattern Settings' sub-screens
    already used.
19. **Conversational AI coach** — natural extension of the Gemini
    integration already in place (ask it questions, get suggestions, not
    just one-way logging). Real cost risk: the whole rate-limiting setup
    was built around the 500/day free-tier ceiling for logging alone —
    open-ended chat would eat into that fast. Prototype small first.
20. **Urdu / multi-language support** — matters more for this market than
    it would for a generic competitor. Worth testing whether Roman Urdu
    text input already works today (Gemini just parses whatever text
    arrives) before committing to a full UI translation effort.
21. **Offline support** — it's a PWA with asset caching (the service
    worker precaches the app shell), but logging food/water/weight/
    exercise still requires a live connection -- no offline
    queue-and-sync. Worth deciding whether "works offline" is actually a
    promise to make before building it; a real lift either way.
22. **Monetization / business model** — decided: free/cheap for
    Pakistan-based users, real paid tier ($4.99/mo, ~$39.99/yr) for
    diaspora users abroad, via Paddle (merchant-of-record -- Stripe
    doesn't onboard Pakistan-based sellers) with Payoneer payout.

    **Infrastructure built, intentionally paused.** `subscription_tier`
    on `users`, tiered gating on the 3 Gemini-consuming endpoints (free
    cap and premium cap, both bounded to protect the shared 500/day
    Gemini budget -- premium is NOT literally unlimited), `GET
    /subscription`, and a HMAC-verified `POST /webhooks/paddle` all
    exist and are deployed. **But this got built before it should have**
    -- monetizing wasn't actually ready (app isn't thoroughly tested,
    only one real account exists) -- so the free-tier cap is currently
    loosened back to the pre-billing 40/day (see `LOG_DAILY_CAP_FREE` in
    `index.ts`) and nothing past the backend exists yet: no Paddle
    account, no frontend checkout UI, no live-tested webhook. Revisit
    once testing is further along; picking this back up needs the user
    to create a Paddle account/product/prices first (walkthrough already
    given), then the frontend checkout + real webhook verification.

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
