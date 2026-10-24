/**
 * Tests for firestore.rules (the multi-barber shop) against the Firestore emulator.
 * Run with `npm run test:emu` (needs Java 21+ for the emulator).
 */
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { SHOP_TIME_ZONE } from '../src/config';
import { dayDocId, hoursFromShop, slotKey, toBarberDoc } from '../src/lib/barberDoc';
import { weekdayIndex } from '../src/lib/schedule';
import { DEFAULT_COLORS, defaultShopSettings, toShopDoc } from '../src/lib/shopDoc';
import { slotsNeeded } from '../src/lib/slots';
import { addDays, zonedInstant } from '../src/lib/time';
import type { Barber, DayHours, ShopSettings } from '../src/types';

const SERVICES = {
  beard: { id: 'beard', name: 'Beard', durationMinutes: 15 },
  haircut: { id: 'haircut', name: 'Haircut', durationMinutes: 30 },
  haircutBeard: { id: 'haircut-beard', name: 'Haircut + Beard', durationMinutes: 45 },
};
type ServiceInfo = (typeof SERVICES)[keyof typeof SERVICES] | { id: string; name: string; durationMinutes: number };

const PHONE = '+96170123456';
const OTHER_PHONE = '+9613123456';

/** Google customers. */
const RAMI = { uid: 'rami-uid', email: 'rami@example.com' };
const SARA = { uid: 'sara-uid', email: 'sara@example.com' };
const NADIM = { uid: 'nadim-uid', email: 'nadim@example.com' };
type CustomerInfo = typeof RAMI;

/** Today's date in Beirut, whatever time zone the tests run in. */
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: SHOP_TIME_ZONE }).format(new Date());
const TOMORROW = addDays(TODAY, 1);

/** Open 10:00–20:00 every day; Haircut 30, Beard 15, Haircut + Beard 45; 4 days ahead. */
const SHOP: ShopSettings = { ...defaultShopSettings('Sassine Maatouk'), whatsapp: '+96171000000' };

/** Works the shop's hours with a 14:00–15:00 break. */
function makeBarber(id: string, name: string, order: number): Barber {
  return {
    id,
    name,
    active: true,
    order,
    weeklyHours: hoursFromShop(SHOP.openingHours).map((d) => ({
      ...d,
      breaks: [{ start: '14:00', end: '15:00' }],
    })),
    daysOff: [],
  };
}

const BARBERS = {
  sassine: makeBarber('sassine', 'Sassine', 0),
  karim: makeBarber('karim', 'Karim', 1),
  sami: makeBarber('sami', 'Sami', 2),
};

/** Staff logins: the owner (also a barber) and two barbers. */
interface StaffInfo {
  uid: string;
  username: string;
  barberId: string;
  role: 'owner' | 'barber';
}
const OWNER: StaffInfo = { uid: 'owner-uid', username: 'sassine', barberId: 'sassine', role: 'owner' };
const KARIM: StaffInfo = { uid: 'karim-uid', username: 'karim', barberId: 'karim', role: 'barber' };
const SAMI: StaffInfo = { uid: 'sami-uid', username: 'sami', barberId: 'sami', role: 'barber' };

/** The internal email of a login (docs/ARCHITECTURE.md, 5.1). */
const loginEmail = (username: string, suffix = 'ab12') => `${username}.${suffix}@staff.invalid`;

const RULES = readFileSync('firestore.rules', 'utf8');

let env: RulesTestEnvironment;

function startEnv(rules = RULES) {
  return initializeTestEnvironment({ projectId: 'demo-barbershop', firestore: { rules } });
}

beforeAll(async () => {
  env = await startEnv();
});

/** Runs `fn` with `rules` loaded instead of firestore.rules, keeping the data. */
async function withRules(rules: string, fn: () => Promise<unknown>) {
  await env.cleanup();
  env = await startEnv(rules);
  try {
    await fn();
  } finally {
    await env.cleanup();
    env = await startEnv();
  }
}

afterAll(() => env.cleanup());

// The contexts return compat instances; the modular functions accept them at runtime.
const asDb = (ctx: { firestore(): unknown }) => ctx.firestore() as unknown as Firestore;
const anyone = () => asDb(env.unauthenticatedContext());
/** Signed in with Google, as customers are. */
const customer = (c: CustomerInfo) =>
  asDb(env.authenticatedContext(c.uid, { email: c.email, firebase: { sign_in_provider: 'google.com' } }));
const rami = () => customer(RAMI);
const sara = () => customer(SARA);
/** Signed in with username + password. */
const staffUser = (s: { uid: string; username: string }) =>
  asDb(
    env.authenticatedContext(s.uid, {
      email: loginEmail(s.username),
      firebase: { sign_in_provider: 'password' },
    }),
  );
const owner = () => staffUser(OWNER);
const karim = () => staffUser(KARIM);
const sami = () => staffUser(SAMI);
/** Someone who made an email/password account on their own: no staff doc. */
const stranger = () => staffUser({ uid: 'stranger-uid', username: 'stranger' });
/** The owner's UID, but signed in with Google instead of his password. */
const ownerViaGoogle = () =>
  asDb(env.authenticatedContext(OWNER.uid, { email: 'x@gmail.com', firebase: { sign_in_provider: 'google.com' } }));

/** Runs `fn` with the rules off, to set up data. */
function seed(fn: (db: Firestore) => Promise<unknown>) {
  return env.withSecurityRulesDisabled((ctx) => fn(asDb(ctx)).then(() => undefined));
}

function seedShop(change: Partial<ShopSettings> = {}) {
  return seed((db) =>
    setDoc(doc(db, 'settings', 'shop'), { ...toShopDoc({ ...SHOP, ...change }), updatedAt: Timestamp.now() }),
  );
}

function seedBarber(barber: Barber) {
  return seed((db) =>
    setDoc(doc(db, 'barbers', barber.id), { ...toBarberDoc(barber), updatedAt: Timestamp.now() }),
  );
}

function seedStaff(s: StaffInfo, change: Record<string, unknown> = {}) {
  return seed(async (db) => {
    await setDoc(doc(db, 'staff', s.uid), {
      username: s.username,
      barberId: s.barberId,
      role: s.role,
      active: true,
      createdAt: Timestamp.now(),
      ...change,
    });
    await setDoc(doc(db, 'usernames', s.username), { uid: s.uid, email: loginEmail(s.username) });
  });
}

beforeEach(async () => {
  await env.clearFirestore();
  await seedShop();
  for (const b of Object.values(BARBERS)) await seedBarber(b);
  for (const s of [OWNER, KARIM, SAMI]) await seedStaff(s);
});

/** `barber`'s weekly hours with `date`'s weekday replaced by `hours`. */
function hoursWith(barber: Barber, date: string, hours: Partial<DayHours>): DayHours[] {
  return barber.weeklyHours.map((d, i) => (i === weekdayIndex(date) ? { ...d, ...hours } : d));
}

function startAt(date: string, time: string) {
  return Timestamp.fromDate(zonedInstant(date, time, SHOP_TIME_ZONE));
}

const dayRef = (db: Firestore, barberId: string, date: string) =>
  doc(db, 'days', dayDocId(barberId, date));

/** A day doc's maps as stored, or empty ones. */
async function dayMaps(db: Firestore, barberId: string, date: string) {
  const data = (await getDoc(dayRef(db, barberId, date))).data();
  return {
    booked: { ...(data?.booked ?? {}) } as Record<string, string>,
    blocked: { ...(data?.blocked ?? {}) } as Record<string, true>,
  };
}

interface BookingOptions {
  code?: string;
  barberId?: string;
  /** Defaults to the barber's name. */
  barberName?: string;
  phone?: string | null;
  /** Whose booking it is; null for a walk-in. */
  customer?: CustomerInfo | null;
  service?: ServiceInfo;
  date?: string;
  time?: string;
  anyBarber?: boolean;
  /** Phone seat to take (1 or 2), or null for none. */
  seat?: 1 | 2 | null;
  /** Account seat to take (1 or 2), or null for none. */
  accountSeat?: 1 | 2 | null;
  /** Slot times to claim in the day doc; defaults to every slot the service needs. */
  slots?: string[];
  /** Fields to override or add on the booking doc. */
  fields?: Record<string, unknown>;
  /** Fields to override on the day doc, or null to not write it at all. */
  day?: Record<string, unknown> | null;
}

