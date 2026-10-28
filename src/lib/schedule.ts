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
  MAX_SPECIAL_PERIOD_DAYS,
  MAX_SPECIAL_PERIODS,
  SLOT_MINUTES,
} from '../config';
import i18n, { dateLocale } from '../i18n';
import type { DateKey, DayHours, Service, Settings, SpecialPeriod, TimeString } from '../types';
import { isSafeLink } from './shop';
import { dayNumber, fromDateKey, timeToMinutes, toDateKey, upcomingDateKeys } from './time';

export const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/** Weekday `index` (0 = Monday) in the current language: "Monday", or "Mon" when short. */
export function weekdayName(index: number, width: 'long' | 'short' = 'long'): string {
  // 1 January 2024 was a Monday.
  return new Date(2024, 0, 1 + index).toLocaleDateString(dateLocale(), { weekday: width });
}

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

/** The booking window part of Settings or ShopSettings. */
type WindowSettings = { bookingWindowDays: number; specialPeriods: SpecialPeriod[] };

/** How many days (starting today) customers can book, counting special periods that include today. */
export function bookingWindowOn(settings: WindowSettings, today: DateKey): number {
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
  return fitsDayHours(hoursOn(settings, date), start, durationMinutes);
}

/** True if `durationMinutes` from `start` is within `hours` and clear of its breaks (null: closed). */
export function fitsDayHours(
  hours: DayHours | null,
  start: TimeString,
  durationMinutes: number,
): boolean {
  if (!hours) return false;
  const from = timeToMinutes(start);
  const to = from + durationMinutes;
  return (
    from >= timeToMinutes(hours.start) &&
    to <= timeToMinutes(hours.end) &&
    !hours.breaks.some((b) => overlaps(from, to, timeToMinutes(b.start), timeToMinutes(b.end)))
  );
}

/** One weekday of hours: a barber's (with breaks) or the shop's opening hours (without). */
type WeekdayHours = Pick<DayHours, 'closed' | 'start' | 'end'> & { breaks?: DayHours['breaks'] };

function describeDay(hours: WeekdayHours): string {
  if (hours.closed) return i18n.t('schedule.closed');
  const breaks = (hours.breaks ?? []).map((b) => `${b.start}–${b.end}`).join(', ');
  const open = `${hours.start}–${hours.end}`;
  return breaks ? i18n.t('schedule.withBreak', { hours: open, breaks }) : open;
}

/**
 * A week of hours (7 days, Monday first), with consecutive days that share hours grouped:
 * ["Mon–Sat 10:00–20:00 (break 14:00–15:00)", "Sun closed"].
 */
export function weeklyHoursSummary(weeklyHours: WeekdayHours[]): string[] {
  const short = WEEKDAY_NAMES.map((_, i) => weekdayName(i, 'short'));
  const lines: string[] = [];
  let first = 0;
  for (let i = 1; i <= 7; i++) {
    const description = describeDay(weeklyHours[first]);
    if (i < 7 && describeDay(weeklyHours[i]) === description) continue;
    const days = first === i - 1 ? short[first] : `${short[first]}–${short[i - 1]}`;
    lines.push(
      first === 0 && i === 7
        ? i18n.t('schedule.everyDay', { hours: description })
        : i18n.t('schedule.days', { days, hours: description }),
    );
    first = i;
  }
  return lines;
}

export function onGrid(time: TimeString): boolean {
  return timeToMinutes(time) % SLOT_MINUTES === 0;
}

function isWholeDays(n: number, max: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= max;
}

/** What's wrong with `settings`, as messages for Eddy; empty if it can be saved. */
export function settingsErrors(settings: Settings): string[] {
  return [
    ...weeklyHoursErrors(settings.weeklyHours),
    ...servicesErrors(settings.services),
    ...shopInfoErrors(settings.shopAddress, settings.mapsUrl),
    ...windowErrors(settings),
  ];
}

