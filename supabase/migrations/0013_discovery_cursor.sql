-- 0013_discovery_cursor.sql
--
-- Cursor for upstream-discovery: the launch_date of the newest launch it
-- has seen for this launchpad. Next run only asks Blockscout for logs
-- after this point (minus a small overlap) instead of re-scanning the
-- same ~200 newest logs every day.
--
-- NULL = never discovered with a cursor yet -> upstream-discovery falls
-- back to the fixed-size recent scan once, then sets it.

alter table public.launchpads
  add column if not exists last_discovered_launch_at timestamptz;

comment on column public.launchpads.last_discovered_launch_at is
  'launch_date of the newest launch upstream-discovery has seen; used as the scan cursor.';