function bookingFields(o: BookingOptions = {}) {
  const service = o.service ?? SERVICES.haircut;
  const date = o.date ?? TOMORROW;
  const time = o.time ?? '11:00';
  const barberId = o.barberId ?? 'karim';
  const who = o.customer === undefined ? RAMI : o.customer;
  return {
    name: 'Rami',
    phone: o.phone === undefined ? PHONE : o.phone,
    serviceId: service.id,
    serviceName: service.name,
    date,
    startTime: time,
    startAt: startAt(date, time),
    durationMinutes: service.durationMinutes,
    bookingCode: o.code ?? 'ABC234',
    status: 'booked',
    createdAt: serverTimestamp(),
    customerUid: who?.uid ?? null,
    customerEmail: who?.email ?? null,
    barberId,
    barberName: o.barberName ?? BARBERS[barberId as keyof typeof BARBERS]?.name ?? barberId,
    anyBarber: o.anyBarber ?? false,
    // The seats the booking takes; walk-ins take none.
    phoneSeat: who ? (o.seat === undefined ? 1 : o.seat) : null,
    accountSeat: who ? (o.accountSeat === undefined ? 1 : o.accountSeat) : null,
    ...o.fields,
  };
}

/** The seat docs a booking takes: [collection, id] pairs. */
function seatsOf(o: BookingOptions, fields: ReturnType<typeof bookingFields>) {
  const seat = o.seat === undefined ? 1 : o.seat;
  const accountSeat = o.accountSeat === undefined ? 1 : o.accountSeat;
  const seats: [string, string][] = [];
  if (seat !== null && fields.phone) seats.push(['phoneLimits', `${fields.phone}_${seat}`]);
  if (accountSeat !== null && fields.customerUid) {
    seats.push(['userLimits', `${fields.customerUid}_${accountSeat}`]);
  }
  return seats;
}

/** A walk-in: no customer, phone or seats. */
const walkIn = (o: BookingOptions = {}): BookingOptions => ({
  customer: null,
  phone: null,
  seat: null,
  accountSeat: null,
  ...o,
});

/** Books the way the site does: booking + the barber's day doc + seats in one atomic write. */
async function book(db: Firestore, o: BookingOptions = {}) {
  const fields = bookingFields(o);
  const code = fields.bookingCode;
  const batch = writeBatch(db);
  batch.set(doc(db, 'bookings', code), fields);
  if (o.day !== null) {
    const maps = await dayMaps(db, fields.barberId, fields.date);
    for (const t of o.slots ?? slotsNeeded(fields.startTime, fields.durationMinutes)) {
      maps.booked[slotKey(t)] = code;
    }
    batch.set(dayRef(db, fields.barberId, fields.date), {
      barberId: fields.barberId,
      date: fields.date,
      ...maps,
      lastBookingId: code,
      bookingAt: serverTimestamp(),
      ...o.day,
    });
  }
  for (const [col, id] of seatsOf(o, fields)) {
    batch.set(doc(db, col, id), { bookingId: code, startAt: fields.startAt });
  }
  return batch.commit();
}

/** Puts a booking (with its slots and seats) in the database, bypassing the rules. */
function seedBooking(o: BookingOptions & { status?: string } = {}) {
  return seed(async (db) => {
    const fields = { ...bookingFields(o), createdAt: Timestamp.now() };
    if (o.status) fields.status = o.status;
    await setDoc(doc(db, 'bookings', fields.bookingCode), fields);
    const maps = await dayMaps(db, fields.barberId, fields.date);
    for (const t of slotsNeeded(fields.startTime, fields.durationMinutes)) {
      maps.booked[slotKey(t)] = fields.bookingCode;
    }
    await setDoc(dayRef(db, fields.barberId, fields.date), {
      barberId: fields.barberId,
      date: fields.date,
      ...maps,
      lastBookingId: fields.bookingCode,
      bookingAt: Timestamp.now(),
    });
    for (const [col, id] of seatsOf(o, fields)) {
      await setDoc(doc(db, col, id), { bookingId: fields.bookingCode, startAt: fields.startAt });
    }
  });
}

interface SlotChange {
  barberId?: string;
  date?: string;
  /** Times whose keys to remove; defaults to the default booking's (11:00, 30 min). */
  times?: string[];
  /** Fields to override on the day doc, or null to not write it. */
  day?: Record<string, unknown> | null;
}

/** Writes `db`'s view of a day doc with `times` removed from `booked`. */
async function releaseSlots(db: Firestore, batch: ReturnType<typeof writeBatch>, code: string, c: SlotChange) {
  if (c.day === null) return;
  const barberId = c.barberId ?? 'karim';
  const date = c.date ?? TOMORROW;
  const maps = await dayMaps(db, barberId, date);
  for (const t of c.times ?? slotsNeeded('11:00', 30)) delete maps.booked[slotKey(t)];
  batch.set(dayRef(db, barberId, date), {
    barberId,
    date,
    ...maps,
    lastBookingId: code,
    bookingAt: serverTimestamp(),
    ...c.day,
  });
}

/** Cancels the way the site does: status + cancelledAt, and frees its slots, in one write. */
async function cancel(db: Firestore, code = 'ABC234', c: SlotChange & { fields?: Record<string, unknown> } = {}) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'bookings', code), { status: 'cancelled', cancelledAt: serverTimestamp(), ...c.fields });
  await releaseSlots(db, batch, code, c);
  return batch.commit();
}

/** The owner's move: the booking to `to`, its slots out of the old day doc and into the new one. */
async function move(
  db: Firestore,
  to: string,
  o: { code?: string; from?: string; date?: string; times?: string[]; fields?: Record<string, unknown>; release?: boolean; claim?: boolean } = {},
) {
  const code = o.code ?? 'ABC234';
  const date = o.date ?? TOMORROW;
  const times = o.times ?? slotsNeeded('11:00', 30);
  const batch = writeBatch(db);
  batch.update(doc(db, 'bookings', code), {
    barberId: to,
    barberName: BARBERS[to as keyof typeof BARBERS]?.name ?? to,
    movedAt: serverTimestamp(),
    ...o.fields,
  });
  if (o.release !== false) await releaseSlots(db, batch, code, { barberId: o.from ?? 'karim', date, times });
  if (o.claim !== false) {
    const maps = await dayMaps(db, to, date);
    for (const t of times) maps.booked[slotKey(t)] = code;
    batch.set(dayRef(db, to, date), { barberId: to, date, ...maps, lastBookingId: code, bookingAt: serverTimestamp() });
  }
  return batch.commit();
}

/** Blocks (or with `unblock`, frees) `times` in a barber's day doc. */
async function block(
  db: Firestore,
  barberId: string,
  times: string[],
  o: { date?: string; unblock?: boolean; day?: Record<string, unknown> } = {},
) {
  const date = o.date ?? TOMORROW;
  const maps = await dayMaps(db, barberId, date);
  const existing = (await getDoc(dayRef(db, barberId, date))).data();
  for (const t of times) {
    if (o.unblock) delete maps.blocked[slotKey(t)];
    else maps.blocked[slotKey(t)] = true;
  }
  // Kept as they are: blocking only changes `blocked`.
  const kept = existing?.lastBookingId
    ? { lastBookingId: existing.lastBookingId, bookingAt: existing.bookingAt }
    : {};
  return setDoc(dayRef(db, barberId, date), { barberId, date, ...maps, ...kept, ...o.day });
}

function setStatus(db: Firestore, status: string, code = 'ABC234', extra: Record<string, unknown> = {}) {
  return updateDoc(doc(db, 'bookings', code), { status, statusChangedAt: serverTimestamp(), ...extra });
}

