-- ============================================================
-- Assay — public cron job status
--
-- The Coverage page's "Cronjob status" section previously simulated
-- its "next run in" countdown entirely client-side from hardcoded
-- constants (INGESTION_INTERVAL_HOURS/SCORING_SWEEP_INTERVAL_HOURS)
-- and a fake "ran N minutes ago" anchor — it never read the actual
-- pg_cron schedule set up in 0002_cron_schedule.sql.
--
-- cron.job and cron.job_run_details live in the `cron` schema, which
-- PostgREST never exposes and which anon has no grants on — and we
-- don't want to expose the whole schema anyway (cron.job.command
-- contains the vault-secret lookup used to authorize the Edge
-- Function calls). This function is the single, narrow, read-only
-- window into it: just the two known job names, their schedule, and
-- their most recent run's timing/status. Runs as the function owner
-- (security definer) so it can read `cron` despite the caller (anon)
-- having no direct grant there.
-- ============================================================

create or replace function public.get_cron_status()
returns table (
  jobname text,
  schedule text,
  last_run_started_at timestamptz,
  last_run_finished_at timestamptz,
  last_run_status text
)
language sql
stable
security definer
set search_path = public, cron
as $$
  select
    j.jobname,
    j.schedule,
    d.start_time as last_run_started_at,
    d.end_time as last_run_finished_at,
    d.status as last_run_status
  from cron.job j
  left join lateral (
    select start_time, end_time, status
    from cron.job_run_details
    where jobid = j.jobid
    order by start_time desc
    limit 1
  ) d on true
  -- Allow-list, not a blanket "select * from cron.job": a future
  -- internal cron job (e.g. an ops/maintenance task) must never become
  -- publicly visible here just by existing.
  where j.jobname in ('ingestion-rotation', 'scoring-sweep');
$$;

revoke all on function public.get_cron_status() from public;
grant execute on function public.get_cron_status() to anon, authenticated;
