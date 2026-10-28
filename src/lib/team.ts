/**
 * The owner's view of the whole team: each barber's numbers for a day, which barbers a booking
 * can move to, a new barber's ID, and the display order.
 */
import { SLOT_MINUTES } from '../config';
import i18n from '../i18n';
import type { Barber, BarberDay, DateKey, ShopSettings, ShopStaffBooking } from '../types';
import { emptyDay, sortBarbers } from './barberDoc';
import { fitsBarberHours } from './barberSchedule';
import { barberStartTimes, type DaysByBarber } from './barberSlots';
import { slotsNeeded } from './slots';

/** One barber's (or the shop's) numbers for a day. */
export interface DayCounts {
  /** Not cancelled. */
  bookings: number;
  done: number;
  /** Free 15-min slots left in his hours (not booked, blocked, in a break or past). */
  freeSlots: number;
}

/** `barber`'s numbers on `date`, from his bookings that day and his day doc. */
export function dayCounts(
  shop: ShopSettings,
  barber: Barber,
  date: DateKey,
  bookings: ShopStaffBooking[],
  day: BarberDay | undefined,
  now: Date = new Date(),
): DayCounts {
  const mine = bookings.filter((b) => b.barberId === barber.id && b.status !== 'cancelled');
  return {
    bookings: mine.length,
    done: mine.filter((b) => b.status === 'done').length,
    freeSlots: barberStartTimes(date, SLOT_MINUTES, shop, barber, day, now).filter((o) => o.available).length,
  };
}

/** The sum of several barbers' numbers: the whole shop's. */
export function totalCounts(counts: DayCounts[]): DayCounts {
  return counts.reduce(
    (sum, c) => ({ bookings: sum.bookings + c.bookings, done: sum.done + c.done, freeSlots: sum.freeSlots + c.freeSlots }),
    { bookings: 0, done: 0, freeSlots: 0 },
  );
}

/** A barber a booking could move to, and why not if he can't take it. */
export interface MoveOption {
  barber: Barber;
  /** Null if he's free for the whole booking. */
  reason: string | null;
}

/**
 * Every other active barber, in display order, and whether `booking` can move to him: only if he
 * works then (his hours and the shop's, no break or day off) and none of its slots are booked or
 * blocked in his day. firestore.rules re-checks the booked slots when moving.
 */
export function moveOptions(
  shop: ShopSettings,
  booking: ShopStaffBooking,
  barbers: Barber[],
  days: DaysByBarber,
): MoveOption[] {
  const slots = slotsNeeded(booking.startTime, booking.durationMinutes);
  return sortBarbers(barbers.filter((b) => b.active && b.id !== booking.barberId)).map((barber) => {
    const day = days.get(barber.id) ?? emptyDay(barber.id, booking.date);
    const reason = !fitsBarberHours(shop, barber, booking.date, booking.startTime, booking.durationMinutes)
      ? i18n.t('schedule.notWorkingThen')
      : slots.some((t) => day.booked.has(t))
        ? i18n.t('schedule.bookedThen')
        : slots.some((t) => day.blocked.has(t))
          ? i18n.t('schedule.blockedThen')
          : null;
    return { barber, reason };
  });
}

/** Longest barber ID firestore.rules accepts (validBarberId). */
const MAX_BARBER_ID_LENGTH = 20;

/**
 * A new barber's ID from his name ("Karim Haddad" → "karim-haddad"): lower-case letters, digits
 * and dashes, at most 20 characters, not one of `taken` (a number is added if it is).
 */
export function barberIdFor(name: string, taken: string[]): string {
  const base =
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, MAX_BARBER_ID_LENGTH - 3)
      .replace(/-+$/g, '') || 'barber';
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n++) {
    const id = `${base}-${n}`;
    if (!taken.includes(id)) return id;
  }
}

/** A login username suggested from a barber's name: his first name's letters and digits. */
export function usernameFor(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? '';
  return first
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 20);
}

/**
 * The barbers whose display order changes when `barberId` moves one place up (-1) or down (+1):
 * everyone is renumbered 0, 1, 2… in the new order, and only the changed ones are returned.
 */
export function reorderBarbers(barbers: Barber[], barberId: string, step: -1 | 1): Barber[] {
  const list = sortBarbers(barbers);
  const from = list.findIndex((b) => b.id === barberId);
  const to = from + step;
  if (from < 0 || to < 0 || to >= list.length) return [];
  [list[from], list[to]] = [list[to], list[from]];
  return list.flatMap((b, order) => (b.order === order ? [] : [{ ...b, order }]));
}