const bookingsOf = (db: Firestore, field: string, value: string) =>
  getDocs(query(collection(db, 'bookings'), where(field, '==', value)));

// ---------------------------------------------------------------------------------------------

describe('public reads', () => {
  it('anyone can read the shop, branding, barbers and day docs', async () => {
    await seedBooking();
    await assertSucceeds(getDoc(doc(anyone(), 'settings', 'shop')));
    await assertSucceeds(getDoc(doc(anyone(), 'settings', 'branding')));
    await assertSucceeds(getDocs(collection(anyone(), 'barbers')));
    await assertSucceeds(getDoc(dayRef(anyone(), 'karim', TOMORROW)));
    await assertSucceeds(getDocs(query(collection(anyone(), 'days'), where('date', '==', TOMORROW))));
  });

  it('anyone can look a username up, but nobody can list them', async () => {
    await assertSucceeds(getDoc(doc(anyone(), 'usernames', 'karim')));
    await assertFails(getDocs(collection(anyone(), 'usernames')));
    await assertFails(getDocs(collection(owner(), 'usernames')));
  });
});

describe('reading bookings', () => {
  beforeEach(() => seedBooking());

  it('a customer can get and list only their own', async () => {
    await assertSucceeds(getDoc(doc(rami(), 'bookings', 'ABC234')));
    await assertSucceeds(bookingsOf(rami(), 'customerUid', RAMI.uid));
    await assertFails(getDoc(doc(sara(), 'bookings', 'ABC234')));
    await assertFails(bookingsOf(sara(), 'customerUid', RAMI.uid));
    await assertFails(getDocs(collection(rami(), 'bookings')));
  });

  it("a barber can get and list only his own barber's bookings", async () => {
    await assertSucceeds(getDoc(doc(karim(), 'bookings', 'ABC234')));
    await assertSucceeds(bookingsOf(karim(), 'barberId', 'karim'));
    await assertFails(getDoc(doc(sami(), 'bookings', 'ABC234')));
    await assertFails(bookingsOf(sami(), 'barberId', 'karim'));
    await assertFails(getDocs(collection(sami(), 'bookings')));
  });

  it('the owner can read every booking', async () => {
    await assertSucceeds(getDoc(doc(owner(), 'bookings', 'ABC234')));
    await assertSucceeds(getDocs(collection(owner(), 'bookings')));
  });

  it('staff and customers may check that an unused code is free', async () => {
    await assertSucceeds(getDoc(doc(rami(), 'bookings', 'ZZZ999')));
    await assertSucceeds(getDoc(doc(sami(), 'bookings', 'ZZZ999')));
  });

  it('a deactivated login, a stranger password account and visitors read nothing', async () => {
    await seedStaff(KARIM, { active: false });
    await assertFails(getDoc(doc(karim(), 'bookings', 'ABC234')));
    await assertFails(bookingsOf(karim(), 'barberId', 'karim'));
    await assertFails(getDoc(doc(karim(), 'bookings', 'ZZZ999')));
    await assertFails(getDoc(doc(stranger(), 'bookings', 'ABC234')));
    await assertFails(getDoc(doc(stranger(), 'bookings', 'ZZZ999')));
    await assertFails(getDoc(doc(anyone(), 'bookings', 'ABC234')));
  });

  it("the owner's UID signed in with Google is a customer, not the owner", async () => {
    await assertFails(getDocs(collection(ownerViaGoogle(), 'bookings')));
  });
});

describe('customer bookings', () => {
  it('a customer can book a barber', async () => {
    await assertSucceeds(book(rami()));
  });

  it('can book "Any barber" (flagged, assigned to a real barber)', async () => {
    await assertSucceeds(book(rami(), { anyBarber: true, barberId: 'sami' }));
  });

  it('two barbers can be booked at the same time', async () => {
    await assertSucceeds(book(rami(), { barberId: 'karim' }));
    await assertSucceeds(book(sara(), { code: 'BBB333', barberId: 'sami', phone: OTHER_PHONE, customer: SARA }));
  });

  it('the same barber can never be double-booked', async () => {
    await book(rami());
    await assertFails(book(sara(), { code: 'BBB333', phone: OTHER_PHONE, customer: SARA }));
    // Overlapping: 11:15 is the booking's second slot.
    await assertFails(book(sara(), { code: 'BBB333', phone: OTHER_PHONE, customer: SARA, time: '11:15', service: SERVICES.beard }));
    await assertSucceeds(book(sara(), { code: 'BBB333', phone: OTHER_PHONE, customer: SARA, time: '11:30' }));
  });

  it('must claim exactly its own slots in the barber\'s day doc', async () => {
    await assertFails(book(rami(), { day: null }));
    await assertFails(book(rami(), { slots: ['11:00'] }));
    await assertFails(book(rami(), { slots: ['11:00', '11:15', '11:30'] }));
    await assertFails(book(rami(), { slots: ['11:00', '11:30'] }));
    await assertFails(book(rami(), { day: { lastBookingId: 'ZZZ999' } }));
    await assertFails(book(rami(), { day: { booked: { '1100': 'ABC234', '1115': 'ZZZ999' } } }));
  });

  it("can't claim slots in another barber's day doc, or on another date", async () => {
    await assertFails(
      book(rami(), { day: { barberId: 'sami' } }), // the ID says karim
    );
    await assertFails(book(rami(), { day: { date: addDays(TOMORROW, 1) } }));
  });

  it('a day doc changes only with a booking: no claiming time without one', async () => {
    const db = rami();
    await assertFails(
      setDoc(dayRef(db, 'karim', TOMORROW), {
        barberId: 'karim',
        date: TOMORROW,
        booked: { '1100': 'ABC234' },
        blocked: {},
        lastBookingId: 'ABC234',
      }),
    );
  });

  it("can't change the barber's blocked time while booking", async () => {
    await assertFails(book(rami(), { day: { blocked: { '1800': true } } }));
  });

  it('must name the barber correctly, and he must be active', async () => {
    await assertFails(book(rami(), { barberName: 'Sami' }));
    await assertFails(book(rami(), { barberId: 'nobody', barberName: 'Nobody' }));
    await seedBarber({ ...BARBERS.karim, active: false });
    await assertFails(book(rami()));
  });

  it('refused on his day off, a shop closed day, or a weekday he doesn\'t work', async () => {
    await seedBarber({ ...BARBERS.karim, daysOff: [TOMORROW] });
    await assertFails(book(rami()));
    await assertSucceeds(book(rami(), { barberId: 'sami' }));

    await seedBarber({ ...BARBERS.karim, weeklyHours: hoursWith(BARBERS.karim, TOMORROW, { closed: true }) });
    await assertFails(book(sara(), { code: 'BBB333', phone: OTHER_PHONE, customer: SARA }));

    await seedShop({ closedDays: [TOMORROW] });
    await assertFails(book(sara(), { code: 'BBB333', phone: OTHER_PHONE, customer: SARA, barberId: 'sassine' }));
  });

  it("must be inside the barber's hours and clear of his breaks", async () => {
    await assertFails(book(rami(), { time: '09:45' }));
    await assertFails(book(rami(), { time: '19:45' })); // runs past 20:00
    await assertFails(book(rami(), { time: '13:45' })); // runs into his 14:00 break
    await assertFails(book(rami(), { time: '14:30', service: SERVICES.beard }));
    await seedBarber({
      ...BARBERS.karim,
      weeklyHours: hoursWith(BARBERS.karim, TOMORROW, {
        start: '12:00',
        breaks: [
          { start: '13:00', end: '13:30' },
          { start: '16:00', end: '16:30' },
        ],
      }),
    });
    await assertFails(book(rami(), { time: '11:00' }));
    await assertFails(book(rami(), { time: '16:00' })); // second break
    await assertSucceeds(book(rami(), { time: '12:30' }));
  });

  it("must also be inside the shop's opening hours, even if his reach further", async () => {
    // The owner narrowed the shop's hours after the barber's were saved.
    await seedShop({
      openingHours: SHOP.openingHours.map((d, i) => (i === weekdayIndex(TOMORROW) ? { ...d, start: '12:00' } : d)),
    });
    await assertFails(book(rami(), { time: '11:00' }));
    await assertSucceeds(book(rami(), { time: '12:00' }));
  });

  it("can't take blocked time, or run into it", async () => {
    await block(karim(), 'karim', ['11:15']);
    await assertFails(book(rami()));
    await assertFails(book(rami(), { time: '11:15', service: SERVICES.beard }));
    await assertSucceeds(book(rami(), { time: '11:30' }));
  });

  it("another barber's blocked time doesn't matter", async () => {
    await block(sami(), 'sami', ['11:00', '11:15']);
    await assertSucceeds(book(rami()));
  });

  it('must use a current service with its current name and length', async () => {
    await assertFails(book(rami(), { service: { id: 'gone', name: 'Gone', durationMinutes: 30 } }));
    await assertFails(book(rami(), { service: { id: 'haircut', name: 'Haircut', durationMinutes: 15 } }));
    await assertFails(book(rami(), { service: { id: 'haircut', name: 'Shave', durationMinutes: 30 } }));
  });

  it('must be in the future, within the booking window', async () => {
    await assertFails(book(rami(), { date: addDays(TODAY, -1) }));
    await assertFails(book(rami(), { date: addDays(TODAY, 4) })); // today + 3 is the last day
    await assertSucceeds(book(rami(), { date: addDays(TODAY, 3) }));
  });

  it('a special period on today extends the window', async () => {
    await seedShop({ specialPeriods: [{ name: 'Eid', start: TODAY, end: TODAY, daysAhead: 10 }] });
    await assertSucceeds(book(rami(), { date: addDays(TODAY, 8) }));
  });

  it('must come from a Google sign-in with its own UID and email', async () => {
    await assertFails(book(anyone()));
    await assertFails(book(stranger(), { customer: { uid: 'stranger-uid', email: loginEmail('stranger') } }));
    await assertFails(book(sara()));
    await assertFails(book(rami(), { fields: { customerEmail: 'other@example.com' } }));
  });

  it('must have the right shape', async () => {
    await assertFails(book(rami(), { fields: { price: 10 } }));
    await assertFails(book(rami(), { fields: { status: 'done' } }));
    await assertFails(book(rami(), { fields: { anyBarber: 'yes' } }));
    await assertFails(book(rami(), { phone: '+33612345678' }));
    await assertFails(book(rami(), { code: 'abc234' }));
    await assertFails(book(rami(), { fields: { name: 'R' } }));
    await assertFails(book(rami(), { fields: { startAt: startAt(TOMORROW, '12:00') } }));
  });
});

