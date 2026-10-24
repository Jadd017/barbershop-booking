/**
 * Runs the multi-barber data layer (src/data/shop.ts, days.ts, bookings.ts, accounts.ts) against
 * the emulators with firestore.rules, as customers, barbers and the owner, including several
 * people at the same moment. Run with `npm run test:emu` (Firestore and Auth emulators).
 */
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  inMemoryPersistence,
  initializeAuth,
  signInWithEmailAndPassword,
  type Auth,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc, Timestamp, type Firestore } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SHOP_TIME_ZONE } from '../src/config';
import { hoursFromShop, toBarberDoc } from '../src/lib/barberDoc';
import { defaultShopSettings, toShopDoc } from '../src/lib/shopDoc';
import { addDays } from '../src/lib/time';
import type { Barber, ShopBookingRequest, ShopSettings } from '../src/types';

const DEMO_CONFIG = {
  apiKey: 'demo-api-key',
  authDomain: 'demo-barbershop.firebaseapp.com',
  projectId: 'demo-barbershop',
  storageBucket: 'demo-barbershop.appspot.com',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:0000000000000000',
};
const AUTH_URL = 'http://127.0.0.1:9099';

// The data layer takes its Firestore and user as arguments; only account creation reads the
// app's config, which must be the emulator's here (never .env.local's real project).
vi.mock('../src/data/firebase', () => ({
  db: null,
  auth: { currentUser: null },
  store: null,
  firebaseConfig: {
    apiKey: 'demo-api-key',
    authDomain: 'demo-barbershop.firebaseapp.com',
    projectId: 'demo-barbershop',
    storageBucket: 'demo-barbershop.appspot.com',
    messagingSenderId: '000000000000',
    appId: '1:000000000000:web:0000000000000000',
  },
  useEmulator: true,
  AUTH_EMULATOR_URL: 'http://127.0.0.1:9099',
}));

const shopApi = await import('../src/data/shop');
const days = await import('../src/data/days');
const bookings = await import('../src/data/bookings');
const accounts = await import('../src/data/accounts');
const errors = await import('../src/data/errors');
type Store = import('../src/data/store').Store;

const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: SHOP_TIME_ZONE }).format(new Date());
const TOMORROW = addDays(TODAY, 1);

const SHOP: ShopSettings = { ...defaultShopSettings('Sassine Maatouk'), whatsapp: '+96171000000' };
const HAIRCUT = SHOP.services[0]; // 30 min

/** Works the shop's hours (10:00–20:00) with a 14:00–15:00 break. */
function makeBarber(id: string, order: number, change: Partial<Barber> = {}): Barber {
  return {
    id,
    name: id[0].toUpperCase() + id.slice(1),
    active: true,
    order,
    weeklyHours: hoursFromShop(SHOP.openingHours).map((d) => ({
      ...d,
      breaks: [{ start: '14:00', end: '15:00' }],
    })),
    daysOff: [],
    ...change,
  };
}

/** The owner (also a barber) and four barbers, in display order. */
const BARBERS = ['sassine', 'karim', 'sami', 'omar', 'fadi'].map((id, i) => makeBarber(id, i));
const OWNER = { uid: 'owner-uid', username: 'sassine', barberId: 'sassine', role: 'owner' };
const KARIM = { uid: 'karim-uid', username: 'karim', barberId: 'karim', role: 'barber' };
const SAMI = { uid: 'sami-uid', username: 'sami', barberId: 'sami', role: 'barber' };

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-barbershop',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(() => env.cleanup());

function seed(fn: (db: Firestore) => Promise<unknown>) {
  return env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore() as unknown as Firestore).then(() => undefined));
}

const seedShop = (change: Partial<ShopSettings> = {}) =>
  seed((db) => setDoc(doc(db, 'settings', 'shop'), { ...toShopDoc({ ...SHOP, ...change }), updatedAt: Timestamp.now() }));

const seedBarber = (barber: Barber) =>
  seed((db) => setDoc(doc(db, 'barbers', barber.id), { ...toBarberDoc(barber), updatedAt: Timestamp.now() }));

