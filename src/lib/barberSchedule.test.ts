import { describe, expect, it } from 'vitest';
import { BEFORE, SHOP, THURSDAY, barber } from '../test/fixtures';
import type { ShopSettings } from '../types';
import {
  barberErrors,
  barberHoursOn,
  barbersOutsideShopHours,
  bookableDaysFor,
  fitsBarberHours,
  hoursOutsideShop,
  shopErrors,
  shopHoursOn,
  trimToShopHours,
  windowDaysFor,
} from './barberSchedule';

const THU = 3;
const FRIDAY = '2026-10-23';

/** SHOP with Thursday's hours changed. */
function shopWithThursday(hours: Partial<ShopSettings['openingHours'][number]>): ShopSettings {
  return {
    ...SHOP,
    openingHours: SHOP.openingHours.map((d, i) => (i === THU ? { ...d, ...hours } : d)),
  };
}

describe('shopHoursOn', () => {
  it('is null on a closed weekday or a closed day', () => {
    expect(shopHoursOn(SHOP, THURSDAY)).toEqual({ closed: false, start: '10:00', end: '20:00' });
    expect(shopHoursOn(shopWithThursday({ closed: true }), THURSDAY)).toBeNull();
    expect(shopHoursOn({ ...SHOP, closedDays: [THURSDAY] }, THURSDAY)).toBeNull();
  });
});

describe('barberHoursOn', () => {
  it("is the barber's hours with his breaks", () => {
    expect(barberHoursOn(SHOP, barber('karim', 0), THURSDAY)).toEqual({
      closed: false,
      start: '10:00',
      end: '20:00',
      breaks: [{ start: '14:00', end: '15:00' }],
    });
  });

  it('is null on his weekday off, his day off, or when the shop is closed', () => {
    const karim = barber('karim', 0);
    const weekdayOff = {
      ...karim,
      weeklyHours: karim.weeklyHours.map((d, i) => (i === THU ? { ...d, closed: true } : d)),
    };
    expect(barberHoursOn(SHOP, weekdayOff, THURSDAY)).toBeNull();
    expect(barberHoursOn(SHOP, { ...karim, daysOff: [THURSDAY] }, THURSDAY)).toBeNull();
    expect(barberHoursOn({ ...SHOP, closedDays: [THURSDAY] }, karim, THURSDAY)).toBeNull();
    expect(barberHoursOn(shopWithThursday({ closed: true }), karim, THURSDAY)).toBeNull();
  });

  it("is cut to the shop's hours when the shop's are narrower (breaks too)", () => {
    const shop = shopWithThursday({ start: '12:00', end: '14:30' });
    expect(barberHoursOn(shop, barber('karim', 0), THURSDAY)).toEqual({
      closed: false,
      start: '12:00',
      end: '14:30',
      breaks: [{ start: '14:00', end: '14:30' }],
    });
  });

  it("is null when his hours and the shop's don't overlap", () => {
    const shop = shopWithThursday({ start: '10:00', end: '12:00' });
    const late = barber('karim', 0);
    late.weeklyHours[THU] = { closed: false, start: '13:00', end: '20:00', breaks: [] };
    expect(barberHoursOn(shop, late, THURSDAY)).toBeNull();
  });
});

describe('fitsBarberHours', () => {
  it('checks his hours, his breaks and the shop', () => {
    const karim = barber('karim', 0);
    expect(fitsBarberHours(SHOP, karim, THURSDAY, '10:00', 30)).toBe(true);
    expect(fitsBarberHours(SHOP, karim, THURSDAY, '13:45', 30)).toBe(false); // into his break
    expect(fitsBarberHours(SHOP, karim, THURSDAY, '19:45', 30)).toBe(false); // past closing
    const shop = shopWithThursday({ end: '18:00' });
    expect(fitsBarberHours(shop, karim, THURSDAY, '18:00', 15)).toBe(false); // shop closed then
  });
});

describe('windowDaysFor / bookableDaysFor', () => {
  // BEFORE is Wednesday evening: the 4-day window is Wednesday to Saturday.
  it('offers a day if at least one of the barbers works it', () => {
    const karim = barber('karim', 0, { daysOff: [THURSDAY] });
    const sami = barber('sami', 1, { daysOff: [THURSDAY, FRIDAY] });
    expect(bookableDaysFor(SHOP, [karim], BEFORE)).not.toContain(THURSDAY);
    expect(bookableDaysFor(SHOP, [sami], BEFORE)).not.toContain(FRIDAY);
    expect(bookableDaysFor(SHOP, [karim, sami], BEFORE)).toContain(FRIDAY);
    expect(bookableDaysFor(SHOP, [karim, sami], BEFORE)).not.toContain(THURSDAY);
  });

  it("doesn't open a day for an inactive barber", () => {
    const gone = barber('sami', 1, { active: false });
    expect(bookableDaysFor(SHOP, [gone], BEFORE)).toEqual([]);
    const karim = barber('karim', 0, { daysOff: [THURSDAY] });
    expect(bookableDaysFor(SHOP, [karim, gone], BEFORE)).not.toContain(THURSDAY);
  });

  it('never offers a shop closed day, whoever works', () => {
    const shop = { ...SHOP, closedDays: [FRIDAY] };
    expect(bookableDaysFor(shop, [barber('karim', 0)], BEFORE)).not.toContain(FRIDAY);
  });

  it('lists closed days too, and nothing is open without barbers', () => {
    const days = windowDaysFor(SHOP, [], BEFORE);
    expect(days).toHaveLength(4);
    expect(days.every((d) => !d.open)).toBe(true);
  });
});

