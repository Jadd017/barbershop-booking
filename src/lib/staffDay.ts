/**
 * A barber's own day and schedule, as the staff dashboard shows them: blocked time as ranges, why
 * he isn't working on a day, the bookings his schedule changes would leave outside his hours, and
 * whether a time range can be blocked.
 */
import { SLOT_MINUTES } from '../config';
import i18n from '../i18n';
import type { Barber, DateKey, ShopSettings, ShopStaffBooking, TimeRange, TimeString } from '../types';
import { fitsBarberHours, shopHoursOn } from './barberSchedule';
import { weekdayIndex, weekdayName } from './schedule';
import { isPast } from './slots';
import { minutesToTime, timeToMinutes } from './time';

/** Blocked slots merged into ranges of back-to-back slots, soonest first. */
export function blockedRanges(blocked: Iterable<TimeString>): TimeRange[] {
  const ranges: TimeRange[] = [];
  for (const start of [...blocked].sort()) {
    const end = minutesToTime(timeToMinutes(start) + SLOT_MINUTES);
    const last = ranges[ranges.length - 1];
    if (last?.end === start) last.end = end;
    else ranges.push({ start, end });
  }
  return ranges;
}

/**
 * Why `barber` isn't working on `date`, as a sentence for him (or, with `self` false, about him
 * for the owner), or null if he is: the shop is closed, it's his day off, or he doesn't work that
 * weekday.
 */
export function notWorkingReason(shop: ShopSettings, barber: Barber, date: DateKey, self = true): string | null {
  if (!shopHoursOn(shop, date)) return i18n.t('schedule.shopClosedToday');
  if (barber.daysOff.includes(date)) {
    return self ? i18n.t('schedule.yourDayOff') : i18n.t('schedule.theirDayOff', { name: barber.name });
  }
  const weekday = weekdayIndex(date);
  if (barber.weeklyHours[weekday]?.closed) {
    const day = weekdayName(weekday);
    return self ? i18n.t('schedule.youDontWork', { day }) : i18n.t('schedule.theyDontWork', { name: barber.name, day });
  }
  return null;
}

/**
 * The still-to-come bookings among `bookings` that `barber` (with his schedule as given) can't
 * do: on a closed day or a day off, outside his hours or the shop's, or in a break.
 */
export function bookingsOutsideHours(
  shop: ShopSettings,
  barber: Barber,
  bookings: ShopStaffBooking[],
  now: Date = new Date(),
): ShopStaffBooking[] {
  return bookings.filter(
    (b) =>
      b.status === 'booked' &&
      !isPast(b.date, b.startTime, now) &&
      !fitsBarberHours(shop, barber, b.date, b.startTime, b.durationMinutes),
  );
}

/**
 * What's wrong with blocking `start`–`end` on `date`, as a message, or null if it's fine: the
 * range must be the right way round and inside the shop's hours, on a day the shop is open.
 */
export function blockError(shop: ShopSettings, date: DateKey, start: TimeString, end: TimeString): string | null {
  if (timeToMinutes(start) >= timeToMinutes(end)) return i18n.t('schedule.blockEndAfterStart');
  const hours = shopHoursOn(shop, date);
  if (!hours) return i18n.t('schedule.blockShopClosed');
  if (timeToMinutes(start) < timeToMinutes(hours.start) || timeToMinutes(end) > timeToMinutes(hours.end)) {
    return i18n.t('schedule.blockWithinShop', { start: hours.start, end: hours.end });
  }
  return null;
}