function seedStaff(s: typeof OWNER, email = `${s.username}.ab12@staff.invalid`) {
  return seed(async (db) => {
    await setDoc(doc(db, 'staff', s.uid), {
      username: s.username,
      barberId: s.barberId,
      role: s.role,
      active: true,
      createdAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'usernames', s.username), { uid: s.uid, email });
  });
}

beforeEach(async () => {
  await env.clearFirestore();
  await seedShop();
  for (const b of BARBERS) await seedBarber(b);
  for (const s of [OWNER, KARIM, SAMI]) await seedStaff(s);
});

// ---- Who is acting ----

interface Person {
  uid: string;
  email: string;
}

/** A Google customer's store. */
function customer(c: Person): Store {
  return {
    db: env
      .authenticatedContext(c.uid, { email: c.email, firebase: { sign_in_provider: 'google.com' } })
      .firestore() as unknown as Firestore,
    auth: { currentUser: { ...c, providerData: [{ providerId: 'google.com' }] } as unknown as User },
  };
}

/** A staff member's store (username + password login). */
function staff(s: { uid: string; username: string }): Store {
  const email = `${s.username}.ab12@staff.invalid`;
  return {
    db: env
      .authenticatedContext(s.uid, { email, firebase: { sign_in_provider: 'password' } })
      .firestore() as unknown as Firestore,
    auth: { currentUser: { uid: s.uid, email, providerData: [{ providerId: 'password' }] } as unknown as User },
  };
}

const anyone = (): Store => ({
  db: env.unauthenticatedContext().firestore() as unknown as Firestore,
  auth: { currentUser: null },
});

const RAMI = { uid: 'rami-uid', email: 'rami@example.com' };
const SARA = { uid: 'sara-uid', email: 'sara@example.com' };
const owner = () => staff(OWNER);
const karim = () => staff(KARIM);
const sami = () => staff(SAMI);

/** The 1st, 2nd, … customer with their own account and phone. */
function nthCustomer(n: number): Person & { phone: string } {
  return { uid: `customer-${n}`, email: `c${n}@example.com`, phone: `+9617000000${n}` };
}

function request(change: Partial<ShopBookingRequest> = {}): ShopBookingRequest {
  return {
    name: 'Rami',
    phone: '+96170123456',
    service: HAIRCUT,
    date: TOMORROW,
    startTime: '11:00',
    barberId: 'karim',
    ...change,
  };
}

/** Resolves with the first result of a subscribe function. */
function first<T>(
  subscribe: (onChange: (value: T) => void, onError: (error: Error) => void) => () => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const stop = subscribe((value) => {
      stop();
      resolve(value);
    }, reject);
  });
}

const dayOf = (barberId: string, store: Store = anyone()) =>
  first<import('../src/types').BarberDay>((ok, fail) => days.subscribeDay(store, barberId, TOMORROW, ok, fail));

const bookedTimes = async (barberId: string) => [...(await dayOf(barberId)).booked.keys()].sort();

// ---------------------------------------------------------------------------------------------

