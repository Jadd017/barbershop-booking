/**
 * Shape of settings/shop and settings/branding in Firestore, and the values a new shop starts with.
 *
 * Like settingsDoc.ts, settings/shop is stored in the form that's cheapest for firestore.rules to
 * check: times as minutes since midnight, special periods as day numbers, and services as a map
 * keyed by ID. settings/branding is never read by the rules, so it's stored as is.
 */
import type {
  BrandColors,
  Branding,
  DayHours,
  OpeningHours,
  Service,
  ShopSettings,
  SpecialPeriod,
} from '../types';
import { dateOfDayNumber, dayNumber, minutesToTime, timeToMinutes } from './time';

/** settings/shop as stored (without updatedAt, which api.ts adds on save). */
export interface ShopDoc {
  shopName: string;
  /** Monday first. Times in minutes since midnight. */
  openingHours: { closed: boolean; open: number; close: number }[];
  services: ServicesDoc;
  bookingWindowDays: number;
  specialPeriods: SpecialPeriodDoc[];
  /**
   * Day number (as a string) → how many days ahead customers can book on that day, for every day
   * inside a special period. Worked out from specialPeriods, so the booking rule needs one lookup
   * instead of checking each period (see firestore.rules, withinWindow).
   */
  periodDays: Record<string, number>;
  /** "YYYY-MM-DD", sorted. */
  closedDays: string[];
  whatsapp: string;
  shopAddress: string;
  mapsUrl: string;
}

/** settings/branding as stored (without updatedAt). */
export interface BrandingDoc {
  logo: string | null;
  colors: BrandColors;
}

/** price and nameAr are left out when the service has none. */
export type ServicesDoc = Record<
  string,
  { name: string; nameAr?: string; durationMinutes: number; order: number; price?: number }
>;

/** startDay and endDay are day numbers (see dayNumber), both included. */
export interface SpecialPeriodDoc {
  name: string;
  startDay: number;
  endDay: number;
  daysAhead: number;
}

/** One weekday of a barber's hours as stored: minutes since midnight. */
export interface DayHoursDoc {
  closed: boolean;
  open: number;
  close: number;
  breaks: { start: number; end: number }[];
}

export const DEFAULT_SERVICES: Service[] = [
  { id: 'haircut', name: 'Haircut', durationMinutes: 30, price: 10 },
  { id: 'beard', name: 'Beard', durationMinutes: 15, price: 5 },
  { id: 'haircut-beard', name: 'Haircut + Beard', durationMinutes: 45, price: 13 },
];

/** Today's charcoal, brass and cream (src/index.css). */
export const DEFAULT_COLORS: BrandColors = { dark: '#1E1B18', accent: '#B8893C', light: '#F5EFE6' };

/**
 * What settings/shop is created with the first time the owner opens a new shop's dashboard.
 * `shopName` comes from the shop's config file (VITE_SHOP_NAME).
 */
export function defaultShopSettings(shopName: string): ShopSettings {
  return {
    shopName,
    openingHours: Array.from({ length: 7 }, () => ({ closed: false, start: '10:00', end: '20:00' })),
    services: structuredClone(DEFAULT_SERVICES),
    bookingWindowDays: 4,
    specialPeriods: [],
    closedDays: [],
    whatsapp: '',
    shopAddress: '',
    mapsUrl: '',
  };
}

/** What settings/branding is created with; `logo` is the config logo, or null without one. */
export function defaultBranding(logo: string | null): Branding {
  return { logo, colors: { ...DEFAULT_COLORS } };
}

export function servicesToDoc(services: Service[]): ServicesDoc {
  return Object.fromEntries(
    services.map((s, order) => [
      s.id,
      {
        name: s.name.trim(),
        ...(s.nameAr?.trim() ? { nameAr: s.nameAr.trim() } : {}),
        durationMinutes: s.durationMinutes,
        order,
        ...(s.price === undefined ? {} : { price: s.price }),
      },
    ]),
  );
}

