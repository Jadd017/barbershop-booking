/**
 * Shape of settings/shop in Firestore, and the values it is first seeded with.
 *
 * Stored in the form that's cheapest for firestore.rules to check (rules may only evaluate
 * 1000 expressions per write): times as minutes since midnight, special periods as day numbers,
 * and services as a map keyed by ID so a booking's serviceId can be looked up directly.
 *
 * The single-barber shape (Eddy's site, branch eddy-single-barber): shopDoc.ts and barberDoc.ts
 * replace it in the multi-barber code.
 */
import type { DateKey, DayHours, Settings } from '../types';
import {
  DEFAULT_SERVICES,
  dayHoursFromDoc,
  dayHoursToDoc,
  periodsFromDoc,
  periodsToDoc,
  servicesFromDoc,
  servicesToDoc,
  type DayHoursDoc,
  type ServicesDoc,
  type SpecialPeriodDoc,
} from './shopDoc';

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
  services: structuredClone(DEFAULT_SERVICES),
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
  weeklyHours: DayHoursDoc[];
  services: ServicesDoc;
  bookingWindowDays: number;
  specialPeriods: SpecialPeriodDoc[];
  /** "YYYY-MM-DD", sorted. */
  daysOff: DateKey[];
  /** Both optional in the rules: settings saved before they existed don't have them. */
  shopAddress?: string;
  mapsUrl?: string;
}

export function toSettingsDoc(settings: Settings): SettingsDoc {
  return {
    barberName: settings.barberName,
    weeklyHours: settings.weeklyHours.map(dayHoursToDoc),
    services: servicesToDoc(settings.services),
    bookingWindowDays: settings.bookingWindowDays,
    specialPeriods: periodsToDoc(settings.specialPeriods),
    daysOff: [...settings.daysOff].sort(),
    shopAddress: settings.shopAddress.trim(),
    mapsUrl: settings.mapsUrl.trim(),
  };
}

export function fromSettingsDoc(doc: SettingsDoc): Settings {
  return {
    barberName: doc.barberName,
    weeklyHours: doc.weeklyHours.map(dayHoursFromDoc),
    services: servicesFromDoc(doc.services),
    bookingWindowDays: doc.bookingWindowDays,
    specialPeriods: periodsFromDoc(doc.specialPeriods),
    daysOff: doc.daysOff ?? [],
    shopAddress: doc.shopAddress ?? '',
    mapsUrl: doc.mapsUrl ?? '',
  };
}