describe('shop settings and barbers', () => {
  it('the owner sets a new shop up from its config name and logo, once', async () => {
    await env.clearFirestore();
    await seedStaff(OWNER);
    await shopApi.ensureShop(owner(), 'Sassine Maatouk', 'data:image/webp;base64,UklGRg==');
    const shop = await first((ok, fail) => shopApi.subscribeShop(anyone(), ok, fail));
    const branding = await first((ok, fail) => shopApi.subscribeBranding(anyone(), ok, fail));
    expect(shop?.shopName).toBe('Sassine Maatouk');
    expect(branding?.logo).toBe('data:image/webp;base64,UklGRg==');

    await shopApi.saveShop(owner(), { ...shop!, shopName: 'Sassine Maatouk Barbers' });
    await shopApi.ensureShop(owner(), 'Other name', null);
    const after = await first((ok, fail) => shopApi.subscribeShop(anyone(), ok, fail));
    expect(after?.shopName).toBe('Sassine Maatouk Barbers');
  });

  it('only the owner saves the shop and its branding; removing the logo works', async () => {
    await shopApi.saveBranding(owner(), { logo: null, colors: { dark: '#000000', accent: '#B8893C', light: '#FFFFFF' } });
    await expect(shopApi.saveShop(karim(), SHOP)).rejects.toThrow();
    await expect(shopApi.saveBranding(karim(), { logo: null, colors: { dark: '#000000', accent: '#B8893C', light: '#FFFFFF' } })).rejects.toThrow();
    const branding = await first((ok, fail) => shopApi.subscribeBranding(anyone(), ok, fail));
    expect(branding?.logo).toBeNull();
  });

  it('barbers are listed in display order, inactive ones too', async () => {
    await seedBarber({ ...BARBERS[1], active: false });
    const list = await first((ok, fail) => shopApi.subscribeBarbers(anyone(), ok, fail));
    expect(list.map((b) => b.id)).toEqual(['sassine', 'karim', 'sami', 'omar', 'fadi']);
    expect(list[1].active).toBe(false);
  });

  it('the owner adds barbers; an ID can only be used once', async () => {
    await shopApi.addBarber(owner(), makeBarber('nabil', 5));
    await expect(shopApi.addBarber(owner(), makeBarber('nabil', 6))).rejects.toBeInstanceOf(errors.BarberExistsError);
    await expect(shopApi.addBarber(karim(), makeBarber('ziad', 7))).rejects.toThrow();
  });

  it('a barber saves his own hours and days off, inside the shop hours, never another barber\'s', async () => {
    const hours = BARBERS[1].weeklyHours.map((d) => ({ ...d, start: '12:00' }));
    await shopApi.saveMySchedule(karim(), 'karim', hours, [TOMORROW]);
    const list = await first((ok, fail) => shopApi.subscribeBarbers(anyone(), ok, fail));
    expect(list[1].weeklyHours[0].start).toBe('12:00');
    expect(list[1].daysOff).toEqual([TOMORROW]);

    const early = hours.map((d) => ({ ...d, start: '09:00' }));
    await expect(shopApi.saveMySchedule(karim(), 'karim', early, [])).rejects.toThrow();
    await expect(shopApi.saveMySchedule(karim(), 'sami', hours, [])).rejects.toThrow();
  });

  it("after narrowing the shop's hours, the owner trims the barbers that stick out", async () => {
    const shop = { ...SHOP, openingHours: SHOP.openingHours.map((d) => ({ ...d, end: '18:00' })) };
    await shopApi.saveShop(owner(), shop);
    const changed = await shopApi.trimBarbersToShop(owner(), shop, BARBERS);
    expect(changed).toEqual(BARBERS.map((b) => b.id));
    const list = await first((ok, fail) => shopApi.subscribeBarbers(anyone(), ok, fail));
    expect(list.every((b) => b.weeklyHours.every((d) => d.end === '18:00'))).toBe(true);
  });
});

