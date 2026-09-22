# Assay — frontend (Surface 1, public dashboard)

Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 + Framer Motion, built to match
`Assay-Developer-Brief.md` section 11 and `backfill-sampling-policy.md`.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Pages

- `app/page.tsx` — **Home**: landing page. Hero, the 4-step "how it works" flow (launchpad
  added → tokens discovered → scored → kept current), a top-rated preview, trust strip, CTA
  into Get listed.
- `app/rankings/page.tsx` — **Rankings**: the full directory, every tracked launchpad sorted
  by `final_score`, filterable by minimum stars and provisional inclusion, client-side only.
- `app/launchpad/[slug]/page.tsx` — **Launchpad detail**: 5-dimension score breakdown, score
  history chart, backfill sample-vs-total coverage, active badges, tracked launches table.
- `app/methodology/page.tsx` — **Methodology**: the five dimensions, star thresholds, the
  confidence-gating rule, and an interactive worked example of the onboarding backfill
  sampling rule from `backfill-sampling-policy.md`.
- `app/coverage/page.tsx` — **Coverage**: what `third-party-indexer-integration.md` and the
  backfill policy actually produce, made visible — the onboarding→discovery→backfill→score→
  cronjob flow, live collector status, a per-launchpad coverage table (discovery source,
  sample vs. upstream total, a coarse confidence floor), a simulated live ingestion feed, and
  countdowns to the next hourly ingestion rotation / daily scoring sweep.
- `app/get-listed/page.tsx` — **Get listed**: add a new launchpad or submit a correction/claim
  (demo only — no live backend; the real endpoint is `POST /submissions` per brief section 9).

## Library

- `lib/` — types (`Launchpad`, `LaunchpadScore`, `Launch`, `DiscoverySource`), named constants
  (mirroring section 3's "no bare numbers" rule, plus the backfill and third-party-indexer
  constants), scoring helpers, `lib/coverage.ts` (collectors + confidence-floor helper for the
  Coverage page), and a mock dataset standing in for `GET /launchpads*`.
- `components/` — `ScoreBadge` (distinct provisional treatment, not just smaller text),
  `DimensionBar` (red/amber/green ramp locked to the star thresholds), stale-data and "not yet
  scored" states, a sortable launches table, the backfill coverage note, `PipelineFlow`,
  `CoverageTable`, `LiveFeed`, and `CronStatus` for the Coverage page.

## Backend (Supabase)

Everything needed to stand up the real backend lives in `supabase/`:

```
supabase/
  migrations/
    0001_init.sql          # tables + indexes + RLS policies
    0002_cron_schedule.sql # the 2 pg_cron jobs (run AFTER deploying functions)
    0003_community_reports_and_priors.sql # remaining 2 core tables (brief section 9)
  seed.sql                  # mirrors lib/data.ts's mock dataset
  functions/
    ingestion-rotation/     # Cron 1 — hourly. Dexscreener + Blockscout refresh.
    scoring-sweep/          # Cron 2 — daily. Recomputes launchpad_scores.
    onboarding-backfill/    # NOT a cron — event-triggered once per launchpad.
    _shared/                # adapters, constants, admin client
```

### Setup

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Copy `.env.example` to `.env.local`, fill in the Supabase values from
   **Settings → API**, and the rest per the table in the previous README
   section / the chat where these were sourced.
3. Push the schema and seed data:
   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push          # runs supabase/migrations/*.sql
   psql "$DIRECT_DB_URL" -f supabase/seed.sql   # or paste into the SQL editor
   ```
4. Deploy the Edge Functions and set their secrets:
   ```bash
   supabase functions deploy ingestion-rotation
   supabase functions deploy scoring-sweep
   supabase functions deploy onboarding-backfill
   supabase secrets set CRON_SECRET=... ADMIN_API_KEY=... \
     DEXSCREENER_API_BASE_URL=... BLOCKSCOUT_API_BASE_URL=... BITQUERY_API_KEY=...
   ```
5. Edit `supabase/migrations/0002_cron_schedule.sql`, replace `<PROJECT_REF>`
   with your project ref, then run it (SQL editor or `supabase db push`).

### Switching the frontend from mock data to Supabase

`lib/supabase/queries.ts` implements the exact same two functions as
`lib/data.ts` (`getLaunchpads()`, `getLaunchpadBySlug()`) — async, reading
from Supabase, and **automatically falling back to the mock dataset** if
`NEXT_PUBLIC_SUPABASE_URL` isn't set. So:

- With no `.env.local` → the app runs exactly as it does today, off `lib/data.ts`.
- Once you set the Supabase env vars, swap the import in each page:

  ```diff
  - import { getLaunchpads } from "@/lib/data";
  + import { getLaunchpads } from "@/lib/supabase/queries";
  ```
  and make the page component `async`, `await`-ing the call (already the
  case in `app/launchpad/[slug]/page.tsx` — the other three pages
  currently call it synchronously and need `async`/`await` added).

The **Get Listed** form (`app/get-listed/page.tsx`) already writes to
`launchpad_submissions` directly via `lib/supabase/client.ts` when
`NEXT_PUBLIC_SUPABASE_URL` is set, and falls back to a demo success state
otherwise — no page-level change needed there.

### Database: TimescaleDB note

`launch_metrics_snapshot` is left as a plain indexed Postgres table (see
the commented-out block at the bottom of `0001_init.sql`). Continuous
aggregates / compression are Timescale Community-licensed and may not be
available on hosted Supabase — at Assay's scale (sample capped at 250
launches/launchpad) a plain table with a `pg_cron` pruning job is likely
enough; revisit only if `SNAPSHOT_RETENTION_DAYS` growth becomes a real
storage problem (Free tier: 500 MB).

## Notes

- All data in `lib/data.ts` is mocked client-side; wire it up to the real `/launchpads*`
  routes from section 9 of the brief when the API is available. The component boundaries
  already assume that shape (`Launchpad`, `LaunchpadScore`, `Launch` in `lib/types.ts`).
- Motion respects `prefers-reduced-motion` globally via `MotionProvider`
  (`<MotionConfig reducedMotion="user">`), per section 11.4.
- The directory table collapses to a card list below 768px rather than scrolling
  horizontally, per `MOBILE_BREAKPOINT_PX`.
- Colors and fonts are ported from the original `assay-web.html` design (Geist / Geist
  Mono, the paper/ink/cobalt/gold/up/down token set), including light/dark support.
