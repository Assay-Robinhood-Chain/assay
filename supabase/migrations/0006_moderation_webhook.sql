-- ============================================================
-- Assay — moderation webhook notification
--
-- Fires a Slack/Discord-compatible webhook POST whenever a new row
-- lands in launchpad_submissions or community_reports, so you find
-- out something needs review without opening the Supabase dashboard.
-- Approving/rejecting still happens on the /admin/moderation page —
-- this only notifies, matching the "notification vs action" split
-- discussed earlier.
--
-- Setup (do this once, in the SQL Editor, same pattern as cron_secret):
--   select vault.create_secret('<your-slack-or-discord-webhook-url>', 'moderation_webhook_url');
--
-- Works with Slack Incoming Webhooks and Discord Webhooks — both
-- accept { "text": "..." } / { "content": "..." }. This sends both
-- keys in the same payload; each platform reads the one it recognizes
-- and ignores the other, so no platform-specific config is needed.
--
-- If the secret is never set, the trigger no-ops silently (fails
-- open on the insert itself — a missing webhook must never block a
-- legitimate public submission).
-- ============================================================

create or replace function public.notify_moderation_webhook()
returns trigger
language plpgsql
security definer
as $$
declare
  webhook_url text;
  message text;
begin
  select decrypted_secret into webhook_url
  from vault.decrypted_secrets
  where name = 'moderation_webhook_url';

  if webhook_url is null or webhook_url = '' then
    return new; -- not configured — no-op, never blocks the insert
  end if;

  if TG_TABLE_NAME = 'launchpad_submissions' then
    message := format(
      'New Assay submission: %s / %s — "%s"',
      coalesce(new.launchpad_slug, '(new launchpad)'),
      new.field,
      left(new.value, 200)
    );
  else
    message := format(
      'New Assay report (%s): %s',
      new.category,
      left(new.description, 200)
    );
  end if;

  perform net.http_post(
    url := webhook_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('text', message, 'content', message)
  );

  return new;
end;
$$;

create trigger notify_on_submission
  after insert on public.launchpad_submissions
  for each row execute function public.notify_moderation_webhook();

create trigger notify_on_report
  after insert on public.community_reports
  for each row execute function public.notify_moderation_webhook();
