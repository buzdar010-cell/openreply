# Nourly (Nutrition Tracker) — System Overview

For deployment commands, secrets, and infra IDs, see `CRITICAL_SETUP.md`.
For current priorities and what's done/pending, see `ROADMAP.md`. This
file is the architecture map — read it to understand how the pieces fit
together, not to find a specific command or credential.

## The Problem It Solves

Mainstream calorie-tracking apps (MyFitnessPal, Cronometer, HealthifyMe)
barely cover Pakistani dishes. This app lets someone log food the way they
actually eat — describe it in text, photograph it, or scan a barcode — and
get accurate nutrition numbers matched against a curated, audited
228-dish Pakistani food database, with AI filling the gap between "what
the user said/showed" and "which exact dish + portion that is."

## Architecture Overview

```
User (PWA, installed or browser)
  -> Cloudflare Pages (frontend: React 19 + Vite + Tailwind v4)
  -> Cloudflare Worker (backend API, single fetch() router in index.ts)
       -> D1 (SQLite) -- all structured data
       -> R2 -- food/label photos
       -> Durable Objects -- rate limiting (global Gemini budget + per-account caps)
       -> Google Gemini API -- text/photo parsing, barcode-label extraction
       -> Open Food Facts API -- barcode lookup (free tier, no key)
       -> Resend -- account emails
       -> Paddle -- subscription billing (built, not yet live)
       -> Slack -- monitoring alerts
```

No server framework, no ORM: the Worker is one `fetch()` handler with a
manual if-chain router in `index.ts`, calling directly into `db.ts` (raw
`D1Database.prepare()` calls) and small single-purpose modules. Deliberate
throughout: no SDK where a direct `fetch()`/Web Crypto call does the job
(Gemini, Web Push, Paddle webhook verification are all hand-rolled) --
avoids dependencies of unverified shape in a Workers runtime that doesn't
have all of Node's APIs.

## Technology Stack

- **Backend:** Cloudflare Workers (TypeScript), D1, R2, Durable Objects,
  Cron Triggers. No framework.
- **Frontend:** React 19, Vite, Tailwind v4, `vite-plugin-pwa` with the
  `injectManifest` strategy (not `generateSW` — needed to hand-write the
  service worker for push notifications; see "PWA / Service Worker"
  below for why this matters).
- **AI:** Google Gemini (`gemini-3.1-flash-lite`) via direct REST calls
  (`generateContent`), chosen after testing every available Flash variant
  for RPM/cost/no-thinking-tax fit — see `parseLog.ts`'s own header
  comment for the full reasoning.
- **Auth:** real email+password accounts, session tokens, step-up email
  verification (currently disabled, see `CRITICAL_SETUP.md`).
- **Billing:** Paddle (merchant-of-record — Stripe doesn't onboard
  Pakistan-based sellers), Payoneer payout. Built, dormant.

## Database Schema (D1) — grouped by purpose

**Accounts:** `users`, `sessions`, `trusted_devices`, `otp_codes`

