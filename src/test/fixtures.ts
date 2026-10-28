/** Shops and barbers for the multi-barber unit tests. */
import { hoursFromShop } from '../lib/barberDoc';
import { defaultShopSettings } from '../lib/shopDoc';
import type { Barber, BarberDay, DateKey, ShopSettings, TimeString } from '../types';

/** 2026-10-22 is a Thursday (weekday index 3). */
export const THURSDAY = '2026-10-22';
/** The evening before THURSDAY, so nothing on it counts as past. */
export const BEFORE = new Date(2026, 9, 21, 20, 0);

/** Open 10:00–20:00 every day. */
export const SHOP: ShopSettings = {
  ...defaultShopSettings('Sassine Maatouk'),
  whatsapp: '+96170123456',
};

/** Works the shop's hours with a 14:00–15:00 break, unless `overrides` say otherwise. */
export function barber(id: string, order: number, overrides: Partial<Barber> = {}): Barber {
  return {
    id,
    name: id[0].toUpperCase() + id.slice(1),
    active: true,
    order,
    weeklyHours: hoursFromShop(SHOP.openingHours).map((d) => ({
      ...d,
      breaks: [{ start: '14:00', end: '15:00' }],
    })),
    daysOff: [],
    ...overrides,
  };
}

/** A day doc for `barberId` on `date`; `booked` maps each booking ID to its slots. */
export function day(
  barberId: string,
  booked: Record<string, TimeString[]> = {},
  blocked: TimeString[] = [],
  date: DateKey = THURSDAY,
): BarberDay {
  return {
    barberId,
    date,
    booked: new Map(
      Object.entries(booked).flatMap(([id, times]) => times.map((t) => [t, id] as const)),
    ),
    blocked: new Set(blocked),
  };
}
