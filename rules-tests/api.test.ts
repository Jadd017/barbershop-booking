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
import type { AdminBooking, BookingRequest, CustomerBooking } from '../src/types';

interface FakeUser {
  uid: string;
  email: string;
  providerData: { providerId: string }[];
}

// Swaps the app's Firebase instances for emulator ones, signed in as whoever the test picks.
const current = vi.hoisted(() => ({
  db: null as unknown,
  auth: { currentUser: null as FakeUser | null },
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
const OTHER_PHONE = '+9613123456';
const RAMI = { uid: 'rami-uid', email: 'rami@gmail.com' };
const SARA = { uid: 'sara-uid', email: 'sara@gmail.com' };
const NADIM = { uid: 'nadim-uid', email: 'nadim@gmail.com' };

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
  actAsCustomer(RAMI);
});

/** Signed in with Google as `customer`. */
function actAsCustomer(customer: { uid: string; email: string }) {
  current.db = env
    .authenticatedContext(customer.uid, {
      email: customer.email,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();
  current.auth.currentUser = { ...customer, providerData: [{ providerId: 'google.com' }] };
}

function actSignedOut() {
  current.db = env.unauthenticatedContext().firestore();
  current.auth.currentUser = null;
}

function actAsEddy() {
  const eddy = { uid: ADMIN_UID, email: 'eddy@example.com' };
  current.db = env
    .authenticatedContext(ADMIN_UID, { email: eddy.email, firebase: { sign_in_provider: 'password' } })
    .firestore();
  current.auth.currentUser = { ...eddy, providerData: [{ providerId: 'password' }] };
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

/** The "My bookings" listener for the signed-in customer, resolved with its first result. */
function myBookings(): Promise<CustomerBooking[]> {
  return new Promise((resolve, reject) => {
    const stop = api.subscribeMyBookings(
      current.auth.currentUser!.uid,
      (bookings) => {
        stop();
        resolve(bookings);
      },
      reject,
    );
  });
}

/** The signed-in customer's booking statuses, read from the server (see takenSlots). */
async function myStatusesFromServer(): Promise<Record<string, string>> {
  const snap = await getDocsFromServer(
    query(
      collection(current.db as Firestore, 'bookings'),
      where('customerUid', '==', current.auth.currentUser!.uid),
    ),
  );
  return Object.fromEntries(snap.docs.map((d) => [d.id, d.get('status')]));
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
  it('book, see it taken and under My bookings, cancel, and the time is free again', async () => {
    const booked = await api.createBooking(request('11:00'));
    expect(await takenSlots()).toEqual(new Set(['11:00', '11:15']));

    expect(await myBookings()).toEqual([
      {
        bookingCode: booked.bookingCode,
        serviceName: 'Haircut',
        durationMinutes: 30,
        date: TOMORROW,
        startTime: '11:00',
        status: 'booked',
      },
    ]);

    await api.cancelMyBooking(booked.bookingCode);
    expect(await myStatusesFromServer()).toEqual({ [booked.bookingCode]: 'cancelled' });
    const left = await getDocsFromServer(
      query(collection(current.db as Firestore, 'slots'), where('date', '==', TOMORROW)),
    );
    expect(left.empty).toBe(true);
  });

  it('My bookings shows only your own', async () => {
    await api.createBooking(request('10:00'));
    actAsCustomer(SARA);
    const sara = await api.createBooking(request('12:00', { phone: OTHER_PHONE }));
    expect((await myBookings()).map((b) => b.bookingCode)).toEqual([sara.bookingCode]);
  });

  it('remembers the name and phone for next time, readable by that customer only', async () => {
    expect(await api.getCustomerProfile(RAMI.uid)).toBeNull();
    await api.createBooking(request('11:00', { name: 'Rami K' }));
    expect(await api.getCustomerProfile(RAMI.uid)).toEqual({ name: 'Rami K', phone: PHONE });

    actAsCustomer(SARA);
    await expect(api.getCustomerProfile(RAMI.uid)).rejects.toMatchObject({
      code: 'permission-denied',
    });
    actAsEddy();
    expect(await api.getCustomerProfile(RAMI.uid)).toEqual({ name: 'Rami K', phone: PHONE });
  });

  it('booking while signed out gives SignInRequiredError', async () => {
    actSignedOut();
    await expect(api.createBooking(request('11:00'))).rejects.toBeInstanceOf(
      api.SignInRequiredError,
    );
  });

  it('a taken time gives SlotTakenError', async () => {
    actAsCustomer(SARA);
    await api.createBooking(request('11:00', { phone: OTHER_PHONE }));
    actAsCustomer(RAMI);
    await expect(api.createBooking(request('11:15'))).rejects.toBeInstanceOf(api.SlotTakenError);
  });

  it('a third upcoming booking on one account hits the account limit, whatever the phone', async () => {
    await api.createBooking(request('10:00'));
    await api.createBooking(request('11:00', { phone: OTHER_PHONE }));
    await expect(
      api.createBooking(request('12:00', { phone: '+96171123456' })),
    ).rejects.toMatchObject({ name: 'TooManyBookingsError', limitedBy: 'account' });
  });

  it('a third upcoming booking for one phone hits the phone limit, whatever the account', async () => {
    await api.createBooking(request('10:00'));
    actAsCustomer(SARA);
    await api.createBooking(request('11:00'));
    actAsCustomer(NADIM);
    await expect(api.createBooking(request('12:00'))).rejects.toMatchObject({
      name: 'TooManyBookingsError',
      limitedBy: 'phone',
    });
  });

  it('cancelling one lets the account book again', async () => {
    const first = await api.createBooking(request('10:00'));
    await api.createBooking(request('11:00'));
    await api.cancelMyBooking(first.bookingCode);
    await expect(api.createBooking(request('12:00'))).resolves.toBeDefined();
  });

  it("a customer cannot cancel someone else's booking", async () => {
    const rami = await api.createBooking(request('10:00'));
    actAsCustomer(SARA);
    await expect(api.cancelMyBooking(rami.bookingCode)).rejects.toMatchObject({
      code: 'permission-denied',
    });
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
  it('Eddy sees bookings with emails, marks done, cancels, and adds walk-ins without a limit', async () => {
    const a = await api.createBooking(request('10:00'));
    const b = await api.createBooking(request('11:00'));

    actAsEddy();
    expect((await dashboard()).map((x) => [x.bookingCode, x.customerEmail])).toEqual([
      [a.bookingCode, RAMI.email],
      [b.bookingCode, RAMI.email],
    ]);

    await api.setBookingStatus(a.bookingCode, 'done');
    await api.adminCancelBooking(b.bookingCode);

    // Walk-ins: no phone and no customer, and Eddy's own bookings don't count towards any limit.
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
    const walkIns = snap.docs.filter((d) => d.get('customerUid') === null);
    expect(walkIns.map((d) => d.get('startTime')).sort()).toEqual(['15:00', '16:00', '17:00']);
  });
});