**Logged data (all keyed by `device_id` = the authenticated user's id,
despite the name — a holdover from the pre-auth, device-only MVP; see
migration `0006_accounts.sql`'s own comment):** `logs` (food),
`exercise_logs`, `weight_logs`, `water_logs`

**Dish database:** `dishes` (228 curated + barcode-sourced rows,
distinguished by a `source` column: `curated` | `barcode_off` |
`barcode_ai`)

**Diagnostics (not personal data, kept on account deletion):**
`error_logs`, `unmatched_logs` (text/photo that didn't match anything),
`unmatched_barcodes`

**Other:** `user_profiles` (goals/targets, `device_id` PRIMARY KEY),
`feedback`, `push_subscriptions`

**Billing (added to `users`, not a separate table — single-tier model, one
subscription per user):** `subscription_tier`, `paddle_customer_id`,
`paddle_subscription_id`, `subscription_status`, `subscription_renews_at`,
`subscription_period`

Full history/reasoning for every column lives in the `migrations/*.sql`
files themselves — each one has a comment explaining *why*, not just
*what*, and is the source of truth over this summary if they ever
disagree.

## Key Files

Backend (`app/src/`):
- `index.ts` — the entire HTTP router + every request handler. Single
  top-level try/catch is where every backend error gets logged AND posted
  to Slack (see `humanizeError.ts`).
- `db.ts` — every D1 query in the app, one function per operation.
- `parseLog.ts` / `parseBarcodeLabel.ts` — Gemini integration for
  text/photo food logs and barcode-label extraction, respectively. Share
  the same rate-limit budget (`rateLimiter.ts` / `rateLimiterDO.ts`).
- `candidateSearch.ts` — free local keyword search that narrows the full
  dish database down to ~10-15 candidates before ever calling Gemini (cost
  control: never send the whole database in a prompt).
- `resolvePortion.ts` — shared portion/gram resolution logic used by food,
  photo, AND barcode logging (a change here affects all three).
- `r2.ts` — photo storage; `photoKey()` namespaces by device/user id
  specifically so a full prefix-scan (account deletion, potential future
  export) works cleanly.
- `slackNotify.ts` / `humanizeError.ts` — monitoring: posts to Slack,
  translates raw exceptions to plain English first.
- `webPush.ts` — native Web Push (VAPID + RFC 8291 payload encryption via
  Web Crypto), verified against the spec's own test vectors in
  `test/web_push.ts`.

Frontend (`frontend/src/`):
- `main.tsx` — PWA service-worker registration (aggressive update-checking,
  see "PWA / Service Worker" below) and the global error handler that
  reports frontend crashes to the backend.
- `lib/api.ts` — every backend call the frontend makes, one function each.
- `components/SettingsScreen.tsx` — the biggest single component: profile,
  theme, gamification, feedback, export, delete-account, legal/privacy,
  push toggle, all as sub-screens sharing one history-based navigation
  pattern (see next section).
- `components/AddLogSheet.tsx` — the log-entry sheet (food/water/weight/
  exercise/barcode modes), owns a bespoke two-level browser-history
  handler (see "Known Issues" below for why nested instances broke this).

## Known Issues & Patterns Worth Knowing Before Touching Related Code

- **Nested back-dismiss hooks break history.** Only ONE component in a
  chain of stacked overlays should touch `window.history`. `AddLogSheet`
  owns it for its whole nested chain (barcode flow, scanner); everything
  inside just calls plain callback props. Don't add a second independent
  history-owning hook inside an already-history-owning component.
- **PWA updates require an explicit `registerSW()` call.**
  `registerType: 'autoUpdate'` in `vite.config.ts` does nothing by itself —
  confirmed by reading the actual generated `dist/registerSW.js`. Also,
  `injectManifest` (needed for push notifications) means Workbox's
  automatic skip-waiting/clients-claim wiring is NOT auto-injected the way
  it would be under `generateSW` — `sw.ts` has to do it by hand
  (`self.skipWaiting()` + `clients.claim()` on `activate`). This combo bit
  a real tester in production (stuck on a pre-auth build with no login
  screen) before it was fixed — see git log around "PWA updates" for the
  full incident.
- **Cloudflare Pages production-alias lag.** A deploy's unique preview URL
  can be correct while the *stable* URL still serves an older build for a
  bit. Always verify the stable URL after deploying (see
  `CRITICAL_SETUP.md`'s deployment section) — this is not paranoia, it
  has actually happened and confused a live debugging session.
- **The shared Gemini budget is real and finite.** ~500 requests/day
  total, across every user, on the free tier. Every cap in this codebase
  (`LOG_DAILY_CAP_FREE`/`PREMIUM`, `LOG_BURST_CAP`) exists to protect that
  shared pool, not as an arbitrary UX choice. A future "unlimited premium"
  marketing claim must stay bounded in code regardless (see the comment
  above `LOG_DAILY_CAP_PREMIUM` in `index.ts`).
- **`wrangler d1`/`r2` commands default to local emulation.** Always pass
  `--remote` when the intent is the real, live data — see
  `CRITICAL_SETUP.md`.

## Current Production Status

See `CRITICAL_SETUP.md`'s "Current Production Status" section — kept
there instead of duplicated here since it changes often and that file is
the one explicitly flagged for a first read after any context reset.

---

**Last updated:** 2026-09-06
