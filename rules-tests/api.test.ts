/**
 * Runs the site's real data layer (src/data/api.ts) against the emulator with firestore.rules,
 * to check that what the pages do is still allowed. Run with `npm run test:rules`.
 */
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection,
  getDocs,
  getDocsFromServer,
  query,
  where,
  type Firestore,
} from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_UID, SHOP_TIME_ZONE } from '../src/config';
import { addDays } from '../src/lib/time';
import type { AdminBooking, BookingRequest } from '../src/types';

// Swaps the app's Firebase instances for emulator ones, signed in as whoever the test picks.
const current = vi.hoisted(() => ({
  db: null as unknown,
  auth: { currentUser: null as { uid: string } | null },
}));
vi.mock('../src/data/firebase', () => ({
  get db() {
    return current.db;
  },
  auth: current.auth,
}));

const api = await import('../src/data/api');

const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: SHOP_TIME_ZONE }).format(new Date());
const TOMORROW = addDays(TODAY, 1);
const PHONE = '+96170123456';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'eddy-barbershop',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  actAsCustomer();
});

function actAsCustomer() {
  current.db = env.unauthenticatedContext().firestore();
  current.auth.currentUser = null;
}

function actAsEddy() {
  current.db = env.authenticatedContext(ADMIN_UID).firestore();
  current.auth.currentUser = { uid: ADMIN_UID };
}

function request(startTime: string, overrides: Partial<BookingRequest> = {}): BookingRequest {
  return {
    name: 'Rami',
    phone: PHONE,
    service: { id: 'haircut', name: 'Haircut', durationMinutes: 30 },
    date: TOMORROW,
    startTime,
    ...overrides,
  };
}

/** Eddy's dashboard listener for TOMORROW, resolved with its first result. */
function dashboard(): Promise<AdminBooking[]> {
  return new Promise((resolve, reject) => {
    const stop = api.subscribeBookings(
      TOMORROW,
      (bookings) => {
        stop();
        resolve(bookings);
      },
      reject,
    );
  });
}

/**
 * The customer page's taken-slots listener, resolved with its first result.
 * Use only before any cancel: transactions don't update the local cache, so a new
 * listener can first report slots that were deleted since.
 */
function takenSlots(): Promise<Set<string>> {
  return new Promise((resolve, reject) => {
    const stop = api.subscribeTakenSlots(
      TOMORROW,
      (taken) => {
        stop();
        resolve(taken);
      },
      reject,
    );
  });
}

describe('customer pages', () => {
  it('book, see the time taken, look up, cancel, and the time is free again', async () => {
    const booked = await api.createBooking(request('11:00'));
    expect(await takenSlots()).toEqual(new Set(['11:00', '11:15']));

    const found = await api.findBooking(booked.bookingCode, PHONE);
    expect(found.status).toBe('booked');

    await api.cancelBooking(booked.bookingCode, PHONE);
    expect((await api.findBooking(booked.bookingCode, PHONE)).status).toBe('cancelled');
    const left = await getDocsFromServer(
      query(collection(current.db as Firestore, 'slots'), where('date', '==', TOMORROW)),
    );
    expect(left.empty).toBe(true);
  });

  it('a taken time gives SlotTakenError', async () => {
    await api.createBooking(request('11:00', { phone: '+9613123456' }));
    await expect(api.createBooking(request('11:15'))).rejects.toBeInstanceOf(api.SlotTakenError);
  });

  it('a third upcoming booking for the same phone gives TooManyBookingsError', async () => {
    await api.createBooking(request('10:00'));
    await api.createBooking(request('11:00'));
    await expect(api.createBooking(request('12:00'))).rejects.toBeInstanceOf(
      api.TooManyBookingsError,
    );
  });

  it('cancelling one lets the phone book again', async () => {
    const first = await api.createBooking(request('10:00'));
    await api.createBooking(request('11:00'));
    await api.cancelBooking(first.bookingCode, PHONE);
    await expect(api.createBooking(request('12:00'))).resolves.toBeDefined();
  });

  it('the dashboard listener is refused for customers', async () => {
    await expect(dashboard()).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('customers cannot see the phone seats', async () => {
    await api.createBooking(request('11:00'));
    await expect(getDocs(collection(current.db as Firestore, 'phoneLimits'))).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });
});

describe('admin dashboard', () => {
  it('Eddy sees bookings, marks done, cancels, and adds walk-ins without a limit', async () => {
    const a = await api.createBooking(request('10:00'));
    const b = await api.createBooking(request('11:00'));

    actAsEddy();
    expect((await dashboard()).map((x) => x.bookingCode)).toEqual([a.bookingCode, b.bookingCode]);

    await api.setBookingStatus(a.bookingCode, 'done');
    await api.adminCancelBooking(b.bookingCode);

    // Walk-ins: no phone, and Eddy's own bookings don't count towards a phone's limit.
    await api.createBooking(request('15:00', { phone: null }));
    await api.createBooking(request('16:00'));
    await api.createBooking(request('17:00'));

    // Read from the server: a new listener could first report the cache, which the
    // transactions above didn't update (the real dashboard's open listener catches up).
    const snap = await getDocsFromServer(
      query(collection(current.db as Firestore, 'bookings'), where('date', '==', TOMORROW)),
    );
    const statuses = Object.fromEntries(snap.docs.map((d) => [d.get('startTime'), d.get('status')]));
    expect(statuses).toEqual({
      '10:00': 'done',
      '11:00': 'cancelled',
      '15:00': 'booked',
      '16:00': 'booked',
      '17:00': 'booked',
    });
  });
});
