/**
 * Who works when, for the multi-barber shop: the shop's opening hours and closed days, each
 * barber's own hours, breaks and days off, and the booking window.
 *
 * A barber can be booked only where both agree: on a day the shop is open and he works, within
 * the overlap of the shop's hours and his, outside his breaks. firestore.rules re-checks the same
 * for customer bookings, so keep the two in step.
 */
import {
  MAX_BARBER_NAME_LENGTH,
  MAX_SHOP_NAME_LENGTH,
  MIN_BARBER_NAME_LENGTH,
  MIN_SHOP_NAME_LENGTH,
} from '../config';
import i18n from '../i18n';
import type { Barber, DateKey, DayHours, OpeningHours, ShopSettings, TimeString } from '../types';
import { normalizeLebanesePhone } from './phone';
import {
  weekdayName,
  bookingWindowOn,
  fitsDayHours,
  servicesErrors,
  shopInfoErrors,
  weekdayIndex,
  weeklyHoursErrors,
  windowErrors,
} from './schedule';
import { minutesToTime, timeToMinutes, toDateKey, upcomingDateKeys } from './time';

/** The shop's hours on `date`, or null if it's closed then (closed weekday or closed day). */
export function shopHoursOn(shop: ShopSettings, date: DateKey): OpeningHours | null {
  const hours = shop.openingHours[weekdayIndex(date)];
  if (!hours || hours.closed || shop.closedDays.includes(date)) return null;
  return hours;
}

/**
 * When `barber` can be booked on `date`: the overlap of the shop's hours and his, with his breaks
 * (cut to fit). Null if the shop is closed, he doesn't work that weekday, it's his day off, or the
 * two don't overlap.
 */
export function barberHoursOn(shop: ShopSettings, barber: Barber, date: DateKey): DayHours | null {
  const shopHours = shopHoursOn(shop, date);
  const own = barber.weeklyHours[weekdayIndex(date)];
  if (!shopHours || !own || own.closed || barber.daysOff.includes(date)) return null;
  return overlapWithShop(own, shopHours);
}

/** `hours` cut to fit inside `shopHours` (breaks too), or null if nothing is left. */
function overlapWithShop(hours: DayHours, shopHours: OpeningHours): DayHours | null {
  const start = Math.max(timeToMinutes(hours.start), timeToMinutes(shopHours.start));
  const end = Math.min(timeToMinutes(hours.end), timeToMinutes(shopHours.end));
  if (start >= end) return null;
  const breaks = hours.breaks
    .map((b) => ({
      start: Math.max(timeToMinutes(b.start), start),
      end: Math.min(timeToMinutes(b.end), end),
    }))
    .filter((b) => b.start < b.end)
    .map((b) => ({ start: minutesToTime(b.start), end: minutesToTime(b.end) }));
  return { closed: false, start: minutesToTime(start), end: minutesToTime(end), breaks };
}

/** True if `barber` can do `durationMinutes` from `start` on `date` (hours, breaks, days off). */
export function fitsBarberHours(
  shop: ShopSettings,
  barber: Barber,
  date: DateKey,
  start: TimeString,
  durationMinutes: number,
): boolean {
  return fitsDayHours(barberHoursOn(shop, barber, date), start, durationMinutes);
}

/**
 * Every day of the booking window, and whether at least one of `barbers` can be booked then
 * (pass one barber for a chosen barber, or all of them for "Any barber"). Inactive barbers never
 * open a day.
 */
export function windowDaysFor(
  shop: ShopSettings,
  barbers: Barber[],
  now: Date = new Date(),
): { date: DateKey; open: boolean }[] {
  return upcomingDateKeys(bookingWindowOn(shop, toDateKey(now)), now).map((date) => ({
    date,
    open: barbers.some((barber) => barber.active && barberHoursOn(shop, barber, date) !== null),
  }));
}

/** The days customers can pick from for `barbers`: the open days of windowDaysFor. */
export function bookableDaysFor(
  shop: ShopSettings,
  barbers: Barber[],
  now: Date = new Date(),
): DateKey[] {
  return windowDaysFor(shop, barbers, now)
    .filter((d) => d.open)
    .map((d) => d.date);
}

