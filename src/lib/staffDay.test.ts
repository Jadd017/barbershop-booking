import { describe, expect, it } from 'vitest';
import { BEFORE, SHOP, THURSDAY, barber } from '../test/fixtures';
import type { ShopStaffBooking } from '../types';
import { blockError, blockedRanges, bookingsOutsideHours, notWorkingReason } from './staffDay';

const THU = 3;
const FRIDAY = '2026-10-23';

function booking(startTime: string, overrides: Partial<ShopStaffBooking> = {}): ShopStaffBooking {
  return {
    id: `B${startTime}`,
    bookingCode: `B${startTime}`,
    name: 'Rami',
    phone: null,
    serviceName: 'Haircut',
    durationMinutes: 30,
    date: THURSDAY,
    startTime,
    status: 'booked',
    customerEmail: null,
    barberId: 'karim',
    barberName: 'Karim',
    anyBarber: false,
    ...overrides,
  };
}

describe('blockedRanges', () => {
  it('merges back-to-back slots, in order', () => {
    expect(blockedRanges(['16:15', '10:00', '16:00', '10:15', '16:30'])).toEqual([
      { start: '10:00', end: '10:30' },
      { start: '16:00', end: '16:45' },
    ]);
  });

  it('keeps slots with a gap apart', () => {
    expect(blockedRanges(['10:00', '10:30'])).toEqual([
      { start: '10:00', end: '10:15' },
      { start: '10:30', end: '10:45' },
    ]);
    expect(blockedRanges([])).toEqual([]);
  });
});

describe('notWorkingReason', () => {
  it('is null on a day he works', () => {
    expect(notWorkingReason(SHOP, barber('karim', 0), THURSDAY)).toBeNull();
  });

  it('says why he is off, the shop first', () => {
    const karim = barber('karim', 0);
    expect(notWorkingReason({ ...SHOP, closedDays: [THURSDAY] }, { ...karim, daysOff: [THURSDAY] }, THURSDAY)).toBe(
      'The shop is closed on this day.',
    );
    expect(notWorkingReason(SHOP, { ...karim, daysOff: [THURSDAY] }, THURSDAY)).toBe('This is your day off.');
    const offThursdays = karim.weeklyHours.map((d, i) => (i === THU ? { ...d, closed: true } : d));
    expect(notWorkingReason(SHOP, { ...karim, weeklyHours: offThursdays }, THURSDAY)).toBe(
      "You don't work on Thursdays.",
    );
  });

  it('speaks about him to the owner', () => {
    const karim = barber('karim', 0);
    expect(notWorkingReason(SHOP, { ...karim, daysOff: [THURSDAY] }, THURSDAY, false)).toBe("Karim's day off.");
    const offThursdays = karim.weeklyHours.map((d, i) => (i === THU ? { ...d, closed: true } : d));
    expect(notWorkingReason(SHOP, { ...karim, weeklyHours: offThursdays }, THURSDAY, false)).toBe(
      "Karim doesn't work on Thursdays.",
    );
  });
});

describe('bookingsOutsideHours', () => {
  const karim = barber('karim', 0);

  it('lists upcoming bookings in a break, outside his hours or on a day off', () => {
    const inBreak = booking('14:00');
    const fine = booking('11:00');
    const late = booking('19:45');
    const shorter = karim.weeklyHours.map((d) => ({ ...d, end: '19:00' }));
    expect(bookingsOutsideHours(SHOP, { ...karim, weeklyHours: shorter }, [fine, inBreak, late], BEFORE)).toEqual([
      inBreak,
      late,
    ]);
    const friday = booking('11:00', { date: FRIDAY });
    expect(bookingsOutsideHours(SHOP, { ...karim, daysOff: [FRIDAY] }, [fine, friday], BEFORE)).toEqual([friday]);
  });

  it('leaves out past, cancelled and finished bookings', () => {
    const after = new Date(2026, 9, 22, 16, 0);
    const bookings = [
      booking('14:00'),
      booking('14:30', { status: 'cancelled' }),
      booking('19:00', { status: 'done' }),
    ];
    expect(bookingsOutsideHours(SHOP, { ...karim, daysOff: [THURSDAY] }, bookings, after)).toEqual([]);
  });
});

describe('blockError', () => {
  it('accepts a range inside the shop hours', () => {
    expect(blockError(SHOP, THURSDAY, '10:00', '20:00')).toBeNull();
    expect(blockError(SHOP, THURSDAY, '16:00', '17:00')).toBeNull();
  });

  it('refuses a backwards range, a closed day and times outside the shop hours', () => {
    expect(blockError(SHOP, THURSDAY, '17:00', '17:00')).toBe('The end must be after the start.');
    expect(blockError({ ...SHOP, closedDays: [THURSDAY] }, THURSDAY, '16:00', '17:00')).toMatch(/closed/);
    expect(blockError(SHOP, THURSDAY, '09:45', '11:00')).toMatch(/10:00–20:00/);
    expect(blockError(SHOP, THURSDAY, '19:00', '20:15')).toMatch(/10:00–20:00/);
  });
});
