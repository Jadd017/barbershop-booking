import { describe, expect, it } from 'vitest';
import { BEFORE, SHOP, THURSDAY, barber, day } from '../test/fixtures';
import type { BarberDay, TimeString } from '../types';
import {
  anyBarberStartTimes,
  barberStartTimes,
  chooseAnyBarber,
  freeBarbers,
  type DaysByBarber,
} from './barberSlots';

const karim = barber('karim', 0);
const sami = barber('sami', 1);
const omar = barber('omar', 2);

function days(...list: BarberDay[]): DaysByBarber {
  return new Map(list.map((d) => [d.barberId, d]));
}

/** Availability of each start time with `karim`, as a map for easy lookups. */
function karimAvailability(durationMinutes: number, d?: BarberDay): Map<TimeString, boolean> {
  const options = barberStartTimes(THURSDAY, durationMinutes, SHOP, karim, d, BEFORE);
  return new Map(options.map((o) => [o.time, o.available]));
}

describe('barberStartTimes', () => {
  it('lists his hours without his break, all free on an empty day', () => {
    const a = karimAvailability(30);
    expect(a.get('10:00')).toBe(true);
    expect(a.has('14:00')).toBe(false); // break
    expect(a.has('14:45')).toBe(false);
    expect(a.get('15:00')).toBe(true);
    expect(a.get('19:30')).toBe(true);
    expect(a.get('19:45')).toBe(false); // runs past 20:00
  });

  it('takes both booked and blocked slots', () => {
    const a = karimAvailability(30, day('karim', { K7M2QX: ['11:00', '11:15'] }, ['16:00']));
    expect(a.get('10:30')).toBe(true);
    expect(a.get('10:45')).toBe(false); // runs into 11:00
    expect(a.get('11:15')).toBe(false);
    expect(a.get('11:30')).toBe(true);
    expect(a.get('15:45')).toBe(false); // runs into the block
    expect(a.get('16:15')).toBe(true);
  });

  it('is empty on his day off', () => {
    const off = { ...karim, daysOff: [THURSDAY] };
    expect(barberStartTimes(THURSDAY, 30, SHOP, off, undefined, BEFORE)).toEqual([]);
  });

  it("isn't affected by another barber's booking at the same time (slots are per barber)", () => {
    const d = days(day('karim', { AAAAAA: ['11:00', '11:15'] }));
    const samiAt11 = barberStartTimes(THURSDAY, 30, SHOP, sami, d.get('sami'), BEFORE).find(
      (o) => o.time === '11:00',
    );
    expect(samiAt11?.available).toBe(true);
    expect(karimAvailability(30, d.get('karim')).get('11:00')).toBe(false);
  });

  it('shows the same time free for two barbers, both bookable', () => {
    const free = freeBarbers(THURSDAY, '11:00', 30, SHOP, [karim, sami], days(), BEFORE);
    expect(free.map((b) => b.id)).toEqual(['karim', 'sami']);
  });

  it('respects his own hours when narrower than the shop', () => {
    const short = barber('short', 3);
    short.weeklyHours[3] = { closed: false, start: '12:00', end: '17:00', breaks: [] };
    const options = barberStartTimes(THURSDAY, 30, SHOP, short, undefined, BEFORE);
    expect(options[0].time).toBe('12:00');
    expect(options.find((o) => o.time === '16:30')?.available).toBe(true);
    expect(options.find((o) => o.time === '16:45')?.available).toBe(false); // past his closing
    expect(options.some((o) => o.time === '17:00')).toBe(false);
  });

  it("doesn't let a service start before his break and run into it", () => {
    const a = karimAvailability(45);
    expect(a.get('13:15')).toBe(true); // 13:15–14:00
    expect(a.get('13:30')).toBe(false); // would run into 14:00
  });

  it('is empty when he is inactive', () => {
    const gone = { ...karim, active: false };
    expect(barberStartTimes(THURSDAY, 30, SHOP, gone, undefined, BEFORE)).toEqual([]);
  });

  it("hides past times", () => {
    const now = new Date(2026, 9, 22, 12, 10);
    const options = barberStartTimes(THURSDAY, 15, SHOP, karim, undefined, now);
    expect(options.find((o) => o.time === '12:00')?.available).toBe(false);
    expect(options.find((o) => o.time === '12:15')?.available).toBe(true);
  });
});