/**
 * Where `weeklyHours` go outside the shop's opening hours, as messages for the barber:
 * open on a weekday the shop is closed, or starting before / ending after the shop.
 */
export function hoursOutsideShop(weeklyHours: DayHours[], openingHours: OpeningHours[]): string[] {
  const errors: string[] = [];
  weeklyHours.forEach((hours, i) => {
    const shopHours = openingHours[i];
    if (hours.closed || !shopHours) return;
    const day = weekdayName(i);
    if (shopHours.closed) {
      errors.push(i18n.t('schedule.shopClosedOnDay', { day }));
    } else if (
      timeToMinutes(hours.start) < timeToMinutes(shopHours.start) ||
      timeToMinutes(hours.end) > timeToMinutes(shopHours.end)
    ) {
      errors.push(i18n.t('schedule.withinShopHours', { day, start: shopHours.start, end: shopHours.end }));
    }
  });
  return errors;
}

/**
 * `weeklyHours` cut to fit inside the shop's opening hours: hours and breaks clipped, and a day
 * closed where the shop is closed or nothing is left. Used after the owner narrows the shop's
 * hours. Closed days keep their times, so reopening restores them.
 */
export function trimToShopHours(weeklyHours: DayHours[], openingHours: OpeningHours[]): DayHours[] {
  return weeklyHours.map((hours, i) => {
    const shopHours = openingHours[i];
    if (hours.closed || !shopHours) return hours;
    if (shopHours.closed) return { ...hours, closed: true };
    return overlapWithShop(hours, shopHours) ?? { ...hours, closed: true };
  });
}

/** The barbers whose hours go outside the shop's opening hours (after the owner changed them). */
export function barbersOutsideShopHours(barbers: Barber[], shop: ShopSettings): Barber[] {
  return barbers.filter((b) => hoursOutsideShop(b.weeklyHours, shop.openingHours).length > 0);
}

function lengthBetween(text: string, min: number, max: number): boolean {
  const length = text.trim().length;
  return length >= min && length <= max;
}

/** What's wrong with `barber` (name, hours, breaks, fit inside the shop); empty if it can be saved. */
export function barberErrors(barber: Barber, shop: ShopSettings): string[] {
  const errors: string[] = [];
  if (!lengthBetween(barber.name, MIN_BARBER_NAME_LENGTH, MAX_BARBER_NAME_LENGTH)) {
    errors.push(
      i18n.t('schedule.barberNameLength', { min: MIN_BARBER_NAME_LENGTH, max: MAX_BARBER_NAME_LENGTH }),
    );
  }
  return [
    ...errors,
    ...weeklyHoursErrors(barber.weeklyHours),
    ...hoursOutsideShop(barber.weeklyHours, shop.openingHours),
  ];
}

/** What's wrong with the shop's settings, as messages for the owner; empty if they can be saved. */
export function shopErrors(shop: ShopSettings): string[] {
  const errors: string[] = [];
  if (!lengthBetween(shop.shopName, MIN_SHOP_NAME_LENGTH, MAX_SHOP_NAME_LENGTH)) {
    errors.push(
      i18n.t('schedule.shopNameLength', { min: MIN_SHOP_NAME_LENGTH, max: MAX_SHOP_NAME_LENGTH }),
    );
  }
  if (!shop.whatsapp) {
    errors.push(i18n.t('schedule.addWhatsapp'));
  } else if (normalizeLebanesePhone(shop.whatsapp) !== shop.whatsapp) {
    errors.push(i18n.t('schedule.whatsappLebanese'));
  }
  return [
    ...errors,
    // Opening hours are checked like a barber's hours without breaks.
    ...weeklyHoursErrors(shop.openingHours.map((d) => ({ ...d, breaks: [] }))),
    ...servicesErrors(shop.services),
    ...shopInfoErrors(shop.shopAddress, shop.mapsUrl),
    ...windowErrors(shop),
  ];
}
