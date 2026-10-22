/**
 * Shape of settings/shop in Firestore, and the values it is first seeded with.
 *
 * Stored in the form that's cheapest for firestore.rules to check (rules may only evaluate
 * 1000 expressions per write): times as minutes since midnight, special periods as day numbers,
 * and services as a map keyed by ID so a booking's serviceId can be looked up directly.
 */
import type { DateKey, DayHours, Service, Settings } from '../types';
import { minutesToTime, timeToMinutes } from './time';

const DEFAULT_DAY: DayHours = {
  closed: false,
  start: '10:00',
  end: '20:00',
  breaks: [{ start: '14:00', end: '15:00' }],
};

/** What settings/shop is created with the first time Eddy opens /admin. */
export const DEFAULT_SETTINGS: Settings = {
  barberName: 'Eddy',
  weeklyHours: Array.from({ length: 7 }, () => structuredClone(DEFAULT_DAY)),
  services: [
    { id: 'haircut', name: 'Haircut', durationMinutes: 30, price: 10 },
    { id: 'beard', name: 'Beard', durationMinutes: 15, price: 5 },
    { id: 'haircut-beard', name: 'Haircut + Beard', durationMinutes: 45, price: 13 },
  ],
  bookingWindowDays: 4,
  specialPeriods: [],
  daysOff: [],
  shopAddress: '',
  mapsUrl: '',
};

/** settings/shop as stored (without updatedAt, which api.ts adds on save). */
export interface SettingsDoc {
  barberName: string;
  /** Monday first. Times in minutes since midnight. */
  weeklyHours: {
    closed: boolean;
    open: number;
    close: number;
    breaks: { start: number; end: number }[];
  }[];
  /** price is left out when the service has none. */
  services: Record<string, { name: string; durationMinutes: number; order: number; price?: number }>;
  bookingWindowDays: number;
  /** startDay and endDay are day numbers (see dayNumber), both included. */
  specialPeriods: { name: string; startDay: number; endDay: number; daysAhead: number }[];
  /** "YYYY-MM-DD", sorted. */
  daysOff: DateKey[];
  /** Both optional in the rules: settings saved before they existed don't have them. */
  shopAddress?: string;
  mapsUrl?: string;
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

export function toSettingsDoc(settings: Settings): SettingsDoc {
  return {
    barberName: settings.barberName,
    weeklyHours: settings.weeklyHours.map((d) => ({
      closed: d.closed,
      open: timeToMinutes(d.start),
      close: timeToMinutes(d.end),
      breaks: d.breaks.map((b) => ({ start: timeToMinutes(b.start), end: timeToMinutes(b.end) })),
    })),
    services: Object.fromEntries(
      settings.services.map((s, order) => [
        s.id,
        {
          name: s.name.trim(),
          durationMinutes: s.durationMinutes,
          order,
          ...(s.price === undefined ? {} : { price: s.price }),
        },
      ]),
    ),
    bookingWindowDays: settings.bookingWindowDays,
    specialPeriods: settings.specialPeriods.map((p) => ({
      name: p.name.trim(),
      startDay: dayNumber(p.start),
      endDay: dayNumber(p.end),
      daysAhead: p.daysAhead,
    })),
    daysOff: [...settings.daysOff].sort(),
    shopAddress: settings.shopAddress.trim(),
    mapsUrl: settings.mapsUrl.trim(),
  };
}

export function fromSettingsDoc(doc: SettingsDoc): Settings {
  const services: Service[] = Object.entries(doc.services ?? {})
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([id, s]) => ({
      id,
      name: s.name,
      durationMinutes: s.durationMinutes,
      ...(typeof s.price === 'number' ? { price: s.price } : {}),
    }));
  return {
    barberName: doc.barberName,
    weeklyHours: doc.weeklyHours.map((d) => ({
      closed: d.closed,
      start: minutesToTime(d.open),
      end: minutesToTime(d.close),
      breaks: d.breaks.map((b) => ({ start: minutesToTime(b.start), end: minutesToTime(b.end) })),
    })),
    services,
    bookingWindowDays: doc.bookingWindowDays,
    specialPeriods: (doc.specialPeriods ?? []).map((p) => ({
      name: p.name,
      start: dateOfDayNumber(p.startDay),
      end: dateOfDayNumber(p.endDay),
      daysAhead: p.daysAhead,
    })),
    daysOff: doc.daysOff ?? [],
    shopAddress: doc.shopAddress ?? '',
    mapsUrl: doc.mapsUrl ?? '',
  };
}
