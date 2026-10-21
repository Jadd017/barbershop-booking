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
    weekday: date.toLocaleDateString('en-US', { weekday: 'short' }),
    day: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  };
}

export function formatDayLong(key: DateKey): string {
  return fromDateKey(key).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}
