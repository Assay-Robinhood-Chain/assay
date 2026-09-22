-- ============================================================
-- Assay — community_reports + scoring_priors
-- The Developer Brief (section 9) lists 8 core tables; 0001_init.sql
-- shipped 6. This migration adds the remaining two so the schema
-- matches the brief in full.
-- ============================================================

-- ------------------------------------------------------------
-- scoring_priors — global base rates the Scorer's Bayesian
-- smoothing leans on for cold-start launchpads (brief section 7:
-- r_hat = (n_rug + r_global * PRIOR_WEIGHT) / (n_total + PRIOR_WEIGHT),
-- identical form for graduation rate). One row per
-- (chain, algorithm_version) — never mutated in place, superseded
-- by inserting a new row so the prior used by a past score_date
-- stays reconstructable.
--
-- NOTE: supabase/functions/scoring-sweep/index.ts is explicitly a
-- reference implementation (see its header comment) and does not
-- yet read from this table — it computes dimensions directly from
-- `launches` with no smoothing prior applied. Wiring the two together
-- is tracked separately; this migration only closes the schema gap.
-- ------------------------------------------------------------
create table if not exists public.scoring_priors (
  id                     uuid primary key default gen_random_uuid(),
  chain                  text not null default 'Robinhood Chain',
  algorithm_version      text not null,
  global_rugpull_rate    numeric not null check (global_rugpull_rate between 0 and 1),
  global_graduation_rate numeric not null check (global_graduation_rate between 0 and 1),
  sample_launchpads      integer not null default 0,
  computed_at            timestamptz not null default now(),

  unique (chain, algorithm_version)
);

comment on table public.scoring_priors is
  'Cross-launchpad base rates for Bayesian smoothing (brief section 7). Superseded by inserting a new algorithm_version row, never UPDATEd across a version boundary.';

-- ------------------------------------------------------------
-- community_reports — "catch rugs, not a discussion platform"
-- (brief section 2). Weighted by reporter_trust_score, never raw
-- count (section 3 / section 14 report-brigading rule); a report
-- from an account newer than NEW_REPORTER_COOLDOWN_HOURS is pinned
-- to DEFAULT_REPORTER_TRUST regardless of claimed history.
-- ------------------------------------------------------------
create table if not exists public.community_reports (
  id                   uuid primary key default gen_random_uuid(),
  launchpad_id         uuid not null references public.launchpads(id) on delete cascade,
  launch_id            uuid references public.launches(id) on delete cascade,

  category             text not null
                          check (category in ('rugpull', 'wash_trading', 'contract_risk', 'misleading_info', 'other')),
  description          text not null,

  reporter_identifier  text,                -- wallet address or handle, optional
  reporter_trust_score numeric not null default 0.5
                          check (reporter_trust_score between 0 and 1),

  status               text not null default 'pending'
                          check (status in ('pending', 'verified', 'dismissed')),
  created_at           timestamptz not null default now(),
  reviewed_at          timestamptz,
  reviewed_by          text
);

comment on column public.community_reports.reporter_trust_score is
  'Starts at DEFAULT_REPORTER_TRUST (0.5, brief section 3/14). Only raised by a human-verified accurate track record — never self-declared, never derived from raw report volume.';

comment on column public.community_reports.description is
  'Free-text, third-party-authored. Untrusted input if it ever reaches an LLM call (brief section 12, prompt-injection note) — must be wrapped in delimited data tags, never concatenated into an instruction prompt.';

create index if not exists idx_community_reports_launchpad on public.community_reports (launchpad_id, created_at desc);
create index if not exists idx_community_reports_status on public.community_reports (status, created_at desc);

-- ============================================================
-- Row Level Security — same posture as launchpad_submissions in
-- 0001_init.sql: public can file a report, nobody but service_role
-- (moderation tooling) can read or update it. Retained indefinitely,
-- same as submissions (brief section 9, retention policy) — no
-- delete policy either.
-- ============================================================

alter table public.scoring_priors enable row level security;
alter table public.community_reports enable row level security;

-- scoring_priors backs the Scorer, not a public-facing form — reads
-- are public (same "nothing scored is gated" posture as every other
-- scoring input on the dashboard) but writes are service_role only.
create policy "public read scoring_priors" on public.scoring_priors
  for select using (true);

-- Unverified reports are not public, mirroring launchpad_submissions:
-- anyone can file one, only status = 'pending' is insertable directly,
-- and there is no select/update policy for anon/authenticated — only
-- service_role (which bypasses RLS) can read the queue or move a
-- report to verified/dismissed.
create policy "public insert community_reports" on public.community_reports
  for insert
  with check (status = 'pending');