describe('two upcoming bookings per phone and per Google account', () => {
  it('a third booking is refused, whichever seat it tries', async () => {
    await book(rami(), { code: 'AAA222', time: '10:00', seat: 1, accountSeat: 1 });
    await book(rami(), { code: 'BBB333', time: '11:00', seat: 2, accountSeat: 2 });
    for (const seat of [1, 2] as const) {
      await assertFails(book(rami(), { code: 'CCC444', time: '12:00', seat, accountSeat: seat }));
    }
  });

  it('the phone limit holds across Google accounts, and across barbers', async () => {
    await book(rami(), { code: 'AAA222', time: '10:00', seat: 1 });
    await book(sara(), { code: 'BBB333', barberId: 'sami', seat: 2, customer: SARA });
    await assertFails(book(customer(NADIM), { code: 'CCC444', barberId: 'sassine', seat: 1, customer: NADIM }));
    await assertFails(book(customer(NADIM), { code: 'CCC444', barberId: 'sassine', seat: 2, customer: NADIM }));
  });

  it("a booking must take the seats it names, and only seats 1 and 2 exist", async () => {
    await assertFails(book(rami(), { fields: { phoneSeat: 2 } })); // takes phone seat 1
    await assertFails(book(rami(), { fields: { accountSeat: 2 } }));
    await assertFails(book(rami(), { seat: 3 as 1, accountSeat: 1 }));
    await assertFails(book(rami(), { seat: null }));
  });

  it('a cancelled booking frees its seat', async () => {
    await book(rami(), { code: 'AAA222', time: '10:00', seat: 1, accountSeat: 1 });
    await book(rami(), { code: 'BBB333', time: '11:00', seat: 2, accountSeat: 2 });
    await cancel(rami(), 'AAA222', { times: ['10:00', '10:15'] });
    await assertSucceeds(book(rami(), { code: 'CCC444', time: '12:00', seat: 1, accountSeat: 1 }));
  });
});

describe('cancelling', () => {
  beforeEach(() => seedBooking());

  it('a customer can cancel their own booking, freeing its slots', async () => {
    await assertSucceeds(cancel(rami()));
    await assertSucceeds(book(sara(), { code: 'BBB333', phone: OTHER_PHONE, customer: SARA }));
  });

  it("refused without freeing the slots, or freeing someone else's too", async () => {
    await assertFails(cancel(rami(), 'ABC234', { day: null }));
    await assertFails(cancel(rami(), 'ABC234', { times: ['11:00'] }));
    await seedBooking({ code: 'BBB333', time: '12:00', customer: SARA, phone: OTHER_PHONE, seat: 1, accountSeat: 1 });
    await assertFails(cancel(rami(), 'ABC234', { times: ['11:00', '11:15', '12:00'] }));
  });

  it("can't pass off a write that only blocks time as freeing its slots", async () => {
    // Blocking keeps the day doc's lastBookingId and bookingAt from when the booking was made.
    const db = karim();
    const batch = writeBatch(db);
    batch.update(doc(db, 'bookings', 'ABC234'), { status: 'cancelled', cancelledAt: serverTimestamp() });
    const day = (await getDoc(dayRef(db, 'karim', TOMORROW))).data()!;
    batch.set(dayRef(db, 'karim', TOMORROW), { ...day, blocked: { '1800': true } });
    await assertFails(batch.commit());
  });

  it("can't cancel someone else's, or after it started", async () => {
    await assertFails(cancel(sara()));
    await seedBooking({ code: 'BBB333', date: TODAY, time: '00:00', fields: { startAt: Timestamp.fromMillis(Date.now() - 60_000) } });
    await assertFails(cancel(rami(), 'BBB333', { date: TODAY, times: ['00:00', '00:15'] }));
  });

  it("the barber and the owner can cancel, another barber can't", async () => {
    await assertFails(cancel(sami()));
    await assertSucceeds(cancel(karim()));
    await seedBooking({ code: 'BBB333', time: '12:00', seat: 2, accountSeat: 2 });
    await assertSucceeds(cancel(owner(), 'BBB333', { times: ['12:00', '12:15'] }));
  });

  it('a cancelled booking stays cancelled', async () => {
    await cancel(rami());
    await assertFails(setStatus(karim(), 'booked'));
    await assertFails(cancel(karim(), 'ABC234', { times: [] }));
  });
});

describe('booking status (done, no-show)', () => {
  beforeEach(() => seedBooking());

  it('the barber and the owner can mark done or no-show, and undo it', async () => {
    await assertSucceeds(setStatus(karim(), 'done'));
    await assertSucceeds(setStatus(karim(), 'booked'));
    await assertSucceeds(setStatus(owner(), 'no-show'));
  });

  it("another barber, a deactivated login and customers can't", async () => {
    await assertFails(setStatus(sami(), 'done'));
    await assertFails(setStatus(rami(), 'done'));
    await seedStaff(KARIM, { active: false });
    await assertFails(setStatus(karim(), 'done'));
  });

  it('only the status changes, never the time or the customer', async () => {
    await assertFails(setStatus(karim(), 'done', 'ABC234', { startTime: '12:00' }));
    await assertFails(setStatus(karim(), 'done', 'ABC234', { cancelledAt: serverTimestamp() }));
    await assertFails(setStatus(karim(), 'archived'));
  });

  it('a done booking keeps its slots, and must go back to booked before cancelling', async () => {
    await setStatus(karim(), 'done');
    await assertFails(book(sara(), { code: 'BBB333', phone: OTHER_PHONE, customer: SARA }));
    await assertFails(cancel(karim()));
  });
});