/** What's wrong with one week of hours (7 days, Monday first): times, and up to 2 breaks a day. */
export function weeklyHoursErrors(weeklyHours: DayHours[]): string[] {
  const errors: string[] = [];
  weeklyHours.forEach((hours, i) => {
    const day = weekdayName(i);
    if (hours.closed) return;
    const open = timeToMinutes(hours.start);
    const close = timeToMinutes(hours.end);
    if (!onGrid(hours.start) || !onGrid(hours.end) || open >= close) {
      errors.push(i18n.t('schedule.closingAfterOpening', { day }));
      return;
    }
    if (hours.breaks.length > MAX_BREAKS_PER_DAY) {
      errors.push(i18n.t('schedule.maxBreaks', { day, max: MAX_BREAKS_PER_DAY }));
    }
    const sorted = [...hours.breaks].sort((a, b) => a.start.localeCompare(b.start));
    sorted.forEach((b, j) => {
      const start = timeToMinutes(b.start);
      const end = timeToMinutes(b.end);
      if (!onGrid(b.start) || !onGrid(b.end) || start >= end) {
        errors.push(i18n.t('schedule.breakEndAfterStart', { day }));
      } else if (start < open || end > close) {
        errors.push(i18n.t('schedule.breakWithinHours', { day }));
      } else if (j > 0 && start < timeToMinutes(sorted[j - 1].end)) {
        errors.push(i18n.t('schedule.breaksOverlap', { day }));
      }
    });
  });
  return errors;
}

/** What's wrong with the services: names, lengths and prices. */
export function servicesErrors(services: Service[]): string[] {
  const errors: string[] = [];
  if (services.length === 0) errors.push(i18n.t('schedule.addService'));
  const names = new Set<string>();
  for (const service of services) {
    const name = service.name.trim();
    if (!name) errors.push(i18n.t('schedule.serviceNeedsName'));
    else if (names.has(name.toLowerCase())) errors.push(i18n.t('schedule.duplicateService', { name }));
    names.add(name.toLowerCase());
    const d = service.durationMinutes;
    if (!Number.isInteger(d) || d < SLOT_MINUTES || d > MAX_SERVICE_MINUTES || d % SLOT_MINUTES) {
      errors.push(i18n.t('schedule.serviceLength', { name: name || i18n.t('schedule.aService'), max: MAX_SERVICE_MINUTES }));
    }
    const p = service.price;
    // Whole cents, so "$12.50" is fine but "$12.555" isn't.
    if (p !== undefined && !(p >= 0 && p <= MAX_PRICE && Math.round(p * 100) === p * 100)) {
      errors.push(i18n.t('schedule.servicePrice', { name: name || i18n.t('schedule.aService'), max: MAX_PRICE }));
    }
  }
  return errors;
}

/** What's wrong with the shop's address and Google Maps link. */
export function shopInfoErrors(shopAddress: string, mapsUrl: string): string[] {
  const errors: string[] = [];
  if (shopAddress.trim().length > MAX_ADDRESS_LENGTH) {
    errors.push(i18n.t('schedule.addressLength', { max: MAX_ADDRESS_LENGTH }));
  }
  const url = mapsUrl.trim();
  if (url && (!isSafeLink(url) || url.length > MAX_MAPS_URL_LENGTH)) {
    errors.push(i18n.t('schedule.mapsLink'));
  }
  return errors;
}

/** What's wrong with the booking window and the special periods. */
export function windowErrors(settings: WindowSettings): string[] {
  const errors: string[] = [];
  if (!isWholeDays(settings.bookingWindowDays, MAX_BOOKING_WINDOW_DAYS)) {
    errors.push(i18n.t('schedule.windowDays', { max: MAX_BOOKING_WINDOW_DAYS }));
  }

  if (settings.specialPeriods.length > MAX_SPECIAL_PERIODS) {
    errors.push(i18n.t('schedule.maxSpecialPeriods', { max: MAX_SPECIAL_PERIODS }));
  }
  for (const period of settings.specialPeriods) {
    const name = period.name.trim() || i18n.t('schedule.specialPeriod');
    if (!period.name.trim()) errors.push(i18n.t('schedule.specialNeedsName'));
    if (!period.start || !period.end || period.start > period.end) {
      errors.push(i18n.t('schedule.specialEndAfterStart', { name }));
    } else if (dayNumber(period.end) - dayNumber(period.start) + 1 > MAX_SPECIAL_PERIOD_DAYS) {
      errors.push(i18n.t('schedule.specialMaxDays', { name, max: MAX_SPECIAL_PERIOD_DAYS }));
    }
    if (!isWholeDays(period.daysAhead, MAX_BOOKING_WINDOW_DAYS)) {
      errors.push(i18n.t('schedule.specialDaysAhead', { name, max: MAX_BOOKING_WINDOW_DAYS }));
    }
  }
  return errors;
}
