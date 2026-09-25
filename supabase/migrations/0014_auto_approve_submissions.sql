-- 0014_auto_approve_submissions.sql
--
-- Cron 6 — auto-approve-submissions. Every minute. Approves "new_launchpad"
-- submissions that have sat pending for AUTO_APPROVE_AFTER_MINUTES (5, in
-- _shared/constants.ts) with no manual decision. See
-- auto-approve-submissions/index.ts for exactly what it will and will not
-- touch.
--
-- Before this works, set the site URL once:
--   npx supabase secrets set APP_BASE_URL=https://<your-deployed-app>
--
-- To turn auto-approve off:  select cron.unschedule('auto-approve-submissions');
-- To inspect:                select * from cron.job where jobname = 'auto-approve-submissions';
-- Auto-approved rows are recognisable by:
--   select * from public.launchpad_submissions where reviewed_by = 'auto-approve';

select cron.schedule(
  'auto-approve-submissions',
  '* * * * *',  -- every minute; the 5-minute wait itself is AUTO_APPROVE_AFTER_MINUTES, not this schedule
  $$
  select net.http_post(
    url := 'https://fkkfcdiwpfyqzzlfhuyu.supabase.co/functions/v1/auto-approve-submissions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
