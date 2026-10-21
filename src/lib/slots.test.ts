import { describe, expect, it } from 'vitest';
import type { Settings, TimeString } from '../types';
import { getStartTimes, isPast, slotsNeeded } from './slots';

const settings: Settings = {
  barberName: 'Eddy',
  workingHours: { start: '10:00', end: '20:00' },
  breakTime: { start: '14:00', end: '15:00' },
  services: [],
};

const DAY = '2026-10-22';
/** The day before DAY, so nothing on DAY counts as past. */
const EARLIER = new Date(2026, 9, 21, 9, 0);

/** Availability of each start time, as a map for easy lookups. */
function availability(
  durationMinutes: number,
  taken: TimeString[] = [],
  now: Date = EARLIER,
): Map<TimeString, boolean> {
  const options = getStartTimes(DAY, durationMinutes, settings, new Set(taken), now);
  return new Map(options.map((o) => [o.time, o.available]));
}

describe('slotsNeeded', () => {
  it('lists every 15-min slot a service occupies', () => {
    expect(slotsNeeded('12:30', 45)).toEqual(['12:30', '12:45', '13:00']);
    expect(slotsNeeded('12:30', 30)).toEqual(['12:30', '12:45']);
    expect(slotsNeeded('12:30', 15)).toEqual(['12:30']);
  });
});

describe('getStartTimes: taken slots', () => {
  it('blocks a 45-min service whose 2nd slot is taken', () => {
    const a = availability(45, ['12:45']);
    expect(a.get('12:30')).toBe(false); // needs 12:30, 12:45, 13:00
    expect(a.get('12:45')).toBe(false);
  });

  it('blocks a 45-min service whose last slot is taken', () => {
    const a = availability(45, ['13:00']);
    expect(a.get('12:30')).toBe(false);
    expect(a.get('12:15')).toBe(true); // 12:15, 12:30, 12:45: ends right as 13:00 starts
  });

  it('allows start times that end exactly when a taken slot begins', () => {
    const a = availability(45, ['12:45']);
    expect(a.get('12:00')).toBe(true); // 12:00, 12:15, 12:30
    expect(a.get('13:00')).toBe(true); // starts right after
  });

  it('only blocks shorter services where they really overlap', () => {
    const a = availability(15, ['12:45']);
    expect(a.get('12:30')).toBe(true);
    expect(a.get('12:45')).toBe(false);
    expect(a.get('13:00')).toBe(true);
  });

  // Regression: Oct 22 had a booking at 13:15–14:00. For a 45-min service, 12:45 is grey
  // (it would run into 13:15) while 12:30 is free (12:30–13:15). That is correct.
  it('greys a start time that would run into a later booking, not just taken ones', () => {
    const a = availability(45, ['13:15', '13:30', '13:45']);
    expect(a.get('12:30')).toBe(true);
    expect(a.get('12:45')).toBe(false);
    expect(a.get('13:00')).toBe(false);
  });
});

describe('getStartTimes: break', () => {
  it("doesn't list start times during the break", () => {
    const a = availability(15);
    for (const t of ['14:00', '14:15', '14:30', '14:45']) expect(a.has(t)).toBe(false);
    expect(a.get('15:00')).toBe(true);
  });

  it('blocks services that would run into the break', () => {
    const a = availability(45);
    expect(a.get('13:15')).toBe(true); // ends 14:00
    expect(a.get('13:30')).toBe(false); // would end 14:15
    expect(a.get('13:45')).toBe(false);
  });
});

describe('getStartTimes: closing time', () => {
  it('blocks services that would end after closing', () => {
    const a = availability(45);
    expect(a.get('19:15')).toBe(true); // ends 20:00
    expect(a.get('19:30')).toBe(false);
    expect(a.get('19:45')).toBe(false);
  });

  it('lists the last slot before closing but nothing at or after it', () => {
    const a = availability(15);
    expect(a.get('19:45')).toBe(true);
    expect(a.has('20:00')).toBe(false);
  });
});

describe('getStartTimes: past times today', () => {
  const now = new Date(2026, 9, 22, 12, 40); // Oct 22, 12:40

  it('blocks start times that have passed, including the current one', () => {
    const a = availability(15, [], now);
    expect(a.get('10:00')).toBe(false);
    expect(a.get('12:30')).toBe(false);
    expect(a.get('12:45')).toBe(true);
    expect(availability(15, [], new Date(2026, 9, 22, 12, 45)).get('12:45')).toBe(false);
  });

  it("doesn't block times on later days", () => {
    const tomorrow = getStartTimes('2026-10-23', 15, settings, new Set(), now);
    expect(tomorrow.every((o) => o.available)).toBe(true);
  });
});

describe('isPast', () => {
  const now = new Date(2026, 9, 22, 12, 40);

  it('compares by day, then by time on the same day', () => {
    expect(isPast('2026-10-21', '19:00', now)).toBe(true);
    expect(isPast('2026-10-22', '12:30', now)).toBe(true);
    expect(isPast('2026-10-22', '12:45', now)).toBe(false);
    expect(isPast('2026-10-23', '10:00', now)).toBe(false);
  });
});
