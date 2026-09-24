// supabase/functions/_shared/refreshPolicy.ts
//
// When is a launch's peak multiple worth asking Mobula about again?
//
// Peak multiple only feeds Value and Consistency, changes slowly, and is the
// most expensive field to fetch — so it must NOT ride along on every hourly
// market refresh. It is asked:
//   - the first time (never attempted),
//   - then at most once per PEAK_REFRESH_YOUNG_HOURS while the token is
//     younger than PEAK_REFRESH_YOUNG_DAYS (peaks move most early),
//   - then at most once per PEAK_REFRESH_OLD_HOURS.

import {
  PEAK_REFRESH_OLD_HOURS,
  PEAK_REFRESH_YOUNG_DAYS,
  PEAK_REFRESH_YOUNG_HOURS,
} from './constants.ts';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export interface PeakScheduleInput {
  launch_date?: string | null;
  peak_attempted_at?: string | null;
}

export function isPeakDue(
  launch: PeakScheduleInput,
  nowMs: number = Date.now(),
): boolean {
  if (!launch.launch_date) return false; // nothing to ask Mobula about
  const launchMs = Date.parse(launch.launch_date);
  if (Number.isNaN(launchMs)) return false;

  if (!launch.peak_attempted_at) return true; // never asked
  const attemptedMs = Date.parse(launch.peak_attempted_at);
  if (Number.isNaN(attemptedMs)) return true;

  const ageDays = (nowMs - launchMs) / DAY_MS;
  const intervalHours =
    ageDays < PEAK_REFRESH_YOUNG_DAYS
      ? PEAK_REFRESH_YOUNG_HOURS
      : PEAK_REFRESH_OLD_HOURS;
  return nowMs - attemptedMs >= intervalHours * HOUR_MS;
}