describe('walk-ins (staff bookings)', () => {
  it('a barber can add a walk-in for himself, the owner for anyone', async () => {
    await assertSucceeds(book(karim(), walkIn()));
    await assertSucceeds(book(owner(), walkIn({ code: 'BBB333', barberId: 'sami' })));
    await assertSucceeds(book(owner(), walkIn({ code: 'CCC444', barberId: 'sassine', phone: PHONE })));
  });

  it("a barber can't add one for another barber", async () => {
    await assertFails(book(karim(), walkIn({ barberId: 'sami' })));
  });

  it('may be outside the hours and window, or over blocked time, but never double-books', async () => {
    await block(karim(), 'karim', ['11:00']);
    await assertSucceeds(book(karim(), walkIn()));
    await assertSucceeds(book(karim(), walkIn({ code: 'BBB333', time: '21:00', date: addDays(TODAY, 20) })));
    await assertFails(book(karim(), walkIn({ code: 'CCC444', time: '11:15', service: SERVICES.beard })));
  });

  it('has no customer account, and refused for a deactivated login or a stranger', async () => {
    await assertFails(book(karim(), walkIn({ customer: RAMI })));
    await assertFails(book(karim(), walkIn({ anyBarber: true })));
    await assertFails(book(stranger(), walkIn()));
    await seedStaff(KARIM, { active: false });
    await assertFails(book(karim(), walkIn()));
  });
});

describe('blocked times', () => {
  it('a barber can block and unblock his own time, the owner anyone\'s', async () => {
    await assertSucceeds(block(karim(), 'karim', ['16:00', '16:15']));
    await assertSucceeds(block(karim(), 'karim', ['16:00'], { unblock: true }));
    await assertSucceeds(block(owner(), 'sami', ['16:00']));
  });

  it("a barber can't block another barber's time; customers and strangers can't block", async () => {
    await assertFails(block(karim(), 'sami', ['16:00']));
    await assertFails(block(rami(), 'karim', ['16:00']));
    await assertFails(block(stranger(), 'karim', ['16:00']));
    await assertFails(block(anyone(), 'karim', ['16:00']));
  });

  it('blocking never touches bookings', async () => {
    await seedBooking();
    await assertSucceeds(block(karim(), 'karim', ['16:00']));
    await assertFails(block(karim(), 'karim', ['16:00'], { day: { booked: {} } }));
    await assertFails(block(karim(), 'karim', ['16:00'], { day: { lastBookingId: 'ZZZ999' } }));
  });

  it("a new day doc made by blocking can't name a booking", async () => {
    await assertFails(block(karim(), 'karim', ['16:00'], { day: { lastBookingId: 'ABC234' } }));
  });

  it('a deactivated login can\'t block', async () => {
    await seedStaff(KARIM, { active: false });
    await assertFails(block(karim(), 'karim', ['16:00']));
  });

  it('day docs must match their ID and shape', async () => {
    await assertFails(block(karim(), 'karim', ['16:00'], { day: { date: TODAY } }));
    await assertFails(block(karim(), 'karim', ['16:00'], { day: { note: 'dentist' } }));
    await assertFails(setDoc(dayRef(karim(), 'karim', TOMORROW), { barberId: 'karim', date: TOMORROW, booked: {} }));
  });
});

describe('moving a booking to another barber', () => {
  beforeEach(() => seedBooking());

  it('the owner can move it to a free barber, same time', async () => {
    await assertSucceeds(move(owner(), 'sami'));
    // Karim's time is free again; Sami's is taken.
    await assertSucceeds(book(sara(), { code: 'BBB333', phone: OTHER_PHONE, customer: SARA }));
    await assertFails(book(customer(NADIM), { code: 'CCC444', barberId: 'sami', phone: '+96171123456', customer: NADIM }));
  });

  it('never onto a barber who is taken for any part of it', async () => {
    await seedBooking({ code: 'BBB333', barberId: 'sami', time: '11:15', service: SERVICES.beard, customer: SARA, phone: OTHER_PHONE });
    await assertFails(move(owner(), 'sami'));
  });

  it('must free the old slots and claim all the new ones', async () => {
    await assertFails(move(owner(), 'sami', { release: false }));
    await assertFails(move(owner(), 'sami', { claim: false }));
  });

  it('only to an active barber, under his name, never changing the time', async () => {
    await seedBarber({ ...BARBERS.sami, active: false });
    await assertFails(move(owner(), 'sami'));
    await assertFails(move(owner(), 'sassine', { fields: { barberName: 'Sami' } }));
    await assertFails(move(owner(), 'sassine', { fields: { startTime: '12:00' } }));
  });

  it('only by the owner', async () => {
    await assertFails(move(karim(), 'sami'));
    await assertFails(move(sami(), 'sami'));
    await assertFails(move(rami(), 'sami'));
  });

  it('not a cancelled or done booking', async () => {
    await setStatus(karim(), 'done');
    await assertFails(move(owner(), 'sami'));
  });

  it('the new barber manages it afterwards, the old one no longer', async () => {
    await move(owner(), 'sami');
    await assertSucceeds(setStatus(sami(), 'done'));
    await assertFails(setStatus(karim(), 'no-show'));
  });
});

describe('shop settings', () => {
  const saveShop = (db: Firestore, change: Partial<ShopSettings> = {}, extra: Record<string, unknown> = {}) =>
    setDoc(doc(db, 'settings', 'shop'), { ...toShopDoc({ ...SHOP, ...change }), updatedAt: serverTimestamp(), ...extra });

  it('only the owner can save them', async () => {
    await assertSucceeds(saveShop(owner()));
    await assertFails(saveShop(karim()));
    await assertFails(saveShop(rami()));
    await assertFails(saveShop(stranger()));
    await assertFails(saveShop(ownerViaGoogle()));
  });

  it('the shop name must be trimmed, 2 to 40 characters', async () => {
    await assertSucceeds(saveShop(owner(), { shopName: 'Sa' }));
    await assertSucceeds(saveShop(owner(), { shopName: 'x'.repeat(40) }));
    await assertFails(saveShop(owner(), { shopName: 'S' }));
    await assertFails(saveShop(owner(), { shopName: 'x'.repeat(41) }));
    await assertFails(saveShop(owner(), {}, { shopName: ' Sassine ' }));
  });

  it('the WhatsApp number is empty or a Lebanese mobile', async () => {
    await assertSucceeds(saveShop(owner(), { whatsapp: '' }));
    await assertFails(saveShop(owner(), { whatsapp: '+33612345678' }));
  });

  it('opening hours: 7 days, on the grid, closing after opening', async () => {
    const hours = (i: number, h: Partial<ShopSettings['openingHours'][number]>) =>
      SHOP.openingHours.map((d, j) => (j === i ? { ...d, ...h } : d));
    await assertFails(saveShop(owner(), { openingHours: hours(2, { start: '20:00', end: '10:00' }) }));
    await assertFails(saveShop(owner(), { openingHours: hours(2, { start: '10:10' }) }));
    await assertFails(saveShop(owner(), { openingHours: SHOP.openingHours.slice(0, 6) }));
    await assertSucceeds(saveShop(owner(), { openingHours: hours(6, { closed: true }) }));
  });

  it('special periods are also saved as a small day map for the booking rule', async () => {
    const period = { name: 'Eid', start: TODAY, end: addDays(TODAY, 89), daysAhead: 10 };
    await assertSucceeds(saveShop(owner(), { specialPeriods: [period] }));
    const huge = Object.fromEntries(Array.from({ length: 361 }, (_, i) => [String(20000 + i), 10]));
    await assertFails(saveShop(owner(), {}, { periodDays: huge }));
    await assertFails(saveShop(owner(), {}, { periodDays: [] }));
  });

  it('the Maps link must be https, and nothing unknown may be added', async () => {
    await assertFails(saveShop(owner(), { mapsUrl: 'javascript:alert(1)' }));
    await assertFails(saveShop(owner(), {}, { barberName: 'Eddy' }));
    await assertFails(saveShop(owner(), {}, { updatedAt: Timestamp.now() }));
  });
});

