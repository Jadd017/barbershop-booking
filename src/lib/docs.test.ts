/** Firestore doc shapes for the multi-barber shop: they must convert back to what was saved. */
import { describe, expect, it } from 'vitest';
import { SHOP, barber, day } from '../test/fixtures';
import {
  bookingCount,
  dayDocId,
  fromBarberDoc,
  fromDayDoc,
  hoursFromShop,
  slotKey,
  slotTime,
  sortBarbers,
  toBarberDoc,
  toDayMaps,
} from './barberDoc';
import { DEFAULT_SETTINGS, fromSettingsDoc, toSettingsDoc } from './settingsDoc';
import {
  DEFAULT_COLORS,
  defaultBranding,
  fromBrandingDoc,
  fromShopDoc,
  periodDaysOf,
  toBrandingDoc,
  toShopDoc,
} from './shopDoc';

describe('settings/shop', () => {
  it('converts back to the same settings', () => {
    const shop = {
      ...SHOP,
      services: [...SHOP.services, { id: 'kids', name: 'Kids', durationMinutes: 15 }],
      specialPeriods: [{ name: 'Eid', start: '2027-03-01', end: '2027-03-10', daysAhead: 10 }],
      closedDays: ['2026-12-25', '2026-12-24'],
    };
    expect(fromShopDoc(toShopDoc(shop))).toEqual({
      ...shop,
      closedDays: ['2026-12-24', '2026-12-25'],
    });
  });

  it('stores times as minutes and periods as day numbers, for the rules', () => {
    const doc = toShopDoc({
      ...SHOP,
      specialPeriods: [{ name: 'Eid', start: '1970-01-02', end: '1970-01-03', daysAhead: 7 }],
    });
    expect(doc.openingHours[0]).toEqual({ closed: false, open: 600, close: 1200 });
    expect(doc.specialPeriods[0]).toMatchObject({ startDay: 1, endDay: 2 });
    expect(doc.services.beard).toEqual({ name: 'Beard', durationMinutes: 15, order: 1, price: 5 });
  });

  it("keeps a service's Arabic name, trimmed, and leaves it out when empty", () => {
    const services = [
      { id: 'haircut', name: 'Haircut', nameAr: ' قص شعر ', durationMinutes: 30 },
      { id: 'beard', name: 'Beard', nameAr: '  ', durationMinutes: 15 },
    ];
    const doc = toShopDoc({ ...SHOP, services });
    expect(doc.services.haircut).toEqual({ name: 'Haircut', nameAr: 'قص شعر', durationMinutes: 30, order: 0 });
    expect(doc.services.beard).toEqual({ name: 'Beard', durationMinutes: 15, order: 1 });
    expect(fromShopDoc(doc).services).toEqual([
      { id: 'haircut', name: 'Haircut', nameAr: 'قص شعر', durationMinutes: 30 },
      { id: 'beard', name: 'Beard', durationMinutes: 15 },
    ]);
  });

  it('trims the shop name', () => {
    expect(toShopDoc({ ...SHOP, shopName: '  Sassine Maatouk ' }).shopName).toBe('Sassine Maatouk');
  });

  it("leaves Eddy's current settings doc unchanged (shared helpers)", () => {
    expect(fromSettingsDoc(toSettingsDoc(DEFAULT_SETTINGS))).toEqual(DEFAULT_SETTINGS);
    expect(toSettingsDoc(DEFAULT_SETTINGS).weeklyHours[0]).toEqual({
      closed: false,
      open: 600,
      close: 1200,
      breaks: [{ start: 840, end: 900 }],
    });
  });
});

describe('settings/branding', () => {
  it('converts back, and a missing color falls back to the default', () => {
    const branding = defaultBranding('data:image/webp;base64,AAAA');
    expect(fromBrandingDoc(toBrandingDoc(branding))).toEqual(branding);
    const partial = { logo: null, colors: { dark: '#000000' } } as Parameters<typeof fromBrandingDoc>[0];
    expect(fromBrandingDoc(partial)).toEqual({
      logo: null,
      colors: { ...DEFAULT_COLORS, dark: '#000000' },
    });
  });
});

describe('barbers/{id}', () => {
  it('converts back to the same barber', () => {
    const karim = barber('karim', 2, { daysOff: ['2026-11-02', '2026-11-01'] });
    expect(fromBarberDoc('karim', toBarberDoc(karim))).toEqual({
      ...karim,
      daysOff: ['2026-11-01', '2026-11-02'],
    });
  });

  it("starts a new barber on the shop's hours, without breaks", () => {
    expect(hoursFromShop(SHOP.openingHours)[0]).toEqual({
      closed: false,
      start: '10:00',
      end: '20:00',
      breaks: [],
    });
  });

  it('sorts by order, then name', () => {
    const list = [barber('sami', 1), barber('omar', 0), barber('adam', 1)];
    expect(sortBarbers(list).map((b) => b.id)).toEqual(['omar', 'adam', 'sami']);
  });
});

describe('days/{barberId}_{date}', () => {
  it('names the doc after the barber and the date', () => {
    expect(dayDocId('karim', '2026-10-22')).toBe('karim_2026-10-22');
  });

  it('keys slots as HHMM, like the rules', () => {
    expect(slotKey('09:30')).toBe('0930');
    expect(slotTime('0930')).toBe('09:30');
  });

  it('converts back to the same day', () => {
    const d = day('karim', { K7M2QX: ['09:30', '09:45'], P3R8TZ: ['16:00'] }, ['18:00']);
    const maps = toDayMaps(d);
    expect(maps).toEqual({
      booked: { '0930': 'K7M2QX', '0945': 'K7M2QX', '1600': 'P3R8TZ' },
      blocked: { '1800': true },
    });
    expect(fromDayDoc({ barberId: 'karim', date: d.date, ...maps })).toEqual(d);
  });

  it('counts bookings, not slots', () => {
    expect(bookingCount(day('karim', { A: ['09:30', '09:45'], B: ['16:00'] }, ['18:00']))).toBe(2);
    expect(bookingCount(day('karim'))).toBe(0);
  });
});

describe('settings/shop periodDays (for the booking rule)', () => {
  it('maps every day of each special period to its days ahead, the longest where they overlap', () => {
    const days = periodDaysOf([
      { name: 'A', start: '1970-01-02', end: '1970-01-04', daysAhead: 7 },
      { name: 'B', start: '1970-01-04', end: '1970-01-05', daysAhead: 10 },
    ]);
    expect(days).toEqual({ 1: 7, 2: 7, 3: 10, 4: 10 });
    expect(toShopDoc({ ...SHOP, specialPeriods: [] }).periodDays).toEqual({});
  });
});
