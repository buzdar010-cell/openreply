# Critical Setup & Context Preservation

**Purpose:** Preserve critical configuration so a compacted conversation, or a
brand-new session with zero memory, doesn't cause repeated mistakes or
re-asking the user things already known.

## ⚠️ AFTER CONTEXT COMPRESSION OR A NEW SESSION — READ THIS FIRST

1. READ THIS FILE IMMEDIATELY, then `ROADMAP.md` for current priorities.
2. Do NOT ask the user for API keys or credentials — every secret this
   project needs is already stored in Cloudflare. This file lists their
   *names* and purposes, never their values (see "Why no secret values"
   below).
3. `CLOUDFLARE_API_TOKEN` is the one exception: the sandboxed environment
   resets between sessions, so it is NOT persisted anywhere. The user has
   provided it ad-hoc in chat before; ask for it again if a `wrangler`
   command fails with "not authenticated" — this is expected, not a bug.
4. Deployment is 100% manual via `wrangler` CLI, run by Claude in-session.
   There is no CI, no GitHub Actions, no git-push-to-deploy. See
   "Deployment Procedure" below for exact commands.
5. Update this file (and `SYSTEM_OVERVIEW.md`) whenever something here goes
   stale — new secrets, new infra, a changed deployment step.

## Why no secret values in this file

This file is committed to a GitHub repo. Writing real API keys/tokens into
a committed file means anyone with repo access (or a future leak) gets
every credential at once. Secrets live ONLY in Cloudflare (Worker secrets,
set via `wrangler secret put`); this file documents *what exists and what
it's for*, never the value itself.

## Project Basics

- **Name:** Nourly (still branded "Nutrition Tracker" in some code/infra
  names — domain `nourly.app` decided but not purchased yet, see below).
- **What it does:** Pakistani-food-focused nutrition/calorie tracker PWA —
  log food by text or photo (AI-parsed against a curated 228-dish
  database), scan barcodes, track exercise/weight/water, see personalized
  tips and a weight trend.
- **Code:** this repo, two subprojects:
  - `nutrition-tracker/app/` — backend (Cloudflare Workers + D1 + R2 +
    Durable Objects)
  - `nutrition-tracker/frontend/` — frontend (React 19 + Vite + Tailwind
    v4 PWA, on Cloudflare Pages)
- **Working branch:** `claude/online-income-goal-i421j0`

## Current Deployment Setup