describe('branding (shop logo and colors)', () => {
  const saveBranding = (db: Firestore, change: Record<string, unknown> = {}) =>
    setDoc(doc(db, 'settings', 'branding'), {
      logo: 'data:image/webp;base64,UklGRiQAAABXRUJQ',
      colors: { ...DEFAULT_COLORS },
      updatedAt: serverTimestamp(),
      ...change,
    });

  it('only the owner can change the logo and colors', async () => {
    await assertSucceeds(saveBranding(owner()));
    await assertFails(saveBranding(karim()));
    await assertFails(saveBranding(rami()));
    await assertFails(saveBranding(stranger()));
  });

  it('the logo can be removed (shop name only)', async () => {
    await assertSucceeds(saveBranding(owner(), { logo: null }));
  });

  it('a logo up to 140,000 characters is accepted, a bigger one refused', async () => {
    const prefix = 'data:image/png;base64,';
    await assertSucceeds(saveBranding(owner(), { logo: prefix + 'A'.repeat(140_000 - prefix.length) }));
    await assertFails(saveBranding(owner(), { logo: prefix + 'A'.repeat(140_001 - prefix.length) }));
  });

  it('only WebP, JPEG or PNG data URLs: no SVG, no links, nothing else', async () => {
    await assertSucceeds(saveBranding(owner(), { logo: 'data:image/jpeg;base64,/9j/4AAQ' }));
    await assertFails(saveBranding(owner(), { logo: 'data:image/svg+xml;base64,PHN2Zz4=' }));
    await assertFails(saveBranding(owner(), { logo: 'https://example.com/logo.png' }));
    await assertFails(saveBranding(owner(), { logo: 'data:image/png;base64,<script>' }));
    await assertFails(saveBranding(owner(), { logo: 42 }));
  });

  it('colors must be #RRGGBB, all three, nothing more', async () => {
    await assertFails(saveBranding(owner(), { colors: { ...DEFAULT_COLORS, dark: 'black' } }));
    await assertFails(saveBranding(owner(), { colors: { dark: '#000000', accent: '#000000' } }));
    await assertFails(saveBranding(owner(), { colors: { ...DEFAULT_COLORS, extra: '#000000' } }));
    await assertFails(saveBranding(owner(), { note: 'x' }));
  });
});

describe('barbers', () => {
  const saveBarber = (db: Firestore, barber: Barber, extra: Record<string, unknown> = {}) =>
    setDoc(doc(db, 'barbers', barber.id), { ...toBarberDoc(barber), updatedAt: serverTimestamp(), ...extra });
  const NEW = makeBarber('omar', 'Omar', 3);

  it('only the owner can add a barber', async () => {
    await assertSucceeds(saveBarber(owner(), NEW));
    await assertFails(saveBarber(karim(), { ...NEW, id: 'omar2' }));
    await assertFails(saveBarber(rami(), { ...NEW, id: 'omar3' }));
  });

  it('barber IDs are lower-case slugs, names 2 to 30 characters', async () => {
    await assertFails(saveBarber(owner(), { ...NEW, id: 'Omar' }));
    await assertFails(saveBarber(owner(), { ...NEW, id: 'om_ar' }));
    await assertFails(saveBarber(owner(), { ...NEW, name: 'O' }));
    await assertFails(saveBarber(owner(), { ...NEW, name: 'x'.repeat(31) }));
  });

  it('a barber can change his own hours, breaks and days off', async () => {
    const hours = hoursWith(BARBERS.karim, TOMORROW, {
      start: '12:00',
      breaks: [{ start: '13:00', end: '13:30' }, { start: '17:00', end: '17:15' }],
    });
    await assertSucceeds(saveBarber(karim(), { ...BARBERS.karim, weeklyHours: hours }));
    await assertSucceeds(saveBarber(karim(), { ...BARBERS.karim, daysOff: [TOMORROW] }));
  });

  it('but not his name, active flag or order, nor another barber\'s anything', async () => {
    await assertFails(saveBarber(karim(), { ...BARBERS.karim, name: 'King Karim' }));
    await assertFails(saveBarber(karim(), { ...BARBERS.karim, active: false }));
    await assertFails(saveBarber(karim(), { ...BARBERS.karim, order: 0 }));
    await assertFails(saveBarber(karim(), { ...BARBERS.sami, daysOff: [TOMORROW] }));
  });

  it('the owner can change any barber, including deactivating him', async () => {
    await assertSucceeds(saveBarber(owner(), { ...BARBERS.karim, name: 'Karim H.', order: 5 }));
    await assertSucceeds(saveBarber(owner(), { ...BARBERS.sami, active: false }));
  });

  it("hours can't go outside the shop's opening hours, for barbers or the owner", async () => {
    const early = hoursWith(BARBERS.karim, TOMORROW, { start: '09:00' });
    const late = hoursWith(BARBERS.karim, TOMORROW, { end: '20:15' });
    await assertFails(saveBarber(karim(), { ...BARBERS.karim, weeklyHours: early }));
    await assertFails(saveBarber(karim(), { ...BARBERS.karim, weeklyHours: late }));
    await assertFails(saveBarber(owner(), { ...BARBERS.karim, weeklyHours: early }));
  });

  it("can't work a weekday the shop is closed", async () => {
    const day = weekdayIndex(TOMORROW);
    await seedShop({ openingHours: SHOP.openingHours.map((d, i) => (i === day ? { ...d, closed: true } : d)) });
    await assertFails(saveBarber(karim(), { ...BARBERS.karim, daysOff: [] , weeklyHours: hoursWith(BARBERS.karim, TOMORROW, { start: '11:00' }) }));
    await assertSucceeds(saveBarber(karim(), { ...BARBERS.karim, weeklyHours: hoursWith(BARBERS.karim, TOMORROW, { closed: true }) }));
  });

  it("after the shop's hours shrink, the owner can still deactivate a barber who sticks out", async () => {
    await seedShop({ openingHours: SHOP.openingHours.map((d) => ({ ...d, end: '18:00' })) });
    await assertSucceeds(saveBarber(owner(), { ...BARBERS.karim, active: false }));
    await assertFails(saveBarber(karim(), { ...BARBERS.karim, daysOff: [TOMORROW], weeklyHours: hoursWith(BARBERS.karim, TOMORROW, { start: '11:00' }) }));
  });

  it('every day of the week is checked, not just the first', async () => {
    const sunday = BARBERS.karim.weeklyHours.map((d, i) => (i === 6 ? { ...d, end: '21:00' } : d));
    await assertFails(saveBarber(owner(), { ...NEW, weeklyHours: sunday }));
    await assertFails(saveBarber(karim(), { ...BARBERS.karim, weeklyHours: sunday }));
  });

  it('breaks: at most 2 a day; hours on the 15-min grid', async () => {
    const three = hoursWith(BARBERS.karim, TOMORROW, {
      breaks: [{ start: '11:00', end: '11:15' }, { start: '12:00', end: '12:15' }, { start: '13:00', end: '13:15' }],
    });
    await assertFails(saveBarber(karim(), { ...BARBERS.karim, weeklyHours: three }));
    await assertFails(saveBarber(karim(), { ...BARBERS.karim, weeklyHours: hoursWith(BARBERS.karim, TOMORROW, { start: '10:05' }) }));
  });

  it('a deactivated login or a stranger can\'t change anything; barbers are never deleted', async () => {
    await seedStaff(KARIM, { active: false });
    await assertFails(saveBarber(karim(), { ...BARBERS.karim, daysOff: [TOMORROW] }));
    await assertFails(saveBarber(stranger(), { ...BARBERS.karim, daysOff: [TOMORROW] }));
    await assertFails(deleteDoc(doc(owner(), 'barbers', 'karim')));
  });
});

