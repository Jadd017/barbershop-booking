/**
 * Opening hours, days off and the booking window, read from Eddy's settings.
 * firestore.rules re-checks the same things for customer bookings, so keep the two in step.
 */
import {
  MAX_ADDRESS_LENGTH,
  MAX_BOOKING_WINDOW_DAYS,
  MAX_BREAKS_PER_DAY,
  MAX_MAPS_URL_LENGTH,
  MAX_PRICE,
  MAX_SERVICE_MINUTES,
  MAX_SPECIAL_PERIODS,
  SLOT_MINUTES,
} from '../config';
import type { DateKey, DayHours, Settings, TimeString } from '../types';
import { isSafeLink } from './shop';
import { fromDateKey, timeToMinutes, toDateKey, upcomingDateKeys } from './time';

export const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/** True if [aStart, aEnd) and [bStart, bEnd) overlap. */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** 0 = Monday … 6 = Sunday, the index into Settings.weeklyHours. */
export function weekdayIndex(date: DateKey): number {
  return (fromDateKey(date).getDay() + 6) % 7;
}

/** The hours on `date`, or null if the shop is closed then (closed weekday or day off). */
export function hoursOn(settings: Settings, date: DateKey): DayHours | null {
  const hours = settings.weeklyHours[weekdayIndex(date)];
  if (!hours || hours.closed || settings.daysOff.includes(date)) return null;
  return hours;
}

/** How many days (starting today) customers can book, counting special periods that include today. */
export function bookingWindowOn(settings: Settings, today: DateKey): number {
  const special = settings.specialPeriods
    .filter((p) => p.start <= today && today <= p.end)
    .map((p) => p.daysAhead);
  return Math.max(settings.bookingWindowDays, ...special);
}

/** The days customers can pick from: within the booking window, and open. */
export function bookableDays(settings: Settings, now: Date = new Date()): DateKey[] {
  return upcomingDateKeys(bookingWindowOn(settings, toDateKey(now)), now).filter(
    (date) => hoursOn(settings, date) !== null,
  );
}

/**
 * Every day of the booking window, open or not, so the page can show closed days too.
 * The open ones are exactly bookableDays.
 */
export function windowDays(
  settings: Settings,
  now: Date = new Date(),
): { date: DateKey; open: boolean }[] {
  return upcomingDateKeys(bookingWindowOn(settings, toDateKey(now)), now).map((date) => ({
    date,
    open: hoursOn(settings, date) !== null,
  }));
}

/** True if `durationMinutes` from `start` on `date` is within that day's hours and clear of its breaks. */
export function fitsHours(
  settings: Settings,
  date: DateKey,
  start: TimeString,
  durationMinutes: number,
): boolean {
  const hours = hoursOn(settings, date);
  if (!hours) return false;
  const from = timeToMinutes(start);
  const to = from + durationMinutes;
  return (
    from >= timeToMinutes(hours.start) &&
    to <= timeToMinutes(hours.end) &&
    !hours.breaks.some((b) => overlaps(from, to, timeToMinutes(b.start), timeToMinutes(b.end)))
  );
}

function describeDay(hours: DayHours): string {
  if (hours.closed) return 'closed';
  const breaks = hours.breaks.map((b) => `${b.start}–${b.end}`).join(', ');
  return `${hours.start}–${hours.end}${breaks ? ` (break ${breaks})` : ''}`;
}

/**
 * The week's hours, with consecutive days that share hours grouped:
 * ["Mon–Sat 10:00–20:00 (break 14:00–15:00)", "Sun closed"].
 */
export function weeklyHoursSummary(settings: Settings): string[] {
  const short = WEEKDAY_NAMES.map((n) => n.slice(0, 3));
  const lines: string[] = [];
  let first = 0;
  for (let i = 1; i <= 7; i++) {
    const description = describeDay(settings.weeklyHours[first]);
    if (i < 7 && describeDay(settings.weeklyHours[i]) === description) continue;
    const days = first === i - 1 ? short[first] : `${short[first]}–${short[i - 1]}`;
    lines.push(first === 0 && i === 7 ? `Every day ${description}` : `${days} ${description}`);
    first = i;
  }
  return lines;
}

