import { dateLocale } from '../i18n';
import type { DateKey, TimeString } from '../types';

export function timeToMinutes(time: TimeString): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): TimeString {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function toDateKey(date: Date): DateKey {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function fromDateKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** The date key `days` days after `key` (negative goes back). */
export function addDays(key: DateKey, days: number): DateKey {
  const date = fromDateKey(key);
  return toDateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days));
}

/** Date keys for `count` consecutive days starting at `from` (local time). */
export function upcomingDateKeys(count: number, from: Date = new Date()): DateKey[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    return toDateKey(d);
  });
}

export function formatDayShort(key: DateKey): { weekday: string; day: string } {
  const date = fromDateKey(key);
  return {
    weekday: date.toLocaleDateString(dateLocale(), { weekday: 'short' }),
    day: date.toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric' }),
  };
}

export function formatDayLong(key: DateKey): string {
  return fromDateKey(key).toLocaleDateString(dateLocale(), {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

/** Minutes `timeZone` is ahead of UTC at `instant` (e.g. 180 for Beirut in summer). */
function utcOffsetMinutes(timeZone: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/** The real instant of `time` on `date` in `timeZone`, e.g. Beirut's "2026-10-22" "12:30". */
export function zonedInstant(date: DateKey, time: TimeString, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const wallClockAsUtc = Date.UTC(y, m - 1, d) + timeToMinutes(time) * 60_000;
  // Guess with the offset at that wall-clock time, then correct once in case it crosses a DST change.
  const guess = wallClockAsUtc - utcOffsetMinutes(timeZone, new Date(wallClockAsUtc)) * 60_000;
  return new Date(wallClockAsUtc - utcOffsetMinutes(timeZone, new Date(guess)) * 60_000);
}

const DAY_MS = 86_400_000;

/** Days since 1970-01-01: "1970-01-02" → 1. firestore.rules works out today's the same way. */
export function dayNumber(date: DateKey): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

/** The reverse of dayNumber. */
export function dateOfDayNumber(day: number): DateKey {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}