describe('staff logins', () => {
  const OMAR = { uid: 'omar-uid', username: 'omar', barberId: 'karim' };

  /** The owner's "create login": staff doc + username doc in one write. */
  function createLogin(
    db: Firestore,
    o: { uid?: string; username?: string; barberId?: string; role?: string; email?: string; skipUsername?: boolean } = {},
  ) {
    const uid = o.uid ?? OMAR.uid;
    const username = o.username ?? OMAR.username;
    const batch = writeBatch(db);
    batch.set(doc(db, 'staff', uid), {
      username,
      barberId: o.barberId ?? OMAR.barberId,
      role: o.role ?? 'barber',
      active: true,
      createdAt: serverTimestamp(),
    });
    if (!o.skipUsername) {
      batch.set(doc(db, 'usernames', username), { uid, email: o.email ?? loginEmail(username, 'x9y8') });
    }
    return batch.commit();
  }

  /** "New login" for Karim: old login off, new login, username moved, in one write. */
  function newLogin(db: Firestore, o: { deactivateOld?: boolean; barberId?: string } = {}) {
    const batch = writeBatch(db);
    if (o.deactivateOld !== false) batch.update(doc(db, 'staff', KARIM.uid), { active: false });
    batch.set(doc(db, 'staff', 'karim-uid-2'), {
      username: 'karim',
      barberId: o.barberId ?? 'karim',
      role: 'barber',
      active: true,
      createdAt: serverTimestamp(),
    });
    batch.set(doc(db, 'usernames', 'karim'), { uid: 'karim-uid-2', email: loginEmail('karim', 'q7w2') });
    return batch.commit();
  }

  it('the owner creates a barber login (staff doc + username together)', async () => {
    await assertSucceeds(createLogin(owner()));
    await assertSucceeds(getDoc(doc(staffUser(OMAR), 'staff', OMAR.uid)));
  });

  it('never a second owner', async () => {
    await assertFails(createLogin(owner(), { role: 'owner' }));
  });

  it('the username doc must come with it, match it, and use the internal email', async () => {
    await assertFails(createLogin(owner(), { skipUsername: true }));
    await assertFails(createLogin(owner(), { email: 'omar@gmail.com' }));
    await assertFails(createLogin(owner(), { email: loginEmail('karim', 'x9y8') }));
    await assertFails(createLogin(owner(), { username: 'Omar!' }));
    await assertFails(createLogin(owner(), { barberId: 'nobody' }));
  });

  it("a taken username can't be reused for a new login", async () => {
    await assertFails(createLogin(owner(), { username: 'karim' }));
  });

  it('barbers, customers and strangers can\'t create logins or make themselves staff', async () => {
    await assertFails(createLogin(karim()));
    await assertFails(createLogin(rami()));
    await assertFails(createLogin(stranger(), { uid: 'stranger-uid', username: 'stranger' }));
  });

  it('the owner turns a barber login off and on, nothing else', async () => {
    await assertSucceeds(updateDoc(doc(owner(), 'staff', KARIM.uid), { active: false }));
    await assertSucceeds(updateDoc(doc(owner(), 'staff', KARIM.uid), { active: true }));
    await assertFails(updateDoc(doc(owner(), 'staff', KARIM.uid), { role: 'owner' }));
    await assertFails(updateDoc(doc(owner(), 'staff', KARIM.uid), { barberId: 'sami' }));
  });

  it("the owner can't turn himself off or change his own role", async () => {
    await assertFails(updateDoc(doc(owner(), 'staff', OWNER.uid), { active: false }));
    await assertFails(updateDoc(doc(owner(), 'staff', OWNER.uid), { role: 'barber' }));
  });

  it("a barber can't turn logins on or off, even his own", async () => {
    await assertFails(updateDoc(doc(karim(), 'staff', SAMI.uid), { active: false }));
    await assertFails(updateDoc(doc(karim(), 'staff', KARIM.uid), { active: false }));
  });

  it('"New login" (forgotten password): same username, same barber, old login off', async () => {
    await assertSucceeds(newLogin(owner()));
    await assertFails(getDoc(doc(karim(), 'bookings', 'ZZZ999'))); // the old login is off
    await assertSucceeds(getDoc(doc(staffUser({ uid: 'karim-uid-2', username: 'karim' }), 'bookings', 'ZZZ999')));
  });

  it('"New login" is refused unless the old login is turned off, or for another barber', async () => {
    await assertFails(newLogin(owner(), { deactivateOld: false }));
    await assertFails(newLogin(owner(), { barberId: 'sami' }));
    await assertFails(newLogin(karim()));
  });

  it("an old login stays off once its username moved to a new one", async () => {
    await newLogin(owner());
    await assertFails(updateDoc(doc(owner(), 'staff', KARIM.uid), { active: true }));
  });

  it("the owner's own username can't be moved", async () => {
    await assertFails(
      setDoc(doc(owner(), 'usernames', 'sassine'), { uid: 'karim-uid', email: loginEmail('sassine') }),
    );
  });

  it('staff docs: everyone reads their own, the owner all, others nothing', async () => {
    await assertSucceeds(getDoc(doc(karim(), 'staff', KARIM.uid)));
    await assertFails(getDoc(doc(karim(), 'staff', SAMI.uid)));
    await assertFails(getDocs(collection(karim(), 'staff')));
    await assertSucceeds(getDocs(collection(owner(), 'staff')));
    await assertFails(getDoc(doc(rami(), 'staff', KARIM.uid)));
  });

  it("a deactivated login can still read its own staff doc (to say it's off)", async () => {
    await seedStaff(KARIM, { active: false });
    await assertSucceeds(getDoc(doc(karim(), 'staff', KARIM.uid)));
  });
});

describe('seats and customer profiles', () => {
  it("customers can't read the phone seats; the owner can", async () => {
    await seedBooking();
    await assertFails(getDoc(doc(rami(), 'phoneLimits', `${PHONE}_1`)));
    await assertSucceeds(getDoc(doc(owner(), 'phoneLimits', `${PHONE}_1`)));
    await assertFails(getDoc(doc(karim(), 'phoneLimits', `${PHONE}_1`)));
  });

  it('a customer reads only their own account seats', async () => {
    await assertSucceeds(getDoc(doc(rami(), 'userLimits', `${RAMI.uid}_1`)));
    await assertFails(getDoc(doc(rami(), 'userLimits', `${SARA.uid}_1`)));
  });

  it('a seat can only be taken for a booking made in the same write', async () => {
    await seedBooking();
    await assertFails(
      setDoc(doc(sara(), 'userLimits', `${SARA.uid}_1`), { bookingId: 'ABC234', startAt: startAt(TOMORROW, '11:00') }),
    );
  });

  it('customers save their own profile; the owner reads it, barbers don\'t', async () => {
    const save = (db: Firestore, uid: string) =>
      setDoc(doc(db, 'customers', uid), { name: 'Rami', phone: PHONE, updatedAt: serverTimestamp() });
    await assertSucceeds(save(rami(), RAMI.uid));
    await assertFails(save(rami(), SARA.uid));
    await assertSucceeds(getDoc(doc(owner(), 'customers', RAMI.uid)));
    await assertFails(getDoc(doc(karim(), 'customers', RAMI.uid)));
    await assertFails(getDoc(doc(sara(), 'customers', RAMI.uid)));
  });
});

