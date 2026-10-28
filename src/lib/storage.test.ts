/** What the booking page remembers across a sign-in redirect and the trip to WhatsApp. */
import { beforeEach, describe, expect, it } from 'vitest';
import type { ShopConfirmedBooking } from '../types';
import { loadLastBooking, saveLastBooking } from './lastBooking';
import { loadPendingBooking, savePendingBooking } from './pendingBooking';

/** A browser storage stand-in (the tests run in Node). */
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (i) => [...items.keys()][i] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  };
}

beforeEach(() => {
  Object.assign(globalThis, { localStorage: memoryStorage(), sessionStorage: memoryStorage() });
});

const FUTURE = '2099-01-01';
const BOOKING: ShopConfirmedBooking = {
  bookingCode: 'K7M2QX',
  name: 'Rami',
  serviceName: 'Haircut',
  durationMinutes: 30,
  date: FUTURE,
  startTime: '11:00',
  barberId: 'karim',
  barberName: 'Karim',
  anyBarber: true,
};

describe('pending booking (sign-in redirect)', () => {
  it('keeps the barber choice, including "Any barber"', () => {
    savePendingBooking({ serviceId: 'haircut', barberId: null, day: FUTURE, time: '11:00' });
    expect(loadPendingBooking()).toEqual({ serviceId: 'haircut', barberId: null, day: FUTURE, time: '11:00' });
    savePendingBooking({ serviceId: 'haircut', barberId: 'karim', day: FUTURE, time: '11:00' });
    expect(loadPendingBooking()?.barberId).toBe('karim');
  });

  it("ignores what doesn't look right", () => {
    sessionStorage.setItem('pendingBooking', JSON.stringify({ serviceId: 'haircut', day: FUTURE, time: '11:00' }));
    expect(loadPendingBooking()).toBeNull();
  });
});

describe('last booking (back from WhatsApp)', () => {
  it('keeps the booking with its barber, the shop name and number', () => {
    const last = { booking: BOOKING, shopName: 'Sassine Maatouk', whatsapp: '+96171000000' };
    saveLastBooking(last);
    expect(loadLastBooking()).toEqual(last);
  });

  it("forgets bookings that passed, and the single-barber site's shape", () => {
    saveLastBooking({ booking: { ...BOOKING, date: '2000-01-01' }, shopName: 'S', whatsapp: '' });
    expect(loadLastBooking()).toBeNull();
    localStorage.setItem('lastShopBooking', JSON.stringify({ booking: { bookingCode: 'X', date: FUTURE, startTime: '11:00' }, barberName: 'Eddy' }));
    expect(loadLastBooking()).toBeNull();
  });
});
