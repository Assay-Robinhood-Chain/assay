<div align="center">

<img src="./public/logo.png" width="130" height="130" alt="Assay Logo" />

# ASSAY

**Independent Launchpad Scoring for the Robinhood Chain Ecosystem**

*Every tracked launchpad, scored on five dimensions, kept current automatically.*

**Target Chain:** Robinhood Chain (Ethereum L2, chain ID `4663`)

[![Framework](https://img.shields.io/badge/Framework-Next.js%2016%20(App%20Router)-000000?style=flat-square&logo=nextdotjs&logoColor=white&labelColor=0D0D0A)](#-tech-stack)
[![Network](https://img.shields.io/badge/Network-Robinhood%20Chain%20·%204663-1A9E4B?style=flat-square&labelColor=0D0D0A)](#-how-it-works)
[![Language](https://img.shields.io/badge/Language-TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white&labelColor=0D0D0A)](#-tech-stack)
[![Backend](https://img.shields.io/badge/Backend-Supabase%20·%20Postgres-3ECF8E?style=flat-square&logo=supabase&logoColor=white&labelColor=0D0D0A)](#backend-supabase)
[![Algorithm](https://img.shields.io/badge/Scoring-v1.9-CCFF00?style=flat-square&logoColor=0D0D0A&labelColor=0D0D0A)](#-the-five-dimensions)
[![Styling](https://img.shields.io/badge/Styling-Tailwind%20v4%20·%20Framer%20Motion-38C172?style=flat-square&labelColor=0D0D0A)](#-tech-stack)
[![Deploy](https://img.shields.io/badge/Deploy-Vercel-black?style=flat-square&logo=vercel&logoColor=white&labelColor=0D0D0A)](#-deploying)
[![License](https://img.shields.io/badge/License-Unspecified-lightgrey?style=flat-square&labelColor=0D0D0A)](#-license--disclaimer)

</div>

---

**Assay** is a launchpad directory and scoring site for the **Robinhood Chain** ecosystem (Ethereum L2, chain ID `4663`). It tracks every launchpad on the chain (Pons, StonkBrokers, Pools.trade, RobinPad, NOXA Fun, Flap, hood.fun, and more as they're added), backfills its launch history, and scores it on five weighted dimensions — refreshed hourly, resweeped daily, never touched by a human hand once a launchpad is onboarded. A launchpad stays **provisional** (capped at 1 star) until its sample size clears a minimum confidence bar; after that its stars move only when its underlying numbers do.

Built from `Assay-Developer-Brief.md`, `backfill-sampling-policy.md` and `third-party-indexer-integration.md`. Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind v4 · Framer Motion · Supabase/Postgres.

---

## 🏛️ Core Value Proposition

Launchpads on a fast-moving chain multiply faster than anyone can vet them by hand, and the existing ways of judging one are either manual, static, or don't check their own numbers:

* **The Stale-Snapshot Problem:** A launchpad's reputation today is still built on how its first ten tokens did months ago.
* **The Self-Reported Problem:** Most "audited" or "verified" badges are taken from the launchpad's own marketing, never checked against a live source.
* **The One-Score-Forever Problem:** A single composite number hides *why* a launchpad is good or bad, and rarely updates once it's published.

Assay addresses this with a single automated pipeline:

* **Five Independent Dimensions, Not One Number:** Quality, Mechanism, Market Health, Value and Consistency are scored separately, each with a stated confidence gate — a dimension the data can't support yet is shown as **n/a**, never a placeholder 0 or 100.
* **Sampled, Not Cherry-Picked, Onboarding:** A new launchpad is backfilled at 20% of its upstream launch count (capped at 1,000), drawn to include its whole history, not just its best-known tokens.
* **Provisional Until Proven:** Stars are capped at 1 until a launchpad clears `MIN_SAMPLE_SIZE_FOR_CONFIDENCE` — a small or brand-new launchpad can't accidentally look best-in-class.
* **Kept Current on Its Own:** Hourly metric refreshes, a daily resample of which launches count, and a daily full scoring sweep mean a score is never more than one cycle behind what's actually on-chain.

---

## 🔍 What Powers Every Score

Each launchpad's score draws on parallel data pipelines, all recorded server-side before the dimensions are ever computed:

| Module | Source | What It Feeds |
|---|---|---|
| **1. Launch Discovery** | Bitquery (documented flagship launchpads) → Mobula → RPC self-indexing fallback, priority order per `third-party-indexer-integration.md` | New token launches per launchpad, recorded with their `discovery_source`. |
| **2. Onboarding Backfill** | `onboarding-backfill` (event-triggered, once per launchpad) | The initial 20%-of-upstream sample (capped at 1,000) a new launchpad is scored from. |
| **3. Market Metrics** | Dexscreener (DEX pools) + Mobula (bonding-curve reserves, OHLCV price history) | Liquidity, volume, and peak-vs-launch multiple per tracked launch. |
| **4. Contract Checks** | Blockscout PRO API (chain 4663) | Contract verification status, feeding the Mechanism dimension. |
| **5. Sample Rotation** | `sample-resample` (daily) + `upstream-discovery` (daily) | Redraws which known launches count toward the active, refreshed-and-scored sample. |

---

## ⭐ The Five Dimensions

Weighted and computed in `supabase/functions/_shared/scoring.ts` (algorithm **v1.9**), mirrored for display in `lib/constants.ts` and `lib/scoring.ts`:

| Dimension | Weight | Measured today |
|---|---|---|
| **Quality** | 30% | Smoothed graduation rate over a tiered pool — every graduated launch if any exist, else every launch ≥72h old, else the whole sample — Bayesian-adjusted so a tiny sample isn't over- or under-penalized. Rugpull detection isn't wired in yet. |
| **Mechanism** | 20% | Share of token contracts verified on Blockscout, capped at a third of the scale until audit and LP-lock data are wired in. |
| **Market Health** | 20% | Liquidity depth across checked tokens (DEX pool via Dexscreener, or bonding-curve reserves via Mobula); a token with neither counts as zero. Volume, wash-trading and holder-concentration penalties aren't wired in yet. |
| **Value** | 20% | Median peak-vs-launch multiple (Mobula price candles), same tiered pool as Quality, on a log scale — never rising above launch price scores 0, a 10× scores 100. |
| **Consistency** | 10% | How tightly peak multiples cluster, multiplied by how good the typical outcome is — a launchpad where every token flatlines doesn't count as consistent. |

Stars follow fixed thresholds (`STAR_3_THRESHOLD` 80, `STAR_2_THRESHOLD` 60, `STAR_1_THRESHOLD` 40) and a launchpad below `MIN_SAMPLE_SIZE_FOR_CONFIDENCE` known launches is capped at 1 star and marked provisional, whatever its raw score.

---

## 🖥️ How It Works

```
[Get listed / admin approve] ──► onboarding-backfill (once) ──► 20% sample, capped at 1,000
                                              │
                                              ▼
                                   backfill-enrichment (5 min) ──► per-token metrics queue drained
                                              │
            ┌─────────────────────────────────┼─────────────────────────────────┐
            ▼                                 ▼                                 ▼
 ingestion-rotation (hourly)     upstream-discovery (daily)          sample-resample (daily)
 refresh liquidity/volume/       finds new launches since last       redraws the active sample
 verification for a rotating    check, inserted excluded from        (soft-exclude, not delete —
 20%/hr batch + new launches    the active sample until resampled    history is never lost)
            │                                 │                                 │
            └─────────────────────────────────┴─────────────────────────────────┘
                                              ▼
                              scoring-sweep (daily safety net) ──► launchpad_scores
                                              │
                                              ▼
                          Home / Rankings / Launchpad detail / Coverage pages
```

* **Numbers never come from the frontend.** Every score, dimension value and coverage figure is read from Supabase tables (`launches`, `launch_metrics_snapshot`, `launchpad_scores`); the UI only presents them.
* **Graceful degradation.** With no Supabase env vars set, every page falls back to the mock dataset in `lib/data.ts` — a missing `peak_multiple` or unverified contract renders as **n/a** or an em-dash, never a fabricated number.
* **Auto-approve, with a window instead of a gate.** A pending "new launchpad" submission is approved automatically after `AUTO_APPROVE_AFTER_MINUTES` with no manual decision — `auto-approve-submissions` calls the exact same endpoint the admin moderation page uses, so an auto-approved launchpad goes through onboarding-backfill identically to a manually approved one. `website_docs` / `deployer_address` edits and community reports always stay manual.

---

## 🏗️ Project Layout

```
app/
  page.tsx                Home — hero, 4-step "how it works", top-rated preview, trust strip
  rankings/page.tsx       Rankings — full directory, sortable by final_score, star/provisional filters
  launchpad/[slug]/       Launchpad detail — 5-dimension breakdown, score history chart, launches table
  methodology/page.tsx    Methodology — the five dimensions, thresholds, interactive backfill example
  coverage/page.tsx       Coverage — pipeline flow, live collectors, per-launchpad coverage table,
                          simulated ingestion feed, countdowns to the next rotation/sweep
  get-listed/page.tsx     Get listed — add a launchpad, or submit a correction/claim
  admin/moderation/       Moderation queue — approve/reject submissions, own layout, no site chrome
  api/
    launchpads/           Public read endpoint backing the directory
    admin/moderation/     Approve/reject actions (shared by the admin page and auto-approve-submissions)
lib/
  types.ts                Launchpad, LaunchpadScore, Launch, DiscoverySource
  constants.ts            named thresholds/weights — the "no bare numbers" mirror of the server config
  scoring.ts, coverage.ts  display-side scoring helpers + the Coverage page's collector/confidence helpers
  data.ts                  mock dataset (fallback when Supabase env vars aren't set)
  supabase/                client.ts, server.ts, admin.ts, queries.ts (mirrors data.ts, async, DB-backed)
components/                ScoreBadge, DimensionBar, DirectoryTable, LaunchesTable, ScoreHistoryChart,
                            PipelineFlow, CoverageTable, ActiveCollectors, LiveFeed, CronStatus, ThemeToggle
supabase/
  migrations/              0001–0016: schema, cron schedules, community reports, real scoring, logos
  seed.sql                 mirrors lib/data.ts's mock dataset
  functions/
    onboarding-backfill/    NOT a cron — triggered once per launchpad on approval
    ingestion-rotation/     Cron 1 — hourly metric refresh (rotating batch + new-launch fast path)
    scoring-sweep/          Cron 2 — daily full recompute, the safety net behind on-demand scoring
    backfill-enrichment/    Cron 3 — every 5 min, drains the per-token metrics queue a backfill leaves
    upstream-discovery/     Cron 4 — daily, finds new launches since the last check
    sample-resample/        Cron 5 — daily, redraws the active sample (soft-exclude, never delete)
    auto-approve-submissions/ Cron 6 — every minute, approves an unreviewed new-launchpad submission
    _shared/                 adapters, constants, scoring, enrichment, logoFetch, ssrf-safe fetch, sentry
public/                     logo, favicons, hero art
```

---

## 💻 Tech Stack

### Frontend & UI
- **Framework:** Next.js 16 (App Router, Turbopack) with TypeScript, React 19.
- **Styling:** Tailwind CSS v4, design tokens ported from the original `assay-web.html` (paper/ink/cobalt/gold/up/down), light + dark mode.
- **Motion:** Framer Motion, respecting `prefers-reduced-motion` globally via `MotionProvider`.
- **Fonts:** Geist / Geist Mono.

### Backend & Data
- **Database:** PostgreSQL via Supabase (`@supabase/supabase-js`, `@supabase/ssr`).
- **Scheduling:** Supabase `pg_cron`, driving six Edge Functions (see Project Layout above).
- **Launch discovery:** Bitquery → Mobula → RPC self-indexing, priority order per `third-party-indexer-integration.md`.
- **Market data:** Dexscreener (DEX pools, no key required), Mobula (bonding-curve reserves + OHLCV price history).
- **Contract checks:** Blockscout PRO API, pinned to Robinhood Chain (chain ID `4663`).
- **Error tracking:** Sentry, initialized inside the Edge Functions.
- **Hosting:** Vercel (frontend) + Supabase (database, Edge Functions, cron).

---

## ⚙️ Getting Started

### Prerequisites
- **Node.js:** v20 or higher
- A **Supabase** project (optional to start — the app runs fully on mock data without one)

### Quick Start

```bash
npm install
npm run dev
```

Then open http://localhost:3000. With no `.env.local`, every page runs off the mock dataset in `lib/data.ts` — nothing else to configure.

### Environment variables

Copy `.env.example` to `.env.local` and fill in what you need — see the comments in that file for where each key comes from (Supabase dashboard, Alchemy, Bitquery, Blockscout, Mobula). Every adapter degrades gracefully: without a key, its dimension(s) render **n/a** rather than failing the build.

---

## Backend (Supabase)

Everything needed to stand up the real backend lives in `supabase/` — see the Project Layout above for what each migration and function does.

### Setup

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Copy `.env.example` to `.env.local`, and fill in the Supabase values from **Settings → API**.
3. Push the schema and seed data:
   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push                              # runs supabase/migrations/*.sql
   psql "$DIRECT_DB_URL" -f supabase/seed.sql     # or paste into the SQL editor
   ```
4. Deploy the Edge Functions and set their secrets:
   ```bash
   supabase functions deploy onboarding-backfill
   supabase functions deploy ingestion-rotation
   supabase functions deploy scoring-sweep
   supabase functions deploy backfill-enrichment
   supabase functions deploy upstream-discovery
   supabase functions deploy sample-resample
   supabase functions deploy auto-approve-submissions
   supabase secrets set CRON_SECRET=... ADMIN_API_KEY=... APP_BASE_URL=... \
     ALCHEMY_API_KEY=... BITQUERY_API_KEY=... BLOCKSCOUT_API_KEY=... MOBULA_API_KEY=...
   ```
5. Set `ADMIN_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` as **server-side** env vars in Vercel too (never `NEXT_PUBLIC_`-prefixed) — `app/api/admin/moderation/route.ts` needs them at request time, not just inside the Edge Functions.

### Switching the frontend from mock data to Supabase

`lib/supabase/queries.ts` mirrors `lib/data.ts`'s functions — async, reading from Supabase, and falling back to the mock dataset automatically if `NEXT_PUBLIC_SUPABASE_URL` isn't set:

- With no `.env.local` → the app runs exactly as it does today, off `lib/data.ts`.
- Once the Supabase env vars are set, swap the import in a page:
  ```diff
  - import { getLaunchpads } from "@/lib/data";
  + import { getLaunchpads } from "@/lib/supabase/queries";
  ```
  and make the page component `async`, `await`-ing the call.

The **Get Listed** form already writes to `launchpad_submissions` directly via `lib/supabase/client.ts` when `NEXT_PUBLIC_SUPABASE_URL` is set, and falls back to a demo success state otherwise — no page-level change needed there.

---

## 🚀 Deploying

1. **Prepare a Supabase project first**, per the Backend section above — Vercel has no database of its own.
2. **Push the repo** and import it in Vercel — the Next.js preset is detected automatically.
3. **Set every server-side key** (`ADMIN_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and anything else from `.env.example` the app needs at request time) as a Vercel environment variable — never prefixed `NEXT_PUBLIC_`.
4. **Run the migration and seed once** against production, and deploy every Edge Function (see Backend → Setup above).
5. **Verify** the app loads and, once real data exists, that `app/coverage/page.tsx` shows live collectors rather than the mock fallback.

---

## 📄 License & Disclaimer

### Disclaimer
Scores are informational only and do not constitute financial, investment, or legal advice. Assay is not a registered investment adviser. Scores describe historical, on-chain patterns, not predictions about any specific future token. Conduct independent research before making any decision.

### License
No license file is currently included in this repository — add one before distributing or open-sourcing the project.

---

<div align="center">
Built for the <b>Robinhood Chain</b> Ecosystem
</div>