**No auto-deploy of any kind.** Every deploy is a manual `wrangler` command
run by Claude in-session, immediately followed by live verification (never
trust the command's own success output alone).

### Backend (Cloudflare Workers)

```bash
export CLOUDFLARE_API_TOKEN=<token from user>
cd nutrition-tracker/app
npx wrangler deploy
```

Migrations (when a new one exists in `migrations/`):
```bash
npx wrangler d1 migrations apply nutrition-tracker-db --remote
```

D1 queries directly (debugging/verification):
```bash
npx wrangler d1 execute nutrition-tracker-db --remote --command "..."
```
**The `--remote` flag is mandatory** — omitting it silently queries a local
emulated DB with none of the real data, which looks like an empty
database rather than an error.

### Frontend (Cloudflare Pages)

```bash
cd nutrition-tracker/frontend
npm run build
npx wrangler pages deploy dist --project-name nutrition-tracker-app --commit-dirty=true --branch=main
```
**`--branch=main` is mandatory.** Without it, wrangler deploys to a unique
preview-alias URL and the *stable* production URL (below) can keep serving
an older build indefinitely. After every frontend deploy, verify the
stable URL actually updated:
```bash
grep -o 'assets/index-[A-Za-z0-9_-]*\.js' dist/index.html
curl -s "https://nutrition-tracker-app-ahu.pages.dev/?cachebust=$(date +%s)" | grep -o 'assets/index-[A-Za-z0-9_-]*\.js'
```
Both bundle hashes must match. This lag has bitten a real tester before
(see "Known Issues" in `SYSTEM_OVERVIEW.md`).

### Photos (R2)

```bash
npx wrangler r2 object get "nutrition-tracker-photos/<key>" --file <local-path> --remote
```
Same `--remote` requirement as D1.

## Infrastructure & Resources

- **Cloudflare account:** Buzdar0003@gmail.com's Account
  (`f96412a263b2bb5af0b28992ad944a3d`)
- **Worker:** `nutrition-tracker` → `https://nutrition-tracker.buzdar0003.workers.dev`
- **Pages project:** `nutrition-tracker-app` → `https://nutrition-tracker-app-ahu.pages.dev`
- **D1 database:** `nutrition-tracker-db` (`4b7cdc79-e520-4c40-afbd-9b77c1190d09`)
- **R2 bucket:** `nutrition-tracker-photos`
- **Durable Objects:** `GeminiRateLimiterDO` (global Gemini rate limit),
  `KeyedRateLimiterDO` (per-account/per-email rate limits, also reused for
  the client-error-reporting global cap)
- **Cron triggers:** `0 12 * * *` (daily — weight-reminder push notifications
  + Slack daily summary), `*/15 * * * *` (uptime check, alerts to Slack)
- **Custom domain:** none yet. Decided: `nourly.app`, ~$4.98 first year via
  Spaceship (promo code `SPSR86`), blocked on funds as of 2026-09-06 (was
  ~PKR 200-260 short). See ROADMAP.md item 5 for the full wiring plan once
  bought.
- **External services:** Google Gemini (AI food/photo/barcode-label
  parsing), Open Food Facts (barcode lookup, free/no key), Resend (account
  emails), Paddle (subscription billing — infra built, dormant, no real
  Paddle account exists yet), Slack (monitoring alerts via incoming
  webhook).

## Secrets (names and purpose only — values live in Cloudflare)

Set via `echo -n "<value>" | npx wrangler secret put <NAME>` from
`nutrition-tracker/app/`. To check what's currently set (not the values):
`npx wrangler secret list`.

| Secret | Purpose |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API — text/photo food-log parsing, barcode label extraction |
| `ADMIN_TOKEN` | Auth for `/admin/*` endpoints (manual review of unmatched foods/errors) |
| `RESEND_API_KEY` | Account emails (signup/reset codes). Currently `REQUIRE_EMAIL_VERIFICATION = false` in `index.ts` because Resend's shared sender can only deliver to the account owner's own inbox until a domain is verified — flip that flag once the domain (above) is bought and verified in Resend |
| `VAPID_PRIVATE_JWK` | Web Push signing key (native implementation, no library — see `webPush.ts`) |
| `PADDLE_API_KEY` | Server-side Paddle API calls (e.g. cancelling a subscription on account deletion) |
| `PADDLE_WEBHOOK_SECRET` | Verifies `POST /webhooks/paddle` really came from Paddle (HMAC, hand-verified via Web Crypto, no SDK) |
| `PADDLE_CLIENT_TOKEN` | Not secret in the security sense, but stored as one — embedded in the frontend to open the Paddle.js checkout overlay. Not yet real: no Paddle account exists |
| `PADDLE_PRICE_ID_MONTHLY` / `PADDLE_PRICE_ID_ANNUAL` | Same as above — placeholders until a real Paddle product exists |
| `SLACK_WEBHOOK_URL` | Real-time monitoring alerts (errors, frontend crashes, uptime, daily digest) — see "Monitoring" below |

Non-secret vars (in `wrangler.jsonc`'s `vars` block, fine to be public):
`VAPID_PUBLIC_KEY`.

## Monitoring

Live since 2026-09-06, posts to a Slack channel via `SLACK_WEBHOOK_URL`:
- Every backend error, real-time (the single top-level try/catch in
  `index.ts`'s `fetch` handler) and every frontend crash, real-time
  (`window.onerror`/`unhandledrejection` in `main.tsx` → `POST
  /client-error`) — both run through `humanizeError.ts` first so the
  message reads in plain English, not a raw stack trace.
- Uptime check every 15 minutes (pings both live URLs).
- One daily digest: today's activity (signups, food/exercise/water/weight
  logs, unmatched scans, errors) + all-time totals (users, premium vs
  free, MRR).

If Slack alerts ever stop arriving, check `SLACK_WEBHOOK_URL` is still set
(`wrangler secret list`) and that the two cron schedules are still
registered (shown in `wrangler deploy`'s output).

## Current Production Status (as of 2026-09-06)

- 1 real user account. A beta-recruitment message just went out to a
  Pakistani group chat — expect more signups soon; check
  `SELECT COUNT(*) FROM users` (via `wrangler d1 execute --remote`) or the
  Slack daily digest rather than assuming.
- Billing (Paddle) is built but **intentionally dormant** — free-tier AI
  log cap is loosened to 40/day (pre-billing value) because monetizing
  wasn't actually ready when it got built. `LOG_DAILY_CAP_FREE` in
  `index.ts` is the one constant to change when that's revisited.
- Custom domain not bought yet (see above).

## Session Continuation Checklist

1. Read this file, then `ROADMAP.md`.
2. If a `wrangler` command fails with "not authenticated," ask the user
   for `CLOUDFLARE_API_TOKEN` again — expected after any fresh session.
3. Never assume a deploy succeeded from its own output — verify the live
   URL/endpoint directly, same pattern used throughout this project's
   history.
4. If anything in this file or `SYSTEM_OVERVIEW.md` is stale by the time
   you finish a change, update it before considering the work done.

---

**Last updated:** 2026-09-06
**Last verified:** all deployment commands and infra IDs above confirmed
live as of this date.