describe("barbers' hours inside the shop's", () => {
  it('flags days outside the shop hours, or when the shop is closed', () => {
    const shop = shopWithThursday({ start: '12:00' });
    shop.openingHours[6] = { ...shop.openingHours[6], closed: true }; // Sunday
    expect(hoursOutsideShop(barber('karim', 0).weeklyHours, shop.openingHours)).toEqual([
      "Thursday: must be within the shop's hours (12:00–20:00).",
      'Sunday: the shop is closed.',
    ]);
  });

  it("doesn't flag a day the barber doesn't work", () => {
    const karim = barber('karim', 0);
    karim.weeklyHours[THU] = { ...karim.weeklyHours[THU], closed: true, start: '08:00' };
    expect(hoursOutsideShop(karim.weeklyHours, SHOP.openingHours)).toEqual([]);
  });

  it('trims hours and breaks to fit, and closes days with nothing left', () => {
    const shop = shopWithThursday({ start: '14:30', end: '18:00' });
    shop.openingHours[6] = { ...shop.openingHours[6], closed: true };
    shop.openingHours[0] = { closed: false, start: '10:00', end: '11:00' };
    const karim = barber('karim', 0);
    karim.weeklyHours[0] = { closed: false, start: '12:00', end: '20:00', breaks: [] };
    const trimmed = trimToShopHours(karim.weeklyHours, shop.openingHours);
    expect(trimmed[THU]).toEqual({
      closed: false,
      start: '14:30',
      end: '18:00',
      breaks: [{ start: '14:30', end: '15:00' }],
    });
    expect(trimmed[6].closed).toBe(true);
    expect(trimmed[0]).toEqual({ ...karim.weeklyHours[0], closed: true }); // times kept
    expect(trimmed[1]).toEqual(karim.weeklyHours[1]);
    expect(hoursOutsideShop(trimmed, shop.openingHours)).toEqual([]);
  });

  it('lists the barbers whose hours stick out', () => {
    const shop = shopWithThursday({ end: '18:00' });
    const early = barber('sami', 1);
    early.weeklyHours = early.weeklyHours.map((d) => ({ ...d, end: '18:00' }));
    expect(barbersOutsideShopHours([barber('karim', 0), early], shop).map((b) => b.id)).toEqual([
      'karim',
    ]);
  });
});

describe('barberErrors', () => {
  it('accepts a valid barber', () => {
    expect(barberErrors(barber('karim', 0), SHOP)).toEqual([]);
  });

  it('checks the name, the breaks and the fit inside the shop', () => {
    const b = barber('karim', 0, { name: ' K ' });
    b.weeklyHours[THU] = {
      closed: false,
      start: '09:00',
      end: '20:00',
      breaks: [{ start: '20:00', end: '21:00' }],
    };
    expect(barberErrors(b, SHOP)).toEqual([
      'The name must be 2 to 30 characters.',
      'Thursday: breaks must be within opening hours.',
      "Thursday: must be within the shop's hours (10:00–20:00).",
    ]);
  });
});

describe('shopErrors', () => {
  it('accepts the default shop once it has a WhatsApp number', () => {
    expect(shopErrors(SHOP)).toEqual([]);
    expect(shopErrors({ ...SHOP, whatsapp: '' })).toEqual([
      "Add the shop's WhatsApp number: customers send their bookings to it.",
    ]);
  });

  it('checks the shop name length', () => {
    expect(shopErrors({ ...SHOP, shopName: ' S ' })).toEqual([
      'The shop name must be 2 to 40 characters.',
    ]);
    expect(shopErrors({ ...SHOP, shopName: 'x'.repeat(41) })).toHaveLength(1);
    expect(shopErrors({ ...SHOP, shopName: 'x'.repeat(40) })).toEqual([]);
  });

  it('checks the WhatsApp number and the opening hours', () => {
    expect(shopErrors({ ...SHOP, whatsapp: '+9611234567' })).toEqual([
      'The WhatsApp number must be a Lebanese mobile number.',
    ]);
    expect(shopErrors(shopWithThursday({ start: '20:00' }))).toEqual([
      'Thursday: closing time must be after opening time.',
    ]);
  });
});
