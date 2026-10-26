import { describe, expect, it } from 'vitest';
import { BEFORE, SHOP, THURSDAY, barber, day } from '../test/fixtures';
import type { ShopStaffBooking } from '../types';
import { barberIdFor, dayCounts, moveOptions, reorderBarbers, totalCounts, usernameFor } from './team';

function booking(startTime: string, overrides: Partial<ShopStaffBooking> = {}): ShopStaffBooking {
  return {
    id: `B${startTime}`,
    bookingCode: `B${startTime}`,
    name: 'Rami',
    phone: '+96170111111',
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

describe('dayCounts', () => {
  it("counts a barber's bookings, done ones and free slots", () => {
    const karim = barber('karim', 0);
    const bookings = [
      booking('10:00', { status: 'done' }),
      booking('11:00'),
      booking('12:00', { status: 'cancelled' }),
      booking('12:00', { barberId: 'sami' }),
    ];
    const karimsDay = day('karim', { B1000: ['10:00', '10:15'], B1100: ['11:00', '11:15'] }, ['16:00']);
    // 10:00–20:00 is 40 slots, minus the 14:00–15:00 break (4), 4 booked and 1 blocked.
    expect(dayCounts(SHOP, karim, THURSDAY, bookings, karimsDay, BEFORE)).toEqual({
      bookings: 2,
      done: 1,
      freeSlots: 31,
    });
  });

  it('adds up to the shop total', () => {
    expect(
      totalCounts([
        { bookings: 2, done: 1, freeSlots: 31 },
        { bookings: 1, done: 0, freeSlots: 10 },
      ]),
    ).toEqual({ bookings: 3, done: 1, freeSlots: 41 });
  });
});

describe('moveOptions', () => {
  const karim = barber('karim', 0);
  const sami = barber('sami', 1);
  const omar = barber('omar', 2);
  const fadi = barber('fadi', 3);
  const elie = barber('elie', 4, { daysOff: [THURSDAY] });
  const gone = barber('gone', 5, { active: false });

  it('lists the other active barbers, free only for the whole booking', () => {
    const days = new Map([
      ['sami', day('sami', { X: ['11:15'] })],
      ['omar', day('omar', {}, ['11:00'])],
    ]);
    const options = moveOptions(SHOP, booking('11:00'), [gone, fadi, omar, sami, karim, elie], days);
    expect(options.map((o) => [o.barber.id, o.reason])).toEqual([
      ['sami', 'Booked then'],
      ['omar', 'Blocked then'],
      ['fadi', null],
      ['elie', 'Not working then'],
    ]);
  });

  it("refuses a barber whose break or hours the booking doesn't fit", () => {
    const options = moveOptions(SHOP, booking('13:45'), [karim, sami], new Map());
    expect(options).toEqual([{ barber: sami, reason: 'Not working then' }]);
  });
});

describe('barberIdFor', () => {
  it('makes a short slug from the name', () => {
    expect(barberIdFor('Karim Haddad', [])).toBe('karim-haddad');
    expect(barberIdFor('  Élie  ', [])).toBe('elie');
    expect(barberIdFor('محمد', [])).toBe('barber');
    expect(barberIdFor('A very long barber name indeed', []).length).toBeLessThanOrEqual(20);
  });

  it('adds a number when the ID is taken', () => {
    expect(barberIdFor('Karim', ['karim', 'karim-2'])).toBe('karim-3');
  });
});

describe('usernameFor', () => {
  it("suggests the first name's letters and digits", () => {
    expect(usernameFor('Karim Haddad')).toBe('karim');
    expect(usernameFor("Jean-Pierre O'Neil")).toBe('jeanpierre');
  });
});

describe('reorderBarbers', () => {
  const list = [barber('tony', 0), barber('karim', 1), barber('sami', 2)];

  it('swaps a barber with his neighbour and returns only the changed ones', () => {
    expect(reorderBarbers(list, 'sami', -1).map((b) => [b.id, b.order])).toEqual([
      ['sami', 1],
      ['karim', 2],
    ]);
  });

  it('does nothing past either end', () => {
    expect(reorderBarbers(list, 'tony', -1)).toEqual([]);
    expect(reorderBarbers(list, 'sami', 1)).toEqual([]);
  });

  it('renumbers gaps and ties', () => {
    const messy = [barber('tony', 0), barber('karim', 5), barber('sami', 5)];
    expect(reorderBarbers(messy, 'tony', 1).map((b) => [b.id, b.order])).toEqual([
      ['karim', 0],
      ['tony', 1],
      ['sami', 2],
    ]);
  });
});
