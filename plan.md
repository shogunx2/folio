# Folio — Next Build Plan (CAS parsing + PWA)

> Start-here plan for a fresh session. The original v1 plan is preserved at `plan-v1.md`.

## Context & current state

Folio is a mobile-first personal investment tracker (React + TypeScript + Vite), already
redesigned to a clean "editorial finance" aesthetic (serif numerals, mono tickers,
hairline depth, emerald accent, light/dark, liquid-glass tab bar). It currently:
- Imports **broker statements** (Groww / Zerodha / MF Central CSV/XLSX), parsed client-side.
- Stores holdings/transactions in **IndexedDB** (local-only, no backend).
- Computes net worth, allocation, XIRR; shows holdings, activity, per-holding detail with charts.
- Fetches prices via **dev-only Vite proxies** (Yahoo/AMFI) — these do NOT work in a
  deployed build (browsers can't call them directly).

**Immediate goal:** ship to my own household (my dad + family) with near-zero cost, built
so it can go public later **without a rewrite**.

## Locked decisions (do NOT re-litigate)

- **CAS parsing is server-side.** Client-side (Pyodide) was tested and rejected: current
  `casparser` 1.x needs native `pypdfium2` (no WASM build); the older pdfminer-based 0.9.1
  works only by stubbing native `rapidfuzz` — too fragile/unmaintainable.
- **CAS import is ADDITIVE.** Do **NOT** remove or change the existing Groww/Zerodha/
  MF Central importers until CAS parsing is proven reliable on real statements.
- **Do NOT build login/auth.** The login UI is being designed separately in Claude Designs
  and will be brought in later. Leave a clean seam where it will plug in. (When it lands it
  will be **mandatory** login, because the cloud/sync path stores data server-side.)
- **PWA-first delivery.** Installable on iOS + Android home screen via a free HTTPS host
  (Cloudflare Pages / Vercel). No app stores needed for household use. (App Store/Play via
  Capacitor is a later, optional step — same codebase.)
- **EOD price freshness is enough** (daily close). Live/intraday not needed.
- **Data minimization (security):** discard the CAS PDF immediately after parsing; never
  store PAN/DOB (the CAS password); when cloud storage is added, store only **encrypted
  derived holdings**, never raw statements.
- **Freemium (later, not now):** free = 1 CAS / single portfolio; paid = up to ~5 family
  members + capital-gains/tax reports (facts/reports only — no securities advice, to avoid
  SEBI RIA liability).

## Build tracks (do Track A first)

### Track A — Make Folio an installable PWA (low risk, immediate household value)

1. **Web manifest** (`public/manifest.webmanifest`): name "Folio", short_name, theme/
   background colors (match light/dark tokens), `display: standalone`, `start_url: /`,
   `scope: /`, icons.
2. **Icons**: 192/512 PNG + a 512 **maskable** icon + `apple-touch-icon` (180×180). Put in
   `public/`. (Generate from a simple "folio" serif glyph on the accent/ink background.)
3. **iOS home-screen meta tags** in `index.html`: `apple-mobile-web-app-capable`,
   `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`, apple-touch-icon link.
4. **Service worker** for an offline app shell — use **`vite-plugin-pwa`** (Workbox) in
   `vite.config.ts` (auto-update, precache the built assets). Keep it simple: app shell +
   static assets; data stays in IndexedDB.
5. **Verify**: Chrome Lighthouse "Installable" passes; install on a real iPhone (Safari →
   Share → Add to Home Screen) and Android (Add to Home Screen); offline loads the shell.
6. **Deploy**: `npm run build` → push `dist/` to **Cloudflare Pages** or **Vercel** (free)
   → get an HTTPS subdomain (e.g. `folio.pages.dev`). Open on family phones, add to home screen.

Critical files: `index.html`, `vite.config.ts`, new `public/manifest.webmanifest`, new
`public/` icons.

> NOTE: Prices currently rely on dev-only proxies and will not refresh in the deployed PWA.
> For the first household deploy that's acceptable (values show from last import). A small
> EOD price backend is the parked follow-up (see below). Don't block Track A on it.

### Track B — CAS parsing service (THE core challenge; additive, feature-flagged)

My dad tried to use a CAS and couldn't — so **two things must work: (1) obtaining the CAS,
(2) parsing it.** Treat both as part of this track.

**Step 0 — Get a real CAS and find out what failed.** Document how to obtain each type and
test against real files:
- **CAMS/KFintech consolidated CAS** (mutual funds only): camsonline.com or mfcentral.com →
  "Consolidated Account Statement" → emailed PDF, password is usually the **PAN (uppercase)**
  or a user-set password.
- **NSDL / CDSL CAS** (demat **+** MF — most complete, one file = whole portfolio):
  NSDL e-CAS (nsdl.co.in) / CDSL (cdslindia.com) → register → emailed monthly; password = PAN.
- Find out which type my dad has and why it failed (wrong CAS type? password format? OTP/
  portal confusion? summary vs detailed statement?). If *generating* the CAS is the hard
  part, that's a product/UX note to capture, not just an engineering one.

**Step 1 — Parsing service (server-side Python).**
- Use **current `casparser` (1.x)** — supports CAMS/KFintech + NSDL/CDSL, multiple asset classes.
- Run as a **Python AWS Lambda (container image)** with a Function URL (the container bundles
  the native `pypdfium2`), or a small **FastAPI** service if a container is easier locally.
  Prefer Lambda for low-ops + free tier.
- Endpoint: `POST /parse-cas` (multipart: `file` = PDF, `password`) → returns structured
  JSON. **Parse-and-discard**: never persist the PDF or password. CORS enabled for the app.
- Reliability checklist: both CAS variants; wrong/empty password; encrypted PDFs; zero-holding
  statements; summary (holdings only) vs detailed (with transactions); unknown schemes.

**Step 2 — Wire into the existing app (additive).**
- Add an **"Import CAS"** affordance in the existing Import view
  (`src/portfolio/MobileApp.tsx` → `ImportView`, alongside the broker source rows) that
  uploads PDF + password to `/parse-cas`.
- Add a CAS import action to the view-model hook (`src/portfolio/usePortfolio.ts`), mirroring
  the existing `importFile` flow.
- **Adapter**: map `casparser` output (folios/schemes/transactions + demat holdings) →
  existing internal `Transaction` / `Holding` types → run through the existing
  **`src/normalizer/`** pipeline (reuse its validation + dedup + storage). Do not duplicate
  that logic.
- Put the whole CAS path behind a **feature flag** so broker import is untouched.

**Step 3 — Prove reliability before promoting.** Validate on multiple real CAS files; confirm
the numbers reconcile with broker-import figures for overlapping holdings. Only after that,
consider making CAS the primary onboarding path. **Until then, keep broker import as-is.**

## Explicit DO-NOTs
- ❌ Don't remove/modify Groww/Zerodha/MF Central import until CAS is reliable.
- ❌ Don't build the login/auth UI (coming from Claude Designs) — just leave a seam.
- ❌ Don't store the CAS PDF or the PAN/DOB anywhere.

## Existing code to reuse
- `src/normalizer/index.ts` — validation/dedup/storage pipeline (feed CAS results through it).
- `src/parsers/*` — pattern for parser → normalizer.
- `src/types/index.ts` — `Transaction`, `Holding`, `AssetType`, `Platform`.
- `src/services/portfolio.ts` — `getPortfolioSnapshot`, import pipeline, `refreshQuotes`.
- `src/portfolio/usePortfolio.ts` — view-model hook (add CAS import action here).
- `src/portfolio/MobileApp.tsx` (`ImportView`) — add CAS upload UI beside broker chips.
- `src/prices/amfi.ts` + `src/services/nseIsinMap.ts` — reuse for the parked EOD price backend.

## Parked for later (paid scaffolding / when it earns its keep)
- **EOD price backend** (so prices refresh in prod + scale): daily ingest of NSE bhavcopy +
  AMFI NAVAll into a cache, served to all clients — fetch volume independent of user count.
- **Mandatory login + cloud sync** (Cognito + per-user encrypted store) — UI from Claude Designs.
- **Tax / capital-gains reports** (paid). **Family members** up to ~5 (paid).
- **App Store / Play Store** via Capacitor (Play ₹2,100 one-time; Apple ₹8,400/yr; both later).

## Cost reference
- **Household now:** ~₹0 (PWA + free hosting; optional domain ~₹900/yr).
- **Public later:** Play ₹2,100 one-time, Apple ₹8,400/yr, domain ₹900/yr; AWS near-free at
  small scale (always-free Lambda/DynamoDB, Cognito free to 10k users).
- **Security upfront:** ~₹0 — use built-in HTTPS + encryption-at-rest + data minimization.
  Pentest (~₹50k+) and legal review only when scaling / going seriously public, not now.

## Verification
- **Track A:** Lighthouse PWA "installable" passes; installs on a real iPhone + Android;
  offline shell loads; deployed HTTPS URL works on family phones.
- **Track B:** real CAS (both types if available) parses to correct holdings/transactions;
  reconciles with broker-import numbers; wrong-password handled gracefully; confirm the PDF
  and password are never persisted; broker import still works unchanged.
