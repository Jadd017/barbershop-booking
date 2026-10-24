/**
 * Shape of barbers/{barberId} and days/{barberId}_{date} in Firestore (docs/ARCHITECTURE.md, 4.3
 * and 4.4).
 *
 * A barber's hours are stored in minutes, like the shop's, because the booking rule reads them.
 * A day doc keeps each taken 15-min slot under its "HHMM" key, so firestore.rules can find a
 * booking's slots with plain map lookups.
 */
import type { Timestamp } from 'firebase/firestore';
import type { Barber, BarberDay, DateKey, DayHours, OpeningHours, TimeString } from '../types';
import { dayHoursFromDoc, dayHoursToDoc, type DayHoursDoc } from './shopDoc';

/** barbers/{barberId} as stored (without updatedAt). The ID is the doc ID, not a field. */
export interface BarberDoc {
  name: string;
  active: boolean;
  order: number;
  /** Monday first. */
  weeklyHours: DayHoursDoc[];
  /** "YYYY-MM-DD", sorted. */
  daysOff: DateKey[];
}

/** days/{barberId}_{date} as stored. */
export interface DayDoc {
  barberId: string;
  date: DateKey;
  /** "HHMM" → booking ID. */
  booked: Record<string, string>;
  /** "HHMM" → true. */
  blocked: Record<string, true>;
  /** The booking the latest change to `booked` was for (see firestore.rules). */
  lastBookingId?: string;
  /** When `booked` last changed: the rules check a cancel or move changed it in the same write. */
  bookingAt?: Timestamp;
}

/** A new barber's hours: the shop's opening hours, without breaks. */
export function hoursFromShop(openingHours: OpeningHours[]): DayHours[] {
  return openingHours.map((d) => ({ closed: d.closed, start: d.start, end: d.end, breaks: [] }));
}

export function toBarberDoc(barber: Barber): BarberDoc {
  return {
    name: barber.name.trim(),
    active: barber.active,
    order: barber.order,
    weeklyHours: barber.weeklyHours.map(dayHoursToDoc),
    daysOff: [...barber.daysOff].sort(),
  };
}

export function fromBarberDoc(id: string, doc: BarberDoc): Barber {
  return {
    id,
    name: doc.name,
    active: doc.active,
    order: doc.order,
    weeklyHours: doc.weeklyHours.map(dayHoursFromDoc),
    daysOff: doc.daysOff ?? [],
  };
}

/** Customers' order: by `order`, then name, so two barbers with the same order don't swap. */
export function sortBarbers(barbers: Barber[]): Barber[] {
  return [...barbers].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/** ("karim", "2026-10-22") → "karim_2026-10-22", the ID of that day doc. */
export function dayDocId(barberId: string, date: DateKey): string {
  return `${barberId}_${date}`;
}

/** "09:30" → "0930", a slot's key in a day doc. Same as the rules' slot keys. */
export function slotKey(time: TimeString): string {
  return time.replace(':', '');
}

/** "0930" → "09:30". */
export function slotTime(key: string): TimeString {
  return `${key.slice(0, 2)}:${key.slice(2)}`;
}

/** A day with nothing booked or blocked, for days that have no doc yet. */
export function emptyDay(barberId: string, date: DateKey): BarberDay {
  return { barberId, date, booked: new Map(), blocked: new Set() };
}

export function fromDayDoc(doc: DayDoc): BarberDay {
  return {
    barberId: doc.barberId,
    date: doc.date,
    booked: new Map(Object.entries(doc.booked ?? {}).map(([key, id]) => [slotTime(key), id])),
    blocked: new Set(Object.keys(doc.blocked ?? {}).map(slotTime)),
  };
}

/** The maps of a day doc for `day` (barberId, date, lastBookingId and bookingAt are set by api.ts). */
export function toDayMaps(day: BarberDay): Pick<DayDoc, 'booked' | 'blocked'> {
  return {
    booked: Object.fromEntries([...day.booked].map(([time, id]) => [slotKey(time), id])),
    blocked: Object.fromEntries([...day.blocked].map((time) => [slotKey(time), true as const])),
  };
}

/** How many bookings the barber has that day (done and no-show ones included). */
export function bookingCount(day: BarberDay): number {
  return new Set(day.booked.values()).size;
}
