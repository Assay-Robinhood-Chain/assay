-- 0016_launchpad_logo.sql
--
-- Adds logo_url to launchpads. Populated automatically by
-- onboarding-backfill (fetchLogoUrl() in
-- supabase/functions/_shared/logoFetch.ts) from the launchpad's
-- website_url at onboarding time — nobody uploads this by hand.
-- Null means "couldn't find one" (no website_url, fetch failed, or the
-- page had no usable icon/og:image); the frontend falls back to the
-- initials avatar in that case, same as it always has.

alter table public.launchpads
  add column if not exists logo_url text;

comment on column public.launchpads.logo_url is
  'Auto-discovered from website_url at onboarding by fetchLogoUrl() (og:image / apple-touch-icon / favicon). Never user-uploaded. Null = not found, frontend falls back to initials.';