function onGrid(time: TimeString): boolean {
  return timeToMinutes(time) % SLOT_MINUTES === 0;
}

function isWholeDays(n: number, max: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= max;
}

/** What's wrong with `settings`, as messages for Eddy; empty if it can be saved. */
export function settingsErrors(settings: Settings): string[] {
  const errors: string[] = [];

  settings.weeklyHours.forEach((hours, i) => {
    const day = WEEKDAY_NAMES[i];
    if (hours.closed) return;
    const open = timeToMinutes(hours.start);
    const close = timeToMinutes(hours.end);
    if (!onGrid(hours.start) || !onGrid(hours.end) || open >= close) {
      errors.push(`${day}: closing time must be after opening time.`);
      return;
    }
    if (hours.breaks.length > MAX_BREAKS_PER_DAY) {
      errors.push(`${day}: at most ${MAX_BREAKS_PER_DAY} breaks.`);
    }
    const sorted = [...hours.breaks].sort((a, b) => a.start.localeCompare(b.start));
    sorted.forEach((b, j) => {
      const start = timeToMinutes(b.start);
      const end = timeToMinutes(b.end);
      if (!onGrid(b.start) || !onGrid(b.end) || start >= end) {
        errors.push(`${day}: a break must end after it starts.`);
      } else if (start < open || end > close) {
        errors.push(`${day}: breaks must be within opening hours.`);
      } else if (j > 0 && start < timeToMinutes(sorted[j - 1].end)) {
        errors.push(`${day}: breaks overlap.`);
      }
    });
  });

  if (settings.services.length === 0) errors.push('Add at least one service.');
  const names = new Set<string>();
  for (const service of settings.services) {
    const name = service.name.trim();
    if (!name) errors.push('Every service needs a name.');
    else if (names.has(name.toLowerCase())) errors.push(`Two services are called "${name}".`);
    names.add(name.toLowerCase());
    const d = service.durationMinutes;
    if (!Number.isInteger(d) || d < SLOT_MINUTES || d > MAX_SERVICE_MINUTES || d % SLOT_MINUTES) {
      errors.push(`${name || 'A service'}: length must be 15 to ${MAX_SERVICE_MINUTES} minutes.`);
    }
    const p = service.price;
    // Whole cents, so "$12.50" is fine but "$12.555" isn't.
    if (p !== undefined && !(p >= 0 && p <= MAX_PRICE && Math.round(p * 100) === p * 100)) {
      errors.push(`${name || 'A service'}: price must be 0 to ${MAX_PRICE} dollars, or empty.`);
    }
  }

  if (settings.shopAddress.trim().length > MAX_ADDRESS_LENGTH) {
    errors.push(`The address can be at most ${MAX_ADDRESS_LENGTH} characters.`);
  }
  const mapsUrl = settings.mapsUrl.trim();
  if (mapsUrl && (!isSafeLink(mapsUrl) || mapsUrl.length > MAX_MAPS_URL_LENGTH)) {
    errors.push('The Google Maps link must start with https:// (copy it from Share in Google Maps).');
  }

  if (!isWholeDays(settings.bookingWindowDays, MAX_BOOKING_WINDOW_DAYS)) {
    errors.push(`Booking window must be 1 to ${MAX_BOOKING_WINDOW_DAYS} days.`);
  }

  if (settings.specialPeriods.length > MAX_SPECIAL_PERIODS) {
    errors.push(`At most ${MAX_SPECIAL_PERIODS} special periods.`);
  }
  for (const period of settings.specialPeriods) {
    const name = period.name.trim() || 'Special period';
    if (!period.name.trim()) errors.push('Every special period needs a name.');
    if (!period.start || !period.end || period.start > period.end) {
      errors.push(`${name}: the end date must be on or after the start date.`);
    }
    if (!isWholeDays(period.daysAhead, MAX_BOOKING_WINDOW_DAYS)) {
      errors.push(`${name}: days ahead must be 1 to ${MAX_BOOKING_WINDOW_DAYS}.`);
    }
  }

  return errors;
}
