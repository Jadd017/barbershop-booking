/**
 * Start times per barber, the "Any barber" view across them, and which barber "Any barber" gets
 * (docs/ARCHITECTURE.md, 6 and 7).
 *
 * Each barber has his own slots, so two barbers can be booked at the same time. A barber's slot
 * is taken when it's booked or blocked in his day doc.
 */
import type {
  AnyStartTimeOption,
  Barber,
  BarberDay,
  DateKey,
  ShopSettings,
  StartTimeOption,
  TimeString,
} from '../types';
import { bookingCount, emptyDay, sortBarbers } from './barberDoc';
import { barberHoursOn } from './barberSchedule';
import { startTimesWithin } from './slots';

/** Day docs by barber ID; a barber with no doc that day has nothing booked or blocked. */
export type DaysByBarber = ReadonlyMap<string, BarberDay>;

/** Customers only ever see and get active barbers, in display order. */
function bookable(barbers: Barber[]): Barber[] {
  return sortBarbers(barbers.filter((b) => b.active));
}

function dayOf(days: DaysByBarber, barberId: string, date: DateKey): BarberDay {
  return days.get(barberId) ?? emptyDay(barberId, date);
}

/** Booked or blocked: a customer can't have it. */
function takenSlots(day: BarberDay): Set<TimeString> {
  return new Set([...day.booked.keys(), ...day.blocked]);
}

/**
 * Every start time on the grid during `barber`'s hours on `date` (breaks left out), and whether a
 * service of `durationMinutes` can start there with him. Empty when he can't be booked that day,
 * or is inactive.
 */
export function barberStartTimes(
  date: DateKey,
  durationMinutes: number,
  shop: ShopSettings,
  barber: Barber,
  day: BarberDay | undefined,
  now: Date = new Date(),
): StartTimeOption[] {
  if (!barber.active) return [];
  return startTimesWithin(
    date,
    durationMinutes,
    barberHoursOn(shop, barber, date),
    takenSlots(day ?? emptyDay(barber.id, date)),
    now,
  );
}

/**
 * "Any barber": every start time any of `barbers` lists on `date`, available if at least one of
 * them is free for the whole service then. Inactive barbers are left out.
 */
export function anyBarberStartTimes(
  date: DateKey,
  durationMinutes: number,
  shop: ShopSettings,
  barbers: Barber[],
  days: DaysByBarber,
  now: Date = new Date(),
): AnyStartTimeOption[] {
  const byTime = new Map<TimeString, string[]>();
  for (const barber of bookable(barbers)) {
    const day = dayOf(days, barber.id, date);
    for (const option of barberStartTimes(date, durationMinutes, shop, barber, day, now)) {
      const free = byTime.get(option.time) ?? [];
      if (option.available) free.push(barber.id);
      byTime.set(option.time, free);
    }
  }
  return [...byTime]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, freeBarberIds]) => ({ time, available: freeBarberIds.length > 0, freeBarberIds }));
}

/**
 * The active barbers among `barbers` free for `durationMinutes` from `start` on `date`, in display
 * order.
 */
export function freeBarbers(
  date: DateKey,
  start: TimeString,
  durationMinutes: number,
  shop: ShopSettings,
  barbers: Barber[],
  days: DaysByBarber,
  now: Date = new Date(),
): Barber[] {
  return bookable(barbers).filter((barber) =>
    barberStartTimes(date, durationMinutes, shop, barber, dayOf(days, barber.id, date), now).some(
      (o) => o.time === start && o.available,
    ),
  );
}

/**
 * Who "Any barber" gets among the free `candidates`: the one with the fewest bookings that day,
 * then the lowest display order; never an inactive one. Null if nobody is left. api.ts calls it
 * inside the booking transaction, with the day docs it read there.
 */
export function chooseAnyBarber(
  candidates: Barber[],
  date: DateKey,
  days: DaysByBarber,
): Barber | null {
  let best: Barber | null = null;
  let bestCount = Infinity;
  for (const barber of bookable(candidates)) {
    const count = bookingCount(dayOf(days, barber.id, date));
    if (count < bestCount) {
      best = barber;
      bestCount = count;
    }
  }
  return best;
}