describe('anyBarberStartTimes', () => {
  it('is available when at least one barber is free, and says who', () => {
    const d = days(
      day('karim', { AAAAAA: ['11:00', '11:15'] }),
      day('sami', { BBBBBB: ['11:00'] }, ['11:15']),
    );
    const options = anyBarberStartTimes(THURSDAY, 30, SHOP, [karim, sami, omar], d, BEFORE);
    const at = (t: TimeString) => options.find((o) => o.time === t);
    expect(at('11:00')).toEqual({ time: '11:00', available: true, freeBarberIds: ['omar'] });
    expect(at('10:00')?.freeBarberIds).toEqual(['karim', 'sami', 'omar']);
  });

  it('needs a barber free for the whole service, not just its start', () => {
    // Karim is free at 11:00 but booked at 11:15; Sami is free at 11:15 but booked at 11:00.
    const d = days(day('karim', { AAAAAA: ['11:15'] }), day('sami', { BBBBBB: ['11:00'] }));
    const options = anyBarberStartTimes(THURSDAY, 30, SHOP, [karim, sami], d, BEFORE);
    expect(options.find((o) => o.time === '11:00')).toEqual({
      time: '11:00',
      available: false,
      freeBarberIds: [],
    });
    expect(anyBarberStartTimes(THURSDAY, 15, SHOP, [karim, sami], d, BEFORE).find(
      (o) => o.time === '11:00',
    )?.freeBarberIds).toEqual(['karim']);
  });

  it('never shows an inactive barber as free', () => {
    const gone = { ...omar, active: false };
    const d = days(day('karim', { AAAAAA: ['11:00'] }));
    const options = anyBarberStartTimes(THURSDAY, 15, SHOP, [karim, gone], d, BEFORE);
    expect(options.find((o) => o.time === '11:00')?.available).toBe(false);
    expect(options.flatMap((o) => o.freeBarberIds)).not.toContain('omar');
    expect(anyBarberStartTimes(THURSDAY, 15, SHOP, [gone], days(), BEFORE)).toEqual([]);
  });

  it('is unavailable when every barber is taken', () => {
    const d = days(day('karim', { AAAAAA: ['11:00'] }), day('sami', {}, ['11:00']));
    const options = anyBarberStartTimes(THURSDAY, 15, SHOP, [karim, sami], d, BEFORE);
    expect(options.find((o) => o.time === '11:00')).toEqual({
      time: '11:00',
      available: false,
      freeBarberIds: [],
    });
  });

  it("lists every barber's times, sorted, so different hours combine", () => {
    const early = barber('early', 0);
    early.weeklyHours = early.weeklyHours.map((h) => ({ ...h, end: '12:00', breaks: [] }));
    const late = barber('late', 1);
    late.weeklyHours = late.weeklyHours.map((h) => ({ ...h, start: '16:00', breaks: [] }));
    const options = anyBarberStartTimes(THURSDAY, 15, SHOP, [late, early], days(), BEFORE);
    const times = options.map((o) => o.time);
    expect(times[0]).toBe('10:00');
    expect(times).not.toContain('13:00');
    expect(times).toContain('16:00');
    expect(times).toEqual([...times].sort());
  });

  it('is empty when nobody works that day', () => {
    const off = [{ ...karim, daysOff: [THURSDAY] }];
    expect(anyBarberStartTimes(THURSDAY, 15, SHOP, off, days(), BEFORE)).toEqual([]);
  });
});

describe('freeBarbers', () => {
  it('lists who is free for the whole service, in display order', () => {
    const d = days(day('karim', { AAAAAA: ['11:30'] }));
    const ids = (duration: number) =>
      freeBarbers(THURSDAY, '11:00', duration, SHOP, [omar, sami, karim], d, BEFORE).map(
        (b) => b.id,
      );
    expect(ids(30)).toEqual(['karim', 'sami', 'omar']);
    expect(ids(45)).toEqual(['sami', 'omar']); // Karim's 11:30 is in the way
  });

  it("excludes a barber whose break or day off it is", () => {
    const off = { ...omar, daysOff: [THURSDAY] };
    const free = freeBarbers(THURSDAY, '14:00', 15, SHOP, [karim, off], days(), BEFORE);
    expect(free).toEqual([]);
  });

  it('excludes an inactive barber', () => {
    const gone = { ...sami, active: false };
    const free = freeBarbers(THURSDAY, '11:00', 30, SHOP, [karim, gone], days(), BEFORE);
    expect(free.map((b) => b.id)).toEqual(['karim']);
  });
});

describe('chooseAnyBarber', () => {
  it('picks the barber with the fewest bookings that day', () => {
    const d = days(
      day('karim', { AAAAAA: ['10:00', '10:15'], BBBBBB: ['12:00'] }),
      day('sami', { CCCCCC: ['10:00'] }),
      day('omar', { DDDDDD: ['10:00'], EEEEEE: ['11:00'] }),
    );
    expect(chooseAnyBarber([karim, sami, omar], THURSDAY, d)?.id).toBe('sami');
  });

  it('counts bookings, not slots, and ignores blocked time', () => {
    const d = days(
      day('karim', { AAAAAA: ['10:00', '10:15', '10:30', '10:45'] }),
      day('sami', { BBBBBB: ['10:00'], CCCCCC: ['11:00'] }, ['12:00', '12:15', '12:30']),
    );
    expect(chooseAnyBarber([karim, sami], THURSDAY, d)?.id).toBe('karim');
  });

  it('breaks ties by display order, whatever order the candidates come in', () => {
    const d = days(day('karim', { AAAAAA: ['10:00'] }));
    expect(chooseAnyBarber([omar, sami], THURSDAY, d)?.id).toBe('sami');
    expect(chooseAnyBarber([omar, sami, karim], THURSDAY, d)?.id).toBe('sami');
    expect(chooseAnyBarber([karim, omar], THURSDAY, days())?.id).toBe('karim');
  });

  it('never assigns an inactive barber, even with the fewest bookings', () => {
    const d = days(day('karim', { AAAAAA: ['10:00'] }));
    const gone = { ...sami, active: false };
    expect(chooseAnyBarber([karim, gone], THURSDAY, d)?.id).toBe('karim');
    expect(chooseAnyBarber([gone], THURSDAY, d)).toBeNull();
  });

  it('is null without candidates', () => {
    expect(chooseAnyBarber([], THURSDAY, days())).toBeNull();
  });
});