describe('rules evaluation limits', () => {
  // Measured: 44 p() (about 350 expressions) fit on top of the heaviest booking and 45 don't, so
  // it uses roughly 650 of the 1000. 40 keeps about 30% spare: a change that adds work to
  // customer bookings must keep these passing.
  const SPARE_PADDING = 40;
  // The booking reads 5 documents, so 5 more still fit in the per-write limit of 10.
  const SPARE_READS = 5;

  // Firestore stops evaluating a write after 1000 expressions, and a document write may read at
  // most 10 documents (get, getAfter, exists); this is the most work a valid customer booking
  // makes the rules do.
  async function heaviestBooking() {
    const date = addDays(TODAY, 5);
    const color = { id: 's-color', name: 'Color', durationMinutes: 60 };
    // On today, but too short to reach `date`: every check of each runs before the last one passes.
    const short = { name: 'Short', start: addDays(TODAY, -3), end: addDays(TODAY, 3), daysAhead: 2 };
    // A year of past dates (never cleaned up) and 60 upcoming: `in` costs the same either way.
    const manyDates = Array.from({ length: 435 }, (_, i) => addDays(TODAY, -365 + i)).filter(
      (d) => d < TODAY || d >= addDays(TODAY, 10),
    );
    await seedShop({
      services: [...SHOP.services, color],
      bookingWindowDays: 1,
      specialPeriods: [short, short, short, { name: 'Now', start: TODAY, end: TODAY, daysAhead: 10 }],
      closedDays: manyDates,
    });
    await seedBarber({
      ...BARBERS.karim,
      weeklyHours: hoursWith(BARBERS.karim, date, {
        breaks: [
          { start: '12:00', end: '12:30' },
          { start: '14:00', end: '15:00' },
        ],
      }),
      daysOff: manyDates,
    });
    // A busy day, and the customer's first seats in use, so the second ones are checked.
    await seedBooking({ code: 'AAA222', time: '10:00', seat: 1, accountSeat: 1 });
    await seedBooking({ code: 'BBB333', date, time: '10:00', customer: SARA, phone: OTHER_PHONE });
    await block(karim(), 'karim', ['18:00', '18:15', '18:30'], { date });
    return book(rami(), { code: 'CCC444', date, service: color, time: '16:00', seat: 2, accountSeat: 2, anyBarber: true });
  }

  /** firestore.rules with `extra` checked first in every customer booking, after `functions`. */
  function rulesWithExtra(extra: string, functions = '') {
    const start = '      return b.serviceId in s.services';
    if (!RULES.includes(start)) throw new Error('customerBookingAllowed changed; update this test');
    return RULES.replace(start, `      return ${extra} && b.serviceId in s.services`).replace(
      '    function customerBookingAllowed',
      `${functions}\n    function customerBookingAllowed`,
    );
  }

  // Padding: p() costs about 8 expressions (about 125 of them fit in 1000), g() is 10 of them.
  const PADDING = `
    function p() { return 1 + 1 == 2; }
    function g() { return ${Array(10).fill('p()').join(' && ')}; }`;
  const padding = (k: number) =>
    [...Array(Math.floor(k / 10)).fill('g()'), ...Array(k % 10).fill('p()')].join(' && ');

  /** `n` extra document reads (of documents that don't exist, which still count). */
  const reads = (n: number) =>
    Array.from({ length: n }, (_, i) => `!exists(/databases/$(database)/documents/pad/p${i})`).join(' && ');

  it('the heaviest valid booking still fits within the rules evaluation limit', async () => {
    await assertSucceeds(heaviestBooking());
  });

  it('the heaviest valid booking leaves about 30% of the expression limit spare', async () => {
    await withRules(rulesWithExtra(padding(SPARE_PADDING), PADDING), async () => {
      await assertSucceeds(heaviestBooking());
    });
  });

  it('(the emulator does enforce the expression limit, so the test above means something)', async () => {
    const rules = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
${PADDING}
    match /x/{id} { allow get: if ${padding(110)}; }
    match /y/{id} { allow get: if ${padding(140)}; }
  }
}`;
    await withRules(rules, async () => {
      await assertSucceeds(getDoc(doc(anyone(), 'x', 'a')));
      await assertFails(getDoc(doc(anyone(), 'y', 'a')));
    });
  });

  // A batch may read 20 documents in all, which the emulator checks (12 extra here fail).
  // Production also caps each document write at 10, which the emulator doesn't check: the booking
  // itself reads exactly 5 (settings/shop, the barber, his day, its phone seat, its account seat),
  // fixed by the rules' shape rather than by data. Adding more than 5 reads would break bookings.
  it('the heaviest valid booking leaves room in the batch document-read limit', async () => {
    await withRules(rulesWithExtra(reads(SPARE_READS)), async () => {
      await assertSucceeds(heaviestBooking());
    });
  });
});

describe('rules evaluation limits for staff writes', () => {
  // Same padding as above: each p() is about 8 expressions, so 25 of them are about 20% of 1000.
  const PADDING = `
    function p() { return 1 + 1 == 2; }
    function g() { return ${Array(10).fill('p()').join(' && ')}; }`;
  const SPARE = 'g() && g() && p() && p() && p() && p() && p()';

  /** firestore.rules with SPARE checked first in the rule that starts with `marker`. */
  function withSpare(marker: string, prefix: string) {
    if (RULES.split(marker).length !== 2) throw new Error(`"${marker}" changed; update this test`);
    return RULES.replace(marker, marker.replace(prefix, `${prefix}${SPARE} && `)).replace(
      '    function isCustomer',
      `${PADDING}\n    function isCustomer`,
    );
  }

  it('saving the fullest shop settings leaves about 20% spare', async () => {
    const periods = [0, 1, 2, 3].map((i) => ({
      name: `Period ${i}`,
      start: addDays(TODAY, i * 100),
      end: addDays(TODAY, i * 100 + 89),
      daysAhead: 30,
    }));
    const rules = withSpare("      allow create, update: if isOwner() && (", 'if ');
    await withRules(rules, () =>
      assertSucceeds(
        setDoc(doc(owner(), 'settings', 'shop'), {
          ...toShopDoc({
            ...SHOP,
            specialPeriods: periods,
            closedDays: Array.from({ length: 200 }, (_, i) => addDays(TODAY, i)),
            shopAddress: 'x'.repeat(200),
            mapsUrl: `https://maps.app.goo.gl/${'x'.repeat(400)}`,
          }),
          updatedAt: serverTimestamp(),
        }),
      ),
    );
  });

  it('adding a barber who works every day, with 2 breaks, leaves about 20% spare', async () => {
    const busy = makeBarber('omar', 'Omar', 3);
    busy.weeklyHours = busy.weeklyHours.map((d) => ({
      ...d,
      breaks: [
        { start: '12:00', end: '12:30' },
        { start: '14:00', end: '15:00' },
      ],
    }));
    const rules = withSpare('      allow create: if isOwner() && validBarberId(barberId)', 'if ');
    await withRules(rules, () =>
      assertSucceeds(
        setDoc(doc(owner(), 'barbers', 'omar'), { ...toBarberDoc(busy), updatedAt: serverTimestamp() }),
      ),
    );
  });

  it('a 60-minute move (both day docs and the booking) leaves about 20% spare', async () => {
    const color = { id: 's-color', name: 'Color', durationMinutes: 60 };
    await seedShop({ services: [...SHOP.services, color] });
    await seedBooking({ service: color });
    const times = slotsNeeded('11:00', 60);
    for (const marker of [
      "      return after.keys().hasAll(['barberId', 'date', 'booked', 'blocked'])",
      '      allow update: if validStatusUpdate(bookingId) || validCancel(bookingId) || validMove(bookingId);',
    ]) {
      await withRules(withSpare(marker, marker.startsWith('      return') ? 'return ' : 'if '), async () => {
        await assertSucceeds(move(owner(), 'sami', { times }));
        await move(owner(), 'karim', { from: 'sami', times }); // back, for the next marker
      });
    }
  });
});

describe('everything else', () => {
  it('is denied', async () => {
    await assertFails(getDoc(doc(anyone(), 'anything', 'x')));
    await assertFails(getDoc(doc(owner(), 'anything', 'x')));
    await assertFails(setDoc(doc(owner(), 'anything', 'x'), { a: 1 }));
    await assertFails(getDoc(doc(anyone(), 'slots', `${TOMORROW}_1100`)));
  });
});