describe('customer bookings', () => {
  it('books a chosen barber: his time is taken, and it shows under My bookings with his name', async () => {
    const booked = await bookings.createBooking(customer(RAMI), request());
    expect(booked).toMatchObject({ barberId: 'karim', barberName: 'Karim', anyBarber: false, startTime: '11:00' });
    expect(await bookedTimes('karim')).toEqual(['11:00', '11:15']);
    expect(await bookedTimes('sami')).toEqual([]);
    const mine = await first((ok, fail) => bookings.subscribeMyBookings(customer(RAMI), RAMI.uid, ok, fail));
    expect(mine).toEqual([expect.objectContaining({ bookingCode: booked.bookingCode, barberName: 'Karim' })]);
  });

  it('two barbers can be booked at the same time; the same barber only once', async () => {
    await bookings.createBooking(customer(RAMI), request());
    await expect(
      bookings.createBooking(customer(SARA), request({ phone: '+96171123456' })),
    ).rejects.toBeInstanceOf(errors.SlotTakenError);
    await expect(
      bookings.createBooking(customer(SARA), request({ phone: '+96171123456', barberId: 'sami' })),
    ).resolves.toMatchObject({ barberName: 'Sami' });
  });

  it('"Any barber" gets the free barber with the fewest bookings that day, then the first listed', async () => {
    const book = (n: number, change: Partial<ShopBookingRequest> = {}) => {
      const c = nthCustomer(n);
      return bookings.createBooking(customer(c), request({ phone: c.phone, barberId: null, ...change }));
    };
    // All at 0 bookings: the first in display order.
    expect((await book(1)).barberId).toBe('sassine');
    // Sassine now has 1: the next barber with 0, at any time.
    expect((await book(2, { startTime: '16:00' })).barberId).toBe('karim');
    // At 11:00 Sassine is taken; Karim (1 booking) loses to Sami (0).
    expect((await book(3)).barberId).toBe('sami');
    expect((await book(4)).anyBarber).toBe(true);
  });

  it('"Any barber" skips inactive barbers, days off, breaks and blocked time', async () => {
    await seedBarber({ ...BARBERS[0], active: false });
    await seedBarber({ ...BARBERS[1], daysOff: [TOMORROW] });
    await seedBarber({
      ...BARBERS[2],
      weeklyHours: BARBERS[2].weeklyHours.map((d) => ({ ...d, breaks: [{ start: '11:00', end: '11:30' }] })),
    });
    await days.blockTime(owner(), 'omar', TOMORROW, '11:15', '11:30');
    const booked = await bookings.createBooking(customer(RAMI), request({ barberId: null }));
    expect(booked.barberId).toBe('fadi');
  });

  it('a chosen barber who is inactive, off that day or not working then is "not bookable"', async () => {
    await seedBarber({ ...BARBERS[1], active: false });
    await expect(bookings.createBooking(customer(RAMI), request())).rejects.toBeInstanceOf(errors.NotBookableError);
    await expect(
      bookings.createBooking(customer(RAMI), request({ barberId: 'sami', startTime: '14:00' })),
    ).rejects.toBeInstanceOf(errors.NotBookableError);
    await seedShop({ closedDays: [TOMORROW] });
    await expect(
      bookings.createBooking(customer(RAMI), request({ barberId: null })),
    ).rejects.toBeInstanceOf(errors.NotBookableError);
  });

  it('two upcoming bookings per Google account and per phone', async () => {
    await bookings.createBooking(customer(RAMI), request({ startTime: '10:00' }));
    await bookings.createBooking(customer(RAMI), request({ startTime: '11:00' }));
    await expect(bookings.createBooking(customer(RAMI), request({ startTime: '12:00' }))).rejects.toMatchObject({
      limitedBy: 'account',
    });
    await expect(bookings.createBooking(customer(SARA), request({ startTime: '12:00' }))).rejects.toMatchObject({
      limitedBy: 'phone',
    });
  });

  it('a customer cancels their own booking and the time is free again', async () => {
    const { bookingCode } = await bookings.createBooking(customer(RAMI), request());
    await expect(bookings.cancelMyBooking(customer(SARA), bookingCode)).rejects.toBeInstanceOf(
      errors.BookingNotFoundError,
    );
    await bookings.cancelMyBooking(customer(RAMI), bookingCode);
    expect(await bookedTimes('karim')).toEqual([]);
    await expect(bookings.cancelMyBooking(customer(RAMI), bookingCode)).rejects.toBeInstanceOf(
      errors.AlreadyCancelledError,
    );
    await bookings.createBooking(customer(SARA), request({ phone: '+96171123456' }));
  });

  it('booking needs a Google sign-in', async () => {
    await expect(bookings.createBooking(anyone(), request())).rejects.toBeInstanceOf(errors.SignInRequiredError);
    await expect(bookings.createBooking(karim(), request())).rejects.toBeInstanceOf(errors.SignInRequiredError);
  });
});