export function servicesFromDoc(doc: ServicesDoc | undefined): Service[] {
  return Object.entries(doc ?? {})
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([id, s]) => ({
      id,
      name: s.name,
      ...(typeof s.nameAr === 'string' && s.nameAr ? { nameAr: s.nameAr } : {}),
      durationMinutes: s.durationMinutes,
      ...(typeof s.price === 'number' ? { price: s.price } : {}),
    }));
}

export function periodsToDoc(periods: SpecialPeriod[]): SpecialPeriodDoc[] {
  return periods.map((p) => ({
    name: p.name.trim(),
    startDay: dayNumber(p.start),
    endDay: dayNumber(p.end),
    daysAhead: p.daysAhead,
  }));
}

/** periodDays for `periods`: where periods overlap, the longest window wins. */
export function periodDaysOf(periods: SpecialPeriod[]): Record<string, number> {
  const days: Record<string, number> = {};
  for (const p of periods) {
    for (let day = dayNumber(p.start); day <= dayNumber(p.end); day++) {
      days[day] = Math.max(days[day] ?? 0, p.daysAhead);
    }
  }
  return days;
}

export function periodsFromDoc(periods: SpecialPeriodDoc[] | undefined): SpecialPeriod[] {
  return (periods ?? []).map((p) => ({
    name: p.name,
    start: dateOfDayNumber(p.startDay),
    end: dateOfDayNumber(p.endDay),
    daysAhead: p.daysAhead,
  }));
}

export function dayHoursToDoc(d: DayHours): DayHoursDoc {
  return {
    closed: d.closed,
    open: timeToMinutes(d.start),
    close: timeToMinutes(d.end),
    breaks: d.breaks.map((b) => ({ start: timeToMinutes(b.start), end: timeToMinutes(b.end) })),
  };
}

export function dayHoursFromDoc(d: DayHoursDoc): DayHours {
  return {
    closed: d.closed,
    start: minutesToTime(d.open),
    end: minutesToTime(d.close),
    breaks: d.breaks.map((b) => ({ start: minutesToTime(b.start), end: minutesToTime(b.end) })),
  };
}

function openingHoursToDoc(d: OpeningHours): ShopDoc['openingHours'][number] {
  return { closed: d.closed, open: timeToMinutes(d.start), close: timeToMinutes(d.end) };
}

export function toShopDoc(shop: ShopSettings): ShopDoc {
  return {
    shopName: shop.shopName.trim(),
    openingHours: shop.openingHours.map(openingHoursToDoc),
    services: servicesToDoc(shop.services),
    bookingWindowDays: shop.bookingWindowDays,
    specialPeriods: periodsToDoc(shop.specialPeriods),
    periodDays: periodDaysOf(shop.specialPeriods),
    closedDays: [...shop.closedDays].sort(),
    whatsapp: shop.whatsapp,
    shopAddress: shop.shopAddress.trim(),
    mapsUrl: shop.mapsUrl.trim(),
  };
}

export function fromShopDoc(doc: ShopDoc): ShopSettings {
  return {
    shopName: doc.shopName,
    openingHours: doc.openingHours.map((d) => ({
      closed: d.closed,
      start: minutesToTime(d.open),
      end: minutesToTime(d.close),
    })),
    services: servicesFromDoc(doc.services),
    bookingWindowDays: doc.bookingWindowDays,
    specialPeriods: periodsFromDoc(doc.specialPeriods),
    closedDays: doc.closedDays ?? [],
    whatsapp: doc.whatsapp ?? '',
    shopAddress: doc.shopAddress ?? '',
    mapsUrl: doc.mapsUrl ?? '',
  };
}

export function toBrandingDoc(branding: Branding): BrandingDoc {
  return { logo: branding.logo, colors: { ...branding.colors } };
}

export function fromBrandingDoc(doc: BrandingDoc): Branding {
  return { logo: doc.logo ?? null, colors: { ...DEFAULT_COLORS, ...doc.colors } };
}
