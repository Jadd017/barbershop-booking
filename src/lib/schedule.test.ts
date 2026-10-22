import { describe, expect, it } from 'vitest';
import type { Settings } from '../types';
import {
  bookableDays,
  bookingWindowOn,
  fitsHours,
  settingsErrors,
  weeklyHoursSummary,
  windowDays,
} from './schedule';
import { DEFAULT_SETTINGS } from './settingsDoc';

const base: Settings = DEFAULT_SETTINGS;
// 2026-10-22 is a Thursday.
const NOW = new Date(2026, 9, 22, 9, 0);

describe('bookingWindowOn / bookableDays', () => {
  it('offers today plus the next 3 days by default', () => {
    expect(bookableDays(base, NOW)).toEqual(['2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
  });

  it('skips closed weekdays and days off', () => {
    const s: Settings = {
      ...base,
      weeklyHours: base.weeklyHours.map((d, i) => (i === 5 ? { ...d, closed: true } : d)), // Saturday
      daysOff: ['2026-10-23'],
    };
    expect(bookableDays(s, NOW)).toEqual(['2026-10-22', '2026-10-25']);
  });

  it('uses a special period only while today is in it', () => {
    const period = { name: 'Christmas', start: '2026-12-15', end: '2026-12-31', daysAhead: 10 };
    const s: Settings = { ...base, specialPeriods: [period] };
    expect(bookingWindowOn(s, '2026-12-14')).toBe(4);
    expect(bookingWindowOn(s, '2026-12-15')).toBe(10);
    expect(bookingWindowOn(s, '2026-12-31')).toBe(10);
    expect(bookingWindowOn(s, '2027-01-01')).toBe(4);
  });

  it('windowDays lists the closed days too, and its open days are bookableDays', () => {
    const s: Settings = { ...base, daysOff: ['2026-10-23'] };
    expect(windowDays(s, NOW)).toEqual([
      { date: '2026-10-22', open: true },
      { date: '2026-10-23', open: false },
      { date: '2026-10-24', open: true },
      { date: '2026-10-25', open: true },
    ]);
    expect(windowDays(s, NOW).filter((d) => d.open).map((d) => d.date)).toEqual(bookableDays(s, NOW));
  });

  it('never shortens the normal window', () => {
    const s: Settings = {
      ...base,
      specialPeriods: [{ name: 'X', start: '2026-10-01', end: '2026-10-31', daysAhead: 2 }],
    };
    expect(bookingWindowOn(s, '2026-10-22')).toBe(4);
  });
});

describe('fitsHours', () => {
  it('checks hours and breaks', () => {
    expect(fitsHours(base, '2026-10-22', '10:00', 30)).toBe(true);
    expect(fitsHours(base, '2026-10-22', '09:45', 30)).toBe(false);
    expect(fitsHours(base, '2026-10-22', '19:45', 30)).toBe(false);
    expect(fitsHours(base, '2026-10-22', '13:45', 30)).toBe(false);
    expect(fitsHours(base, '2026-10-22', '15:00', 30)).toBe(true);
  });
});

describe('weeklyHoursSummary', () => {
  it('says "every day" when all days match', () => {
    expect(weeklyHoursSummary(base)).toEqual(['Every day 10:00–20:00 (break 14:00–15:00)']);
  });

  it('groups consecutive days with the same hours', () => {
    const s: Settings = {
      ...base,
      weeklyHours: base.weeklyHours.map((d, i) =>
        i === 5 ? { ...d, end: '16:00', breaks: [] } : i === 6 ? { ...d, closed: true } : d,
      ),
    };
    expect(weeklyHoursSummary(s)).toEqual([
      'Mon–Fri 10:00–20:00 (break 14:00–15:00)',
      'Sat 10:00–16:00',
      'Sun closed',
    ]);
  });
});

describe('settingsErrors', () => {
  it('accepts the defaults', () => {
    expect(settingsErrors(base)).toEqual([]);
  });

  it('catches bad hours, breaks, services and windows', () => {
    const s: Settings = {
      ...base,
      weeklyHours: base.weeklyHours.map((d, i) =>
        i === 0
          ? { ...d, start: '20:00', end: '10:00' }
          : i === 1
            ? { ...d, breaks: [{ start: '09:00', end: '10:30' }] }
            : i === 2
              ? {
                  ...d,
                  breaks: [
                    { start: '12:00', end: '13:00' },
                    { start: '12:30', end: '13:30' },
                  ],
                }
              : d,
      ),
      services: [
        { id: 'a', name: 'Cut', durationMinutes: 75 },
        { id: 'b', name: 'cut', durationMinutes: 30 },
      ],
      bookingWindowDays: 0,
      specialPeriods: [{ name: '', start: '2026-12-31', end: '2026-12-01', daysAhead: 5 }],
    };
    expect(settingsErrors(s)).toEqual([
      'Monday: closing time must be after opening time.',
      'Tuesday: breaks must be within opening hours.',
      'Wednesday: breaks overlap.',
      'Cut: length must be 15 to 60 minutes.',
      'Two services are called "cut".',
      'Booking window must be 1 to 60 days.',
      'Every special period needs a name.',
      'Special period: the end date must be on or after the start date.',
    ]);
  });

  it('accepts prices in whole cents up to $1000, or none', () => {
    const withPrice = (price: number | undefined) =>
      settingsErrors({ ...base, services: [{ ...base.services[0], price }] });
    expect(withPrice(undefined)).toEqual([]);
    expect(withPrice(0)).toEqual([]);
    expect(withPrice(12.5)).toEqual([]);
    expect(withPrice(1000)).toEqual([]);
    expect(withPrice(-1)).toHaveLength(1);
    expect(withPrice(1001)).toHaveLength(1);
    expect(withPrice(12.555)).toHaveLength(1);
    expect(withPrice(NaN)).toHaveLength(1);
  });

  it('accepts only an https maps link, and a short enough address', () => {
    const shop = (mapsUrl: string, shopAddress = '') => settingsErrors({ ...base, mapsUrl, shopAddress });
    expect(shop('')).toEqual([]);
    expect(shop('https://maps.app.goo.gl/abc123', 'Hamra Street, Beirut')).toEqual([]);
    expect(shop('javascript:alert(1)')).toHaveLength(1);
    expect(shop('http://maps.google.com')).toHaveLength(1);
    expect(shop('https://maps.google.com/a b')).toHaveLength(1);
    expect(shop('', 'x'.repeat(201))).toHaveLength(1);
  });
});