describe('several people at the same moment', () => {
  it('6 customers book "Any barber" at once with 5 free barbers: 5 different barbers, 1 told it\'s taken', async () => {
    const results = await Promise.allSettled(
      [1, 2, 3, 4, 5, 6].map((n) => {
        const c = nthCustomer(n);
        return bookings.createBooking(customer(c), request({ phone: c.phone, barberId: null }));
      }),
    );
    const booked = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value.barberId] : []));
    const failed = results.flatMap((r) => (r.status === 'rejected' ? [r.reason] : []));
    expect(booked.sort()).toEqual(['fadi', 'karim', 'omar', 'sami', 'sassine']);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toBeInstanceOf(errors.SlotTakenError);
    for (const b of BARBERS) expect(await bookedTimes(b.id)).toEqual(['11:00', '11:15']);
  });

  it('two customers book the same barber and time at once: exactly one gets it', async () => {
    const results = await Promise.allSettled(
      [1, 2].map((n) => {
        const c = nthCustomer(n);
        return bookings.createBooking(customer(c), request({ phone: c.phone }));
      }),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(errors.SlotTakenError);
  });

  it('two bookings moved onto the same free barber at once: exactly one moves', async () => {
    const a = await bookings.createBooking(customer(RAMI), request());
    const b = await bookings.createBooking(customer(SARA), request({ phone: '+96171123456', barberId: 'sami' }));
    const results = await Promise.allSettled([
      bookings.moveBooking(owner(), a.bookingCode, 'omar'),
      bookings.moveBooking(owner(), b.bookingCode, 'omar'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(
      errors.SlotTakenError,
    );
    expect(new Set((await dayOf('omar')).booked.values()).size).toBe(1);
  });
});

describe('staff: walk-ins, status, cancelling, blocking', () => {
  it('a barber adds a walk-in for himself, even over his blocked time, but never double-books', async () => {
    await days.blockTime(karim(), 'karim', TOMORROW, '11:00', '11:30');
    const walkIn = { ...request({ name: 'Walk-in', phone: null }), barberId: 'karim' };
    await expect(bookings.createWalkIn(karim(), walkIn)).resolves.toMatchObject({ barberName: 'Karim' });
    await expect(bookings.createWalkIn(karim(), walkIn)).rejects.toBeInstanceOf(errors.SlotTakenError);
    await expect(bookings.createWalkIn(karim(), { ...walkIn, barberId: 'sami' })).rejects.toThrow();
    await expect(bookings.createWalkIn(owner(), { ...walkIn, barberId: 'sami' })).resolves.toBeTruthy();
  });

  it('a barber sees and manages only his own bookings; the owner sees all', async () => {
    const a = await bookings.createBooking(customer(RAMI), request());
    await bookings.createBooking(customer(SARA), request({ phone: '+96171123456', barberId: 'sami' }));
    const mine = await first((ok, fail) => bookings.subscribeBookingsOn(karim(), 'karim', TOMORROW, ok, fail));
    expect(mine.map((b) => b.barberName)).toEqual(['Karim']);
    const all = await first((ok, fail) => bookings.subscribeBookingsOn(owner(), null, TOMORROW, ok, fail));
    expect(all.map((b) => b.barberName).sort()).toEqual(['Karim', 'Sami']);
    await expect(
      first((ok, fail) => bookings.subscribeBookingsOn(karim(), 'sami', TOMORROW, ok, fail)),
    ).rejects.toThrow();

    await bookings.setBookingStatus(karim(), a.bookingCode, 'done');
    await expect(bookings.staffCancelBooking(sami(), a.bookingCode)).rejects.toThrow();
    await expect(bookings.staffCancelBooking(karim(), a.bookingCode)).rejects.toBeInstanceOf(
      errors.NotCancellableError,
    );
    await bookings.setBookingStatus(karim(), a.bookingCode, 'booked');
    await bookings.staffCancelBooking(karim(), a.bookingCode);
    expect(await bookedTimes('karim')).toEqual([]);
  });

  it('blocking skips booked slots, customers can\'t book blocked time, unblocking frees it', async () => {
    await bookings.createBooking(customer(RAMI), request({ startTime: '16:00' }));
    expect(await days.blockTime(karim(), 'karim', TOMORROW, '15:30', '17:00')).toBe(4); // 16:00–16:30 booked
    const blocked = await first((ok, fail) => days.subscribeBlockedTimes(anyone(), 'karim', TODAY, ok, fail));
    expect(blocked).toEqual([
      { date: TOMORROW, start: '15:30', end: '16:00' },
      { date: TOMORROW, start: '16:30', end: '17:00' },
    ]);
    await expect(
      bookings.createBooking(customer(SARA), request({ phone: '+96171123456', startTime: '15:30' })),
    ).rejects.toBeInstanceOf(errors.SlotTakenError);
    await days.unblockTime(karim(), 'karim', TOMORROW, '15:30', '16:00');
    await bookings.createBooking(customer(SARA), request({ phone: '+96171123456', startTime: '15:30' }));
    await expect(days.blockTime(sami(), 'karim', TOMORROW, '18:00', '18:15')).rejects.toThrow();
  });
});

describe('moving bookings (owner)', () => {
  it("moves a booking to a free barber: the old barber's time frees up, the new one's is taken", async () => {
    const { bookingCode } = await bookings.createBooking(customer(RAMI), request());
    const moved = await bookings.moveBooking(owner(), bookingCode, 'sami');
    expect(moved).toMatchObject({ barberId: 'sami', barberName: 'Sami', phone: '+96170123456', startTime: '11:00' });
    expect(await bookedTimes('karim')).toEqual([]);
    expect(await bookedTimes('sami')).toEqual(['11:00', '11:15']);
    const mine = await first((ok, fail) => bookings.subscribeMyBookings(customer(RAMI), RAMI.uid, ok, fail));
    expect(mine[0].barberName).toBe('Sami');
  });

  it('refuses a busy barber, an inactive one, and anyone but the owner', async () => {
    const { bookingCode } = await bookings.createBooking(customer(RAMI), request());
    await bookings.createBooking(customer(SARA), request({ phone: '+96171123456', barberId: 'sami', startTime: '11:15' }));
    await expect(bookings.moveBooking(owner(), bookingCode, 'sami')).rejects.toBeInstanceOf(errors.SlotTakenError);
    await seedBarber({ ...BARBERS[3], active: false });
    await expect(bookings.moveBooking(owner(), bookingCode, 'omar')).rejects.toBeInstanceOf(errors.NotBookableError);
    await expect(bookings.moveBooking(karim(), bookingCode, 'fadi')).rejects.toThrow();
  });

  it("lists a deactivated barber's upcoming bookings so the owner can move them", async () => {
    const { bookingCode } = await bookings.createBooking(customer(RAMI), request());
    await accounts.deactivateBarber(owner(), 'karim');
    const left = await first((ok, fail) => bookings.subscribeUpcomingBookings(owner(), 'karim', TODAY, ok, fail));
    expect(left.map((b) => b.bookingCode)).toEqual([bookingCode]);
    await bookings.moveBooking(owner(), bookingCode, 'fadi');
    const after = await first((ok, fail) => bookings.subscribeUpcomingBookings(owner(), 'karim', TODAY, ok, fail));
    expect(after).toEqual([]);
  });
});

describe('staff logins (Auth emulator)', () => {
  const apps: FirebaseApp[] = [];

  /** A fresh Firebase Auth on the emulator, like one browser tab. */
  function newAuth(): Auth {
    const app = initializeApp(DEMO_CONFIG, `test-${apps.length}-${Date.now()}`);
    apps.push(app);
    const auth = initializeAuth(app, { persistence: inMemoryPersistence });
    connectAuthEmulator(auth, AUTH_URL, { disableWarnings: true });
    return auth;
  }

  beforeEach(async () => {
    await fetch(`${AUTH_URL}/emulator/v1/projects/demo-barbershop/accounts`, { method: 'DELETE' });
  });

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => deleteApp(app)));
  });

  it('the owner creates a barber login and stays signed in; the barber signs in with his username', async () => {
    const ownerTab = newAuth();
    const me = (await createUserWithEmailAndPassword(ownerTab, 'sassine.ab12@staff.invalid', 'owner-pass-1')).user;

    const uid = await accounts.createLogin(owner(), { username: ' Omar ', password: 'omar-pass-1', barberId: 'omar' });
    expect(ownerTab.currentUser?.uid).toBe(me.uid);

    const user = await accounts.signInStaff(anyone(), newAuth(), 'OMAR', 'omar-pass-1');
    expect(user.uid).toBe(uid);
    const member = await first((ok, fail) => accounts.subscribeMyStaff(staff({ uid, username: 'omar' }), uid, ok, fail));
    expect(member).toEqual({ uid, username: 'omar', barberId: 'omar', role: 'barber', active: true });
  });

  it('usernames are unique; wrong usernames and passwords get the same answer', async () => {
    await expect(
      accounts.createLogin(owner(), { username: 'karim', password: 'x-pass-123', barberId: 'karim' }),
    ).rejects.toBeInstanceOf(errors.UsernameTakenError);
    await accounts.createLogin(owner(), { username: 'omar', password: 'omar-pass-1', barberId: 'omar' });
    await expect(accounts.signInStaff(anyone(), newAuth(), 'nobody', 'omar-pass-1')).rejects.toBeInstanceOf(
      errors.WrongLoginError,
    );
    await expect(accounts.signInStaff(anyone(), newAuth(), 'omar', 'wrong-pass')).rejects.toBeInstanceOf(
      errors.WrongLoginError,
    );
  });

  it('only the owner creates logins', async () => {
    await expect(
      accounts.createLogin(karim(), { username: 'omar', password: 'omar-pass-1', barberId: 'omar' }),
    ).rejects.toThrow();
  });

  it('forgotten password: "New login" keeps the username and barber, the old password stops working', async () => {
    const oldUid = await accounts.createLogin(owner(), { username: 'omar', password: 'old-pass-1', barberId: 'omar' });
    const newUid = await accounts.newLogin(owner(), { username: 'omar', password: 'new-pass-1' });

    await expect(accounts.signInStaff(anyone(), newAuth(), 'omar', 'old-pass-1')).rejects.toBeInstanceOf(
      errors.WrongLoginError,
    );
    expect((await accounts.signInStaff(anyone(), newAuth(), 'omar', 'new-pass-1')).uid).toBe(newUid);
    const list = await first((ok, fail) => accounts.subscribeStaff(owner(), ok, fail));
    expect(list.find((s) => s.uid === oldUid)).toMatchObject({ active: false, barberId: 'omar' });
    expect(list.find((s) => s.uid === newUid)).toMatchObject({ active: true, barberId: 'omar' });
    await expect(accounts.newLogin(owner(), { username: 'sassine', password: 'x-pass-123' })).rejects.toBeInstanceOf(
      errors.OwnAccountError,
    );
  });

  it("deactivating a barber hides him from customers and turns his logins off, never the owner's", async () => {
    await accounts.deactivateBarber(owner(), 'karim');
    const karimLogin = await getDoc(doc(owner().db, 'staff', KARIM.uid));
    expect(karimLogin.get('active')).toBe(false);
    await expect(bookings.createBooking(customer(RAMI), request())).rejects.toBeInstanceOf(errors.NotBookableError);
    await expect(first((ok, fail) => bookings.subscribeBookingsOn(karim(), 'karim', TOMORROW, ok, fail))).rejects.toThrow();
    await expect(accounts.deactivateBarber(owner(), 'sassine')).rejects.toBeInstanceOf(errors.OwnAccountError);

    await accounts.setLoginActive(owner(), KARIM.uid, true);
    expect((await getDoc(doc(owner().db, 'staff', KARIM.uid))).get('active')).toBe(true);
  });

  it('the demo shop (npm run seed) works: customers can book it, its staff can sign in', async () => {
    const demo = await import('../scripts/demoShop');
    await demo.seedDemoShop();
    const c = nthCustomer(1);
    const booked = await bookings.createBooking(
      customer(c),
      request({ phone: c.phone, barberId: null, date: demo.DEMO_DAY, startTime: '10:00' }),
    );
    // At 10:00 Tony and Karim are booked, Sami starts at 12:00 and Omar is off: only Fadi is free.
    expect(booked.barberId).toBe('fadi');
    const user = await accounts.signInStaff(anyone(), newAuth(), 'tony', demo.DEMO_PASSWORD);
    const me = await first((ok, fail) => accounts.subscribeMyStaff(staff({ uid: user.uid, username: 'tony' }), user.uid, ok, fail));
    expect(me?.role).toBe('owner');
  });

  it('a barber changes his own password; a wrong current password is refused', async () => {
    await accounts.createLogin(owner(), { username: 'omar', password: 'old-pass-1', barberId: 'omar' });
    const tab = newAuth();
    const user = await accounts.signInStaff(anyone(), tab, 'omar', 'old-pass-1');
    await expect(accounts.changeMyPassword(user, 'not-it-123', 'new-pass-1')).rejects.toBeInstanceOf(
      errors.WrongLoginError,
    );
    await accounts.changeMyPassword(user, 'old-pass-1', 'new-pass-1');
    const email = (await getDoc(doc(anyone().db, 'usernames', 'omar'))).get('email');
    await expect(signInWithEmailAndPassword(newAuth(), email, 'new-pass-1')).resolves.toBeTruthy();
  });
});
