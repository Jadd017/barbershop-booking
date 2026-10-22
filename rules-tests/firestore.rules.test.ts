/**
 * Tests for firestore.rules against the Firestore emulator.
 * Run with `npm run test:rules` (needs Java 21+ for the emulator).
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
import { ADMIN_UID, SHOP_TIME_ZONE } from '../src/config';
import { weekdayIndex } from '../src/lib/schedule';
import { DEFAULT_SETTINGS, toSettingsDoc } from '../src/lib/settingsDoc';
import { slotsNeeded } from '../src/lib/slots';
import { addDays, zonedInstant } from '../src/lib/time';
import type { DayHours, Settings } from '../src/types';

const SERVICES = {
  beard: { id: 'beard', name: 'Beard', durationMinutes: 15 },
  haircut: { id: 'haircut', name: 'Haircut', durationMinutes: 30 },
  haircutBeard: { id: 'haircut-beard', name: 'Haircut + Beard', durationMinutes: 45 },
};
type ServiceInfo = (typeof SERVICES)[keyof typeof SERVICES];

const PHONE = '+96170123456';
const OTHER_PHONE = '+9613123456';

/** Google customers. */
const RAMI = { uid: 'rami-uid', email: 'rami@gmail.com' };
const SARA = { uid: 'sara-uid', email: 'sara@gmail.com' };
const NADIM = { uid: 'nadim-uid', email: 'nadim@gmail.com' };
type CustomerInfo = typeof RAMI;

/** Today's date in Beirut, whatever time zone the tests run in. */
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: SHOP_TIME_ZONE }).format(new Date());
const TOMORROW = addDays(TODAY, 1);

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
  // Every day 10:00–20:00, break 14:00–15:00; Haircut 30, Beard 15, Haircut + Beard 45; 4 days ahead.
  await seedSettings();
});

/** Puts settings/shop in the database (the defaults plus `change`), bypassing the rules. */
function seedSettings(change: Partial<Settings> = {}) {
  return env.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore() as unknown as Firestore, 'settings', 'shop'), {
      ...toSettingsDoc({ ...DEFAULT_SETTINGS, ...change }),
      updatedAt: Timestamp.now(),
    }),
  );
}

/** The default weekly hours with `date`'s weekday replaced by `hours`. */
function hoursWith(date: string, hours: Partial<DayHours>): DayHours[] {
  return DEFAULT_SETTINGS.weeklyHours.map((d, i) => (i === weekdayIndex(date) ? { ...d, ...hours } : d));
}

// The contexts return compat instances; the modular functions accept them at runtime.
const anyone = () => env.unauthenticatedContext().firestore() as unknown as Firestore;
const admin = () =>
  env
    .authenticatedContext(ADMIN_UID, { email: 'eddy@example.com', firebase: { sign_in_provider: 'password' } })
    .firestore() as unknown as Firestore;
/** Signed in with Google, as customers are. */
const signedIn = (c: CustomerInfo) =>
  env
    .authenticatedContext(c.uid, { email: c.email, firebase: { sign_in_provider: 'google.com' } })
    .firestore() as unknown as Firestore;
const rami = () => signedIn(RAMI);
const sara = () => signedIn(SARA);
/** Someone who made an email/password account (not Eddy, not Google). */
const passwordUser = () =>
  env
    .authenticatedContext(RAMI.uid, { email: RAMI.email, firebase: { sign_in_provider: 'password' } })
    .firestore() as unknown as Firestore;

function slotId(date: string, time: string) {
  return `${date}_${time.replace(':', '')}`;
}

function startAt(date: string, time: string) {
  return Timestamp.fromDate(zonedInstant(date, time, SHOP_TIME_ZONE));
}

interface BookingOptions {
  code?: string;
  phone?: string | null;
  /** Whose booking it is; null for a walk-in. */
  customer?: CustomerInfo | null;
  service?: ServiceInfo;
  date?: string;
  time?: string;
  /** Phone seat to take (1 or 2), or null for none. */
  seat?: 1 | 2 | null;
  /** Account seat to take (1 or 2), or null for none. */
  accountSeat?: 1 | 2 | null;
  /** Slot times to write; defaults to every slot the service needs. */
  slots?: string[];
  /** Fields to override or add on the booking doc. */
  fields?: Record<string, unknown>;
}

function bookingFields(o: BookingOptions = {}) {
  const service = o.service ?? SERVICES.haircut;
  const date = o.date ?? TOMORROW;
  const time = o.time ?? '11:00';
  const customer = o.customer === undefined ? RAMI : o.customer;
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
    customerUid: customer?.uid ?? null,
    customerEmail: customer?.email ?? null,
    ...o.fields,
  };
}

/** The seat docs a booking takes: [collection, id] pairs. */
function seatsOf(o: BookingOptions, fields: ReturnType<typeof bookingFields>) {
  const seat = o.seat === undefined ? 1 : o.seat;
  const accountSeat = o.accountSeat === undefined ? 1 : o.accountSeat;
  const seats: [string, string][] = [];
  if (seat !== null) seats.push(['phoneLimits', `${fields.phone}_${seat}`]);
  if (accountSeat !== null && fields.customerUid) {
    seats.push(['userLimits', `${fields.customerUid}_${accountSeat}`]);
  }
  return seats;
}

/** Writes a booking the way the site does: booking + slots + seats in one atomic write. */
function book(db: Firestore, o: BookingOptions = {}) {
  const fields = bookingFields(o);
  const code = o.code ?? 'ABC234';
  const slots = o.slots ?? slotsNeeded(fields.startTime, fields.durationMinutes);

  const batch = writeBatch(db);
  batch.set(doc(db, 'bookings', code), fields);
  for (const time of slots) {
    batch.set(doc(db, 'slots', slotId(fields.date, time)), { bookingId: code, date: fields.date });
  }
  for (const [col, id] of seatsOf(o, fields)) {
    batch.set(doc(db, col, id), { bookingId: code, startAt: fields.startAt });
  }
  return batch.commit();
}

/** Puts a booking (with its slots and seats) in the database, bypassing the rules. */
async function seed(o: BookingOptions & { status?: string } = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    const fields = bookingFields(o);
    if (o.status) fields.status = o.status;
    const code = o.code ?? 'ABC234';
    await setDoc(doc(db, 'bookings', code), { ...fields, createdAt: Timestamp.now() });
    for (const time of slotsNeeded(fields.startTime, fields.durationMinutes)) {
      await setDoc(doc(db, 'slots', slotId(fields.date, time)), {
        bookingId: code,
        date: fields.date,
      });
    }
    for (const [col, id] of seatsOf(o, fields)) {
      await setDoc(doc(db, col, id), { bookingId: code, startAt: fields.startAt });
    }
  });
}

/** Cancels the way the site does: status + cancelledAt, and frees its slots, in one write. */
function cancel(
  db: Firestore,
  code = 'ABC234',
  slots = slotsNeeded('11:00', 30).map((t) => slotId(TOMORROW, t)),
  extra: Record<string, unknown> = {},
) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'bookings', code), {
    status: 'cancelled',
    cancelledAt: serverTimestamp(),
    ...extra,
  });
  for (const id of slots) batch.delete(doc(db, 'slots', id));
  return batch.commit();
}

const myBookings = (db: Firestore, uid: string) =>
  getDocs(query(collection(db, 'bookings'), where('customerUid', '==', uid)));

describe('reading bookings', () => {
  it('a customer can get their own booking', async () => {
    await seed();
    await assertSucceeds(getDoc(doc(rami(), 'bookings', 'ABC234')));
  });

  it("a customer cannot get someone else's booking, even with its code", async () => {
    await seed();
    await assertFails(getDoc(doc(sara(), 'bookings', 'ABC234')));
  });

  it('nobody signed out can get a booking by its code', async () => {
    await seed();
    await assertFails(getDoc(doc(anyone(), 'bookings', 'ABC234')));
  });

  it("nobody but Eddy can get a walk-in, or an older booking that has no customerUid", async () => {
    await seed({ customer: null, seat: null });
    await assertFails(getDoc(doc(rami(), 'bookings', 'ABC234')));
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore() as unknown as Firestore;
      const { customerUid: _uid, customerEmail: _email, ...old } = bookingFields({ code: 'OLD234' });
      await setDoc(doc(db, 'bookings', 'OLD234'), { ...old, createdAt: Timestamp.now() });
    });
    await assertFails(getDoc(doc(rami(), 'bookings', 'OLD234')));
    await assertSucceeds(getDoc(doc(admin(), 'bookings', 'OLD234')));
  });

  it('a customer can check that a code is unused', async () => {
    await assertSucceeds(getDoc(doc(rami(), 'bookings', 'ZZZ999')));
  });

  it('a customer can list their own bookings', async () => {
    await seed();
    await seed({ code: 'DEF345', time: '12:00', customer: SARA, phone: OTHER_PHONE });
    await assertSucceeds(myBookings(rami(), RAMI.uid));
  });

  it("a customer cannot list someone else's bookings", async () => {
    await seed({ customer: SARA });
    await assertFails(myBookings(rami(), SARA.uid));
  });

  it('a customer cannot list all bookings', async () => {
    await seed();
    await assertFails(getDocs(collection(rami(), 'bookings')));
    await assertFails(getDocs(collection(anyone(), 'bookings')));
  });

  it("a customer cannot query a day's bookings", async () => {
    await seed();
    await assertFails(getDocs(query(collection(rami(), 'bookings'), where('date', '==', TOMORROW))));
  });

  it('an email/password user who is not Eddy cannot read bookings, even with the same UID', async () => {
    await seed();
    await assertFails(getDoc(doc(passwordUser(), 'bookings', 'ABC234')));
    await assertFails(myBookings(passwordUser(), RAMI.uid));
  });

  it("Eddy can list a day's bookings", async () => {
    await seed();
    await assertSucceeds(getDocs(query(collection(admin(), 'bookings'), where('date', '==', TOMORROW))));
  });
});

describe('creating bookings', () => {
  it('a valid booking with its slots, a phone seat and an account seat is allowed', async () => {
    await assertSucceeds(book(rami()));
  });

  it('refused when not signed in', async () => {
    await assertFails(book(anyone(), { customer: null, accountSeat: null }));
  });

  it('refused when signed in with email/password instead of Google', async () => {
    await assertFails(book(passwordUser()));
  });

  it("refused with someone else's UID or email", async () => {
    await assertFails(book(sara()));
    await assertFails(book(rami(), { fields: { customerEmail: 'other@gmail.com' } }));
    await assertFails(book(rami(), { fields: { customerUid: null } }));
  });

  it('works for every service length', async () => {
    await assertSucceeds(book(rami(), { service: SERVICES.beard, time: '10:00' }));
    await assertSucceeds(
      book(rami(), {
        code: 'DEF345',
        service: SERVICES.haircutBeard,
        time: '12:00',
        seat: 2,
        accountSeat: 2,
      }),
    );
  });

  it('allowed on the last day the page offers', async () => {
    await assertSucceeds(book(rami(), { date: addDays(TODAY, 3) }));
  });

  it('refused without its slot docs', async () => {
    await assertFails(book(rami(), { slots: [] }));
  });

  it('refused when it claims only some of the slots it needs', async () => {
    await assertFails(book(rami(), { service: SERVICES.haircutBeard, slots: ['11:00', '11:15'] }));
  });

  it('refused when the slots are for a different time', async () => {
    await assertFails(book(rami(), { slots: ['12:00', '12:15'] }));
  });

  it('refused without taking a phone seat', async () => {
    await assertFails(book(rami(), { seat: null }));
  });

  it('refused without taking an account seat', async () => {
    await assertFails(book(rami(), { accountSeat: null }));
  });

  it('refused with a status other than "booked"', async () => {
    await assertFails(book(rami(), { fields: { status: 'done' } }));
  });

  it('refused with a name too short, too long, padded or not a string', async () => {
    await assertFails(book(rami(), { fields: { name: 'R' } }));
    await assertFails(book(rami(), { fields: { name: 'R'.repeat(51) } }));
    await assertFails(book(rami(), { fields: { name: ' Rami ' } }));
    await assertFails(book(rami(), { fields: { name: 42 } }));
  });

  it('allowed with a 50-character name', async () => {
    await assertSucceeds(book(rami(), { fields: { name: 'R'.repeat(50) } }));
  });

  it('refused with a phone that is not a Lebanese mobile number', async () => {
    await assertFails(book(rami(), { phone: '+96172123456' }));
    await assertFails(book(rami(), { phone: '70123456' }));
    await assertFails(book(rami(), { phone: null, seat: null }));
  });

  it('refused with a duration or name that does not match the service', async () => {
    await assertFails(book(rami(), { fields: { durationMinutes: 15 }, slots: ['11:00'] }));
    await assertFails(book(rami(), { fields: { serviceName: 'Free haircut' } }));
    await assertFails(book(rami(), { fields: { serviceId: 'massage' } }));
  });

  it('refused with an extra field', async () => {
    await assertFails(book(rami(), { fields: { paid: true } }));
  });

  it('refused with a made-up createdAt', async () => {
    await assertFails(book(rami(), { fields: { createdAt: Timestamp.now() } }));
  });

  it('refused off the 15-minute grid', async () => {
    await assertFails(book(rami(), { time: '11:05', slots: ['11:05', '11:20'] }));
  });

  it('refused in the past', async () => {
    await assertFails(book(rami(), { date: addDays(TODAY, -1) }));
    await assertFails(book(rami(), { date: TODAY, time: '00:00' }));
  });

  it('refused beyond the booking window', async () => {
    await assertFails(book(rami(), { date: addDays(TODAY, 4) }));
    await assertFails(book(rami(), { date: addDays(TODAY, 30) }));
  });

  it('refused when startAt does not match the date and time', async () => {
    const wrong = Timestamp.fromMillis(startAt(TOMORROW, '11:00').toMillis() - 5 * 3600_000);
    await assertFails(book(rami(), { fields: { startAt: wrong } }));
  });

  it('refused when the code and document ID differ', async () => {
    await assertFails(book(rami(), { fields: { bookingCode: 'XYZ789' } }));
  });

  it('refused to overwrite an existing booking', async () => {
    await seed({ customer: SARA, phone: OTHER_PHONE, time: '16:00' });
    await assertFails(book(rami(), { seat: 2, accountSeat: 2 }));
  });
});

describe('double booking', () => {
  it('refused for the exact same time', async () => {
    await seed({ phone: OTHER_PHONE, customer: SARA });
    await assertFails(book(rami(), { code: 'DEF345' }));
  });

  it('refused for an overlapping time', async () => {
    await seed({ phone: OTHER_PHONE, customer: SARA }); // 11:00–11:30
    await assertFails(book(rami(), { code: 'DEF345', time: '10:45' })); // 10:45–11:15
  });

  it('refused when trying to take over a slot without a new booking', async () => {
    await seed({ phone: OTHER_PHONE, customer: SARA });
    await assertFails(
      setDoc(doc(rami(), 'slots', slotId(TOMORROW, '11:00')), { bookingId: 'DEF345', date: TOMORROW }),
    );
  });

  it('refused to create a lone slot that blocks a time', async () => {
    await assertFails(
      setDoc(doc(rami(), 'slots', slotId(TOMORROW, '12:00')), { bookingId: 'NOPE22', date: TOMORROW }),
    );
  });

  it('refused to add a slot to an existing booking', async () => {
    await seed();
    await assertFails(
      setDoc(doc(rami(), 'slots', slotId(TOMORROW, '11:30')), { bookingId: 'ABC234', date: TOMORROW }),
    );
  });
});

describe('phone limit (2 upcoming bookings)', () => {
  // Different accounts with the same phone, so only the phone limit is in play.
  it('refuses a third upcoming booking for the same phone, on either seat', async () => {
    await seed({ code: 'AAA222', time: '10:00', seat: 1 });
    await seed({ code: 'BBB333', time: '12:00', seat: 2, customer: SARA });
    for (const seat of [1, 2] as const) {
      await assertFails(
        book(signedIn(NADIM), { code: 'CCC444', time: '16:00', seat, customer: NADIM }),
      );
    }
  });

  it('refuses inventing a third seat', async () => {
    await seed({ code: 'AAA222', time: '10:00', seat: 1 });
    await seed({ code: 'BBB333', time: '12:00', seat: 2, customer: SARA });
    const fields = bookingFields({ code: 'CCC444', time: '16:00', customer: SARA });
    const db = sara();
    const batch = writeBatch(db);
    batch.set(doc(db, 'bookings', 'CCC444'), fields);
    for (const t of ['16:00', '16:15']) {
      batch.set(doc(db, 'slots', slotId(TOMORROW, t)), { bookingId: 'CCC444', date: TOMORROW });
    }
    batch.set(doc(db, 'userLimits', `${SARA.uid}_2`), { bookingId: 'CCC444', startAt: fields.startAt });
    batch.set(doc(db, 'phoneLimits', `${PHONE}_3`), { bookingId: 'CCC444', startAt: fields.startAt });
    await assertFails(batch.commit());
  });

  it('allows a new booking once one is cancelled', async () => {
    await seed({ code: 'AAA222', time: '10:00', seat: 1, status: 'cancelled' });
    await seed({ code: 'BBB333', time: '12:00', seat: 2, customer: SARA });
    await assertSucceeds(book(rami(), { code: 'CCC444', time: '16:00', seat: 1, accountSeat: 1 }));
  });

  it('allows a new booking once an earlier appointment has started', async () => {
    await seed({ code: 'AAA222', date: TODAY, time: '00:00', seat: 1 });
    await seed({ code: 'BBB333', time: '12:00', seat: 2, customer: SARA });
    await assertSucceeds(book(rami(), { code: 'CCC444', time: '16:00', seat: 1, accountSeat: 1 }));
  });

  it('does not affect another phone', async () => {
    await seed({ code: 'AAA222', time: '10:00', seat: 1 });
    await seed({ code: 'BBB333', time: '12:00', seat: 2, customer: SARA });
    await assertSucceeds(
      book(sara(), { code: 'CCC444', time: '16:00', phone: OTHER_PHONE, customer: SARA, accountSeat: 2 }),
    );
  });

  it("refuses taking a seat of a phone that isn't the booking's", async () => {
    const fields = bookingFields({ code: 'CCC444' });
    const db = rami();
    const batch = writeBatch(db);
    batch.set(doc(db, 'bookings', 'CCC444'), fields);
    for (const t of ['11:00', '11:15']) {
      batch.set(doc(db, 'slots', slotId(TOMORROW, t)), { bookingId: 'CCC444', date: TOMORROW });
    }
    batch.set(doc(db, 'userLimits', `${RAMI.uid}_1`), { bookingId: 'CCC444', startAt: fields.startAt });
    batch.set(doc(db, 'phoneLimits', `${OTHER_PHONE}_1`), { bookingId: 'CCC444', startAt: fields.startAt });
    await assertFails(batch.commit());
  });

  it('nobody but Eddy can read the seats (they hold booking codes)', async () => {
    await seed();
    await assertFails(getDoc(doc(anyone(), 'phoneLimits', `${PHONE}_1`)));
    await assertFails(getDoc(doc(rami(), 'phoneLimits', `${PHONE}_1`)));
    await assertSucceeds(getDoc(doc(admin(), 'phoneLimits', `${PHONE}_1`)));
  });

  it('seats cannot be freed by hand', async () => {
    await seed();
    await assertFails(deleteDoc(doc(rami(), 'phoneLimits', `${PHONE}_1`)));
  });
});

describe('account limit (2 upcoming bookings per Google account)', () => {
  it('refuses a third upcoming booking, even with a different phone', async () => {
    await seed({ code: 'AAA222', time: '10:00', seat: 1, accountSeat: 1 });
    await seed({ code: 'BBB333', time: '12:00', seat: 2, accountSeat: 2 });
    for (const accountSeat of [1, 2] as const) {
      await assertFails(
        book(rami(), { code: 'CCC444', time: '16:00', phone: OTHER_PHONE, accountSeat }),
      );
    }
  });

  it('refuses inventing a third seat', async () => {
    await seed({ code: 'AAA222', time: '10:00', seat: 1, accountSeat: 1 });
    await seed({ code: 'BBB333', time: '12:00', seat: 2, accountSeat: 2 });
    const fields = bookingFields({ code: 'CCC444', time: '16:00', phone: OTHER_PHONE });
    const db = rami();
    const batch = writeBatch(db);
    batch.set(doc(db, 'bookings', 'CCC444'), fields);
    for (const t of ['16:00', '16:15']) {
      batch.set(doc(db, 'slots', slotId(TOMORROW, t)), { bookingId: 'CCC444', date: TOMORROW });
    }
    batch.set(doc(db, 'phoneLimits', `${OTHER_PHONE}_1`), { bookingId: 'CCC444', startAt: fields.startAt });
    batch.set(doc(db, 'userLimits', `${RAMI.uid}_3`), { bookingId: 'CCC444', startAt: fields.startAt });
    await assertFails(batch.commit());
  });

  it("refuses taking someone else's account seat", async () => {
    const fields = bookingFields({ code: 'CCC444' });
    const db = rami();
    const batch = writeBatch(db);
    batch.set(doc(db, 'bookings', 'CCC444'), fields);
    for (const t of ['11:00', '11:15']) {
      batch.set(doc(db, 'slots', slotId(TOMORROW, t)), { bookingId: 'CCC444', date: TOMORROW });
    }
    batch.set(doc(db, 'phoneLimits', `${PHONE}_1`), { bookingId: 'CCC444', startAt: fields.startAt });
    batch.set(doc(db, 'userLimits', `${SARA.uid}_1`), { bookingId: 'CCC444', startAt: fields.startAt });
    await assertFails(batch.commit());
  });

  it('allows a new booking once one is cancelled', async () => {
    await seed({ code: 'AAA222', time: '10:00', seat: 1, accountSeat: 1, status: 'cancelled' });
    await seed({ code: 'BBB333', time: '12:00', seat: 2, accountSeat: 2 });
    await assertSucceeds(book(rami(), { code: 'CCC444', time: '16:00', seat: 1, accountSeat: 1 }));
  });

  it('allows a new booking once an earlier appointment has started', async () => {
    await seed({ code: 'AAA222', date: TODAY, time: '00:00', seat: 1, accountSeat: 1 });
    await seed({ code: 'BBB333', time: '12:00', seat: 2, accountSeat: 2 });
    await assertSucceeds(book(rami(), { code: 'CCC444', time: '16:00', seat: 1, accountSeat: 1 }));
  });

  it('does not affect another account', async () => {
    await seed({ code: 'AAA222', time: '10:00', seat: 1, accountSeat: 1 });
    await seed({ code: 'BBB333', time: '12:00', seat: 2, accountSeat: 2 });
    await assertSucceeds(
      book(sara(), { code: 'CCC444', time: '16:00', phone: OTHER_PHONE, customer: SARA }),
    );
  });

  it('a customer can read only their own seats', async () => {
    await seed();
    await assertSucceeds(getDoc(doc(rami(), 'userLimits', `${RAMI.uid}_1`)));
    await assertSucceeds(getDoc(doc(rami(), 'userLimits', `${RAMI.uid}_2`)));
    await assertFails(getDoc(doc(sara(), 'userLimits', `${RAMI.uid}_1`)));
    await assertFails(getDoc(doc(anyone(), 'userLimits', `${RAMI.uid}_1`)));
    await assertFails(getDocs(collection(rami(), 'userLimits')));
    await assertSucceeds(getDoc(doc(admin(), 'userLimits', `${RAMI.uid}_1`)));
  });

  it('seats cannot be freed by hand', async () => {
    await seed();
    await assertFails(deleteDoc(doc(rami(), 'userLimits', `${RAMI.uid}_1`)));
    await assertFails(
      setDoc(doc(rami(), 'userLimits', `${RAMI.uid}_1`), { bookingId: 'NOPE22', startAt: Timestamp.now() }),
    );
  });
});

describe('cancelling', () => {
  it('a customer can cancel their own booking and free the slots', async () => {
    await seed();
    await assertSucceeds(cancel(rami()));
  });

  it("a customer cannot cancel someone else's booking", async () => {
    await seed();
    await assertFails(cancel(sara()));
  });

  it('refused when signed out, or signed in with email/password', async () => {
    await seed();
    await assertFails(cancel(anyone()));
    await assertFails(cancel(passwordUser()));
  });

  it('a customer cannot cancel a walk-in', async () => {
    await seed({ customer: null, seat: null });
    await assertFails(cancel(rami()));
  });

  it('refused without freeing the slots', async () => {
    await seed();
    await assertFails(cancel(rami(), 'ABC234', []));
  });

  it('refused when changing anything else too', async () => {
    await seed();
    await assertFails(cancel(rami(), undefined, undefined, { name: 'Someone else' }));
    await assertFails(cancel(rami(), undefined, undefined, { startTime: '12:00' }));
    await assertFails(cancel(rami(), undefined, undefined, { customerUid: SARA.uid }));
  });

  it('refused with a made-up cancelledAt', async () => {
    await seed();
    await assertFails(cancel(rami(), undefined, undefined, { cancelledAt: Timestamp.now() }));
  });

  it('refused once the appointment has started', async () => {
    await seed({ date: TODAY, time: '00:00' });
    await assertFails(cancel(rami(), 'ABC234', [slotId(TODAY, '00:00'), slotId(TODAY, '00:15')]));
  });

  it('refused for a booking that is already cancelled or done', async () => {
    await seed({ status: 'cancelled' });
    await assertFails(cancel(rami()));
    await seed({ code: 'DEF345', time: '12:00', status: 'done', accountSeat: 2, seat: 2 });
    await assertFails(cancel(rami(), 'DEF345', [slotId(TOMORROW, '12:00'), slotId(TOMORROW, '12:15')]));
  });

  it('a customer cannot mark a booking done, or edit their booking', async () => {
    await seed();
    await assertFails(updateDoc(doc(rami(), 'bookings', 'ABC234'), { status: 'done' }));
    await assertFails(updateDoc(doc(rami(), 'bookings', 'ABC234'), { name: 'Hacker' }));
    await assertFails(updateDoc(doc(rami(), 'bookings', 'ABC234'), { startTime: '12:00' }));
  });

  it("refused when freeing another booking's slot along with your own", async () => {
    await seed();
    await seed({ code: 'DEF345', time: '12:00', phone: OTHER_PHONE, customer: SARA });
    await assertFails(
      cancel(rami(), 'ABC234', [
        slotId(TOMORROW, '11:00'),
        slotId(TOMORROW, '11:15'),
        slotId(TOMORROW, '12:00'),
      ]),
    );
  });

  it('a slot cannot be deleted on its own', async () => {
    await seed();
    await assertFails(deleteDoc(doc(rami(), 'slots', slotId(TOMORROW, '11:00'))));
  });

  it('nobody can delete a booking, not even Eddy', async () => {
    await seed();
    await assertFails(deleteDoc(doc(rami(), 'bookings', 'ABC234')));
    await assertFails(deleteDoc(doc(admin(), 'bookings', 'ABC234')));
  });
});

describe('customer profiles (pre-filled name and phone)', () => {
  const profile = () => ({ name: 'Rami', phone: PHONE, updatedAt: serverTimestamp() });

  it('a customer can save and read their own', async () => {
    await assertSucceeds(setDoc(doc(rami(), 'customers', RAMI.uid), profile()));
    await assertSucceeds(getDoc(doc(rami(), 'customers', RAMI.uid)));
    await assertSucceeds(
      setDoc(doc(rami(), 'customers', RAMI.uid), { ...profile(), phone: OTHER_PHONE }),
    );
  });

  it("nobody else can read or write it, except Eddy reading", async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore() as unknown as Firestore, 'customers', RAMI.uid), {
        name: 'Rami',
        phone: PHONE,
        updatedAt: Timestamp.now(),
      }),
    );
    await assertFails(getDoc(doc(sara(), 'customers', RAMI.uid)));
    await assertFails(getDoc(doc(anyone(), 'customers', RAMI.uid)));
    await assertFails(getDoc(doc(passwordUser(), 'customers', RAMI.uid)));
    await assertFails(getDocs(collection(rami(), 'customers')));
    await assertFails(setDoc(doc(sara(), 'customers', RAMI.uid), profile()));
    await assertSucceeds(getDoc(doc(admin(), 'customers', RAMI.uid)));
  });

  it('refused with a bad name, phone, timestamp or extra field', async () => {
    const ref = () => doc(rami(), 'customers', RAMI.uid);
    await assertFails(setDoc(ref(), { ...profile(), name: 'R' }));
    await assertFails(setDoc(ref(), { ...profile(), phone: '70123456' }));
    await assertFails(setDoc(ref(), { ...profile(), updatedAt: Timestamp.now() }));
    await assertFails(setDoc(ref(), { ...profile(), email: 'x@gmail.com' }));
    await assertFails(setDoc(ref(), { name: 'Rami', phone: PHONE }));
  });
});

describe('slots', () => {
  it("anyone can read a day's taken slots", async () => {
    await seed();
    await assertSucceeds(getDocs(query(collection(anyone(), 'slots'), where('date', '==', TOMORROW))));
  });
});

describe('Eddy (admin)', () => {
  it('can mark a booking done or no-show, and undo it', async () => {
    await seed();
    const ref = () => doc(admin(), 'bookings', 'ABC234');
    await assertSucceeds(updateDoc(ref(), { status: 'done', statusChangedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(ref(), { status: 'no-show', statusChangedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(ref(), { status: 'booked', statusChangedAt: serverTimestamp() }));
  });

  it('a signed-in customer cannot', async () => {
    await seed();
    await assertFails(
      updateDoc(doc(rami(), 'bookings', 'ABC234'), { status: 'done', statusChangedAt: serverTimestamp() }),
    );
  });

  it('cannot move a booking (its slots would stay behind) or revive a cancelled one', async () => {
    await seed();
    await assertFails(updateDoc(doc(admin(), 'bookings', 'ABC234'), { startTime: '16:00' }));
    await assertFails(updateDoc(doc(admin(), 'bookings', 'ABC234'), { date: addDays(TODAY, 2) }));
    await assertFails(updateDoc(doc(admin(), 'bookings', 'ABC234'), { durationMinutes: 60 }));
    await seed({ code: 'DEF345', time: '16:00', status: 'cancelled', seat: 2, accountSeat: 2 });
    await assertFails(
      updateDoc(doc(admin(), 'bookings', 'DEF345'), { status: 'booked', statusChangedAt: serverTimestamp() }),
    );
  });

  it('can read any booking', async () => {
    await seed({ customer: SARA });
    await assertSucceeds(getDoc(doc(admin(), 'bookings', 'ABC234')));
  });

  it('can cancel any booking at any time', async () => {
    await seed({ date: TODAY, time: '00:00' });
    await assertSucceeds(cancel(admin(), 'ABC234', [slotId(TODAY, '00:00'), slotId(TODAY, '00:15')]));
  });

  it('can delete a slot', async () => {
    await seed();
    await assertSucceeds(deleteDoc(doc(admin(), 'slots', slotId(TOMORROW, '11:00'))));
  });

  it('cannot take over a booked slot', async () => {
    await seed();
    await assertFails(
      setDoc(doc(admin(), 'slots', slotId(TOMORROW, '11:00')), { bookingId: 'DEF345', date: TOMORROW }),
    );
  });
});

describe('Eddy walk-ins', () => {
  const walkIn = (o: BookingOptions = {}) =>
    book(admin(), { phone: null, customer: null, seat: null, ...o });

  it('can be added without a phone, a customer UID or any seat', async () => {
    await assertSucceeds(walkIn());
  });

  it('ignore the booking window', async () => {
    await assertSucceeds(walkIn({ date: addDays(TODAY, 4) }));
    await assertSucceeds(walkIn({ code: 'DEF345', date: addDays(TODAY, 60) }));
  });

  it('ignore the hours, closed days and days off', async () => {
    await seedSettings({ weeklyHours: hoursWith(TOMORROW, { closed: true }) });
    await assertSucceeds(walkIn());
    await seedSettings({ daysOff: [addDays(TODAY, 2)] });
    await assertSucceeds(walkIn({ code: 'DEF345', date: addDays(TODAY, 2), time: '21:00' }));
  });

  it('refused for the same or an overlapping time as a booking', async () => {
    await seed(); // 11:00–11:30
    await assertFails(walkIn({ code: 'DEF345' }));
    await assertFails(walkIn({ code: 'DEF345', time: '11:15' }));
    await assertFails(walkIn({ code: 'DEF345', time: '10:45', service: SERVICES.haircutBeard }));
  });

  it('refused for an overlapping time beyond the booking window too', async () => {
    const far = addDays(TODAY, 30);
    await assertSucceeds(walkIn({ date: far }));
    await assertFails(walkIn({ code: 'DEF345', date: far, time: '11:15', service: SERVICES.beard }));
  });

  it('refused without all of their slots', async () => {
    await assertFails(walkIn({ slots: [] }));
    await assertFails(walkIn({ service: SERVICES.haircutBeard, slots: ['11:00', '11:15'] }));
  });

  it('refused longer than 60 minutes or off the 15-minute grid', async () => {
    await assertFails(
      walkIn({
        fields: { durationMinutes: 75 },
        slots: ['11:00', '11:15', '11:30', '11:45', '12:00'],
      }),
    );
    await assertFails(walkIn({ time: '11:05', slots: ['11:05', '11:20'] }));
  });

  it('refused with a made-up createdAt or a status other than "booked"', async () => {
    await assertFails(walkIn({ fields: { createdAt: Timestamp.now() } }));
    await assertFails(walkIn({ fields: { status: 'done' } }));
  });
});

describe('settings', () => {
  const save = (db: Firestore, settings: Record<string, unknown>) =>
    setDoc(doc(db, 'settings', 'shop'), settings);
  const valid = (change: Partial<Settings> = {}) => ({
    ...toSettingsDoc({ ...DEFAULT_SETTINGS, ...change }),
    updatedAt: serverTimestamp(),
  });

  it('anyone can read them, signed in or not', async () => {
    await assertSucceeds(getDoc(doc(anyone(), 'settings', 'shop')));
    await assertSucceeds(getDoc(doc(rami(), 'settings', 'shop')));
  });

  it('only Eddy can write them', async () => {
    await assertFails(save(anyone(), valid()));
    await assertFails(save(rami(), valid()));
    await assertFails(save(passwordUser(), valid()));
    await assertFails(updateDoc(doc(rami(), 'settings', 'shop'), { bookingWindowDays: 60 }));
    await assertSucceeds(save(admin(), valid({ bookingWindowDays: 7 })));
  });

  it('Eddy can save every kind of change', async () => {
    await assertSucceeds(
      save(
        admin(),
        valid({
          weeklyHours: hoursWith(TOMORROW, {
            start: '09:00',
            end: '18:00',
            breaks: [
              { start: '12:00', end: '12:30' },
              { start: '15:00', end: '15:15' },
            ],
          }).map((d, i) => (i === 6 ? { ...d, closed: true } : d)),
          services: [{ id: 's-1', name: 'Kids cut', durationMinutes: 15 }],
          specialPeriods: [
            { name: 'Christmas', start: '2026-12-15', end: '2026-12-31', daysAhead: 14 },
            { name: 'New Year', start: '2027-01-01', end: '2027-01-03', daysAhead: 7 },
            { name: 'Eid', start: '2027-03-01', end: '2027-03-05', daysAhead: 7 },
            { name: 'Easter', start: '2027-04-01', end: '2027-04-05', daysAhead: 7 },
          ],
          daysOff: ['2026-12-25', '2027-01-01'],
        }),
      ),
    );
  });

  it('nobody can delete them, not even Eddy', async () => {
    await assertFails(deleteDoc(doc(admin(), 'settings', 'shop')));
  });

  it('refused with more than 2 breaks a day, or not 7 days', async () => {
    const breaks = [
      { start: '11:00', end: '11:15' },
      { start: '12:00', end: '12:15' },
      { start: '13:00', end: '13:15' },
    ];
    await assertFails(save(admin(), valid({ weeklyHours: hoursWith(TOMORROW, { breaks }) })));
    await assertFails(save(admin(), valid({ weeklyHours: DEFAULT_SETTINGS.weeklyHours.slice(0, 6) })));
  });

  it('refused with hours off the 15-minute grid', async () => {
    await assertFails(save(admin(), valid({ weeklyHours: hoursWith(TOMORROW, { start: '10:05' }) })));
  });

  it('refused with more than 4 special periods, or a bad one', async () => {
    const period = { name: 'X', start: '2026-12-15', end: '2026-12-31', daysAhead: 14 };
    await assertFails(save(admin(), valid({ specialPeriods: Array(5).fill(period) })));
    await assertFails(save(admin(), valid({ specialPeriods: [{ ...period, daysAhead: 0 }] })));
    await assertFails(save(admin(), valid({ specialPeriods: [{ ...period, daysAhead: 1.5 }] })));
    await assertFails(save(admin(), valid({ specialPeriods: [{ ...period, start: 'soon' }] })));
  });

  it('refused with a booking window outside 1 to 60 whole days', async () => {
    await assertFails(save(admin(), valid({ bookingWindowDays: 0 })));
    await assertFails(save(admin(), valid({ bookingWindowDays: 61 })));
    await assertFails(save(admin(), valid({ bookingWindowDays: 2.5 })));
  });

  it('refused with an extra or missing field, a made-up updatedAt, or another doc ID', async () => {
    await assertFails(save(admin(), { ...valid(), theme: 'dark' }));
    const { daysOff: _daysOff, ...missing } = valid();
    await assertFails(save(admin(), missing));
    await assertFails(save(admin(), { ...valid(), updatedAt: Timestamp.now() }));
    await assertFails(setDoc(doc(admin(), 'settings', 'other'), valid()));
  });
});

describe('customer bookings follow the settings', () => {
  it('refused before opening or past closing', async () => {
    await assertFails(book(rami(), { time: '09:45' }));
    await assertFails(book(rami(), { time: '19:45' })); // would end 20:15
  });

  it('allowed from opening, and ending exactly at closing', async () => {
    await assertSucceeds(book(rami(), { time: '10:00' }));
    await assertSucceeds(book(rami(), { code: 'DEF345', time: '19:30', seat: 2, accountSeat: 2 }));
  });

  it('refused in a break or running into one', async () => {
    await assertFails(book(rami(), { time: '14:00', service: SERVICES.beard }));
    await assertFails(book(rami(), { time: '13:45' })); // 13:45–14:15
    await assertFails(book(rami(), { time: '14:45' })); // 14:45–15:15
  });

  it('allowed right before and right after a break', async () => {
    await assertSucceeds(book(rami(), { time: '13:30' }));
    await assertSucceeds(book(rami(), { code: 'DEF345', time: '15:00', seat: 2, accountSeat: 2 }));
  });

  it("checks that weekday's own hours and its second break", async () => {
    await seedSettings({
      weeklyHours: hoursWith(TOMORROW, {
        start: '12:00',
        end: '18:00',
        breaks: [
          { start: '13:00', end: '13:30' },
          { start: '16:00', end: '16:30' },
        ],
      }),
    });
    await assertFails(book(rami(), { time: '11:00' })); // fine on other days
    await assertFails(book(rami(), { time: '15:45' })); // into the second break
    await assertFails(book(rami(), { time: '16:15', service: SERVICES.beard }));
    await assertFails(book(rami(), { time: '17:45' })); // past 18:00
    await assertSucceeds(book(rami(), { time: '14:00' })); // 14:00 is no break on this day
    await assertSucceeds(
      book(rami(), {
        code: 'DEF345',
        time: '16:30',
        service: SERVICES.haircutBeard,
        seat: 2,
        accountSeat: 2,
      }),
    );
  });

  it('refused on a closed weekday', async () => {
    await seedSettings({ weeklyHours: hoursWith(TOMORROW, { closed: true }) });
    await assertFails(book(rami()));
    await assertSucceeds(book(rami(), { date: addDays(TODAY, 2) }));
  });

  it('refused on a day off', async () => {
    await seedSettings({ daysOff: [TOMORROW] });
    await assertFails(book(rami()));
    await assertSucceeds(book(rami(), { date: addDays(TODAY, 2) }));
  });

  it("refused when the service isn't in the settings anymore", async () => {
    await seedSettings({ services: DEFAULT_SETTINGS.services.filter((s) => s.id !== 'haircut') });
    await assertFails(book(rami()));
  });

  it("refused when the duration or name don't match the service's current ones", async () => {
    await seedSettings({
      services: [
        { id: 'haircut', name: 'Haircut', durationMinutes: 45 },
        { id: 'beard', name: 'Beard trim', durationMinutes: 15 },
      ],
    });
    await assertFails(book(rami())); // still 30 min
    await assertFails(book(rami(), { service: SERVICES.beard })); // still called "Beard"
    await assertSucceeds(
      book(rami(), { service: { id: 'haircut', name: 'Haircut', durationMinutes: 45 } }),
    );
  });

  it('allowed for a new 60-minute service, even taking both second seats', async () => {
    const color = { id: 's-color', name: 'Color', durationMinutes: 60 };
    await seedSettings({ services: [...DEFAULT_SETTINGS.services, color] });
    await seed({ code: 'AAA222', time: '10:00', seat: 1, accountSeat: 1 });
    // The most document reads a customer booking does: settings, 4 slots, 2 + 2 seats.
    await assertSucceeds(
      book(rami(), { code: 'CCC444', service: color, time: '16:00', seat: 2, accountSeat: 2 }),
    );
  });

  it('refused for a service longer than 60 minutes, even if the settings have one', async () => {
    const long = { id: 's-long', name: 'Long', durationMinutes: 75 };
    await seedSettings({ services: [long] });
    await assertFails(
      book(rami(), { service: long, slots: ['11:00', '11:15', '11:30', '11:45', '12:00'] }),
    );
  });

  it('refused while there are no settings', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      deleteDoc(doc(ctx.firestore() as unknown as Firestore, 'settings', 'shop')),
    );
    await assertFails(book(rami()));
  });

  it("doesn't affect existing bookings: still cancellable after their service and day are gone", async () => {
    await seed();
    await seedSettings({ services: [], weeklyHours: hoursWith(TOMORROW, { closed: true }) });
    await assertSucceeds(getDoc(doc(rami(), 'bookings', 'ABC234')));
    await assertSucceeds(cancel(rami()));
  });
});

describe('booking window', () => {
  const sarasBooking = (date: string): BookingOptions => ({
    code: 'GHJ456',
    date,
    customer: SARA,
    phone: OTHER_PHONE,
  });

  it('follows bookingWindowDays', async () => {
    await seedSettings({ bookingWindowDays: 2 });
    await assertSucceeds(book(rami(), { date: TOMORROW }));
    await assertFails(book(sara(), sarasBooking(addDays(TODAY, 2))));

    await seedSettings({ bookingWindowDays: 10 });
    await assertSucceeds(book(sara(), sarasBooking(addDays(TODAY, 9))));
    await assertFails(book(sara(), { ...sarasBooking(addDays(TODAY, 10)), code: 'KLM567', accountSeat: 2, seat: 2 }));
  });

  it('a special period that includes today lets customers book further ahead', async () => {
    await seedSettings({
      specialPeriods: [{ name: 'Holidays', start: addDays(TODAY, -3), end: TODAY, daysAhead: 10 }],
    });
    await assertSucceeds(book(rami(), { date: addDays(TODAY, 9) }));
    await assertFails(book(sara(), sarasBooking(addDays(TODAY, 10))));
  });

  it('any of the 4 special periods counts', async () => {
    const later = { name: 'Later', start: addDays(TODAY, 20), end: addDays(TODAY, 30), daysAhead: 30 };
    await seedSettings({
      specialPeriods: [
        later,
        later,
        later,
        { name: 'Now', start: TODAY, end: addDays(TODAY, 2), daysAhead: 8 },
      ],
    });
    await assertSucceeds(book(rami(), { date: addDays(TODAY, 7) }));
  });

  it("a special period that hasn't started or has ended doesn't count", async () => {
    await seedSettings({
      specialPeriods: [
        { name: 'Soon', start: TOMORROW, end: addDays(TODAY, 10), daysAhead: 10 },
        { name: 'Over', start: addDays(TODAY, -10), end: addDays(TODAY, -1), daysAhead: 10 },
      ],
    });
    await assertFails(book(rami(), { date: addDays(TODAY, 5) }));
  });

  // Firestore stops evaluating a write after 1000 expressions; this is the most work a valid
  // customer booking makes the rules do.
  it('the heaviest valid booking still fits within the rules evaluation limit', async () => {
    const date = addDays(TODAY, 5);
    const color = { id: 's-color', name: 'Color', durationMinutes: 60 };
    const later = { name: 'Later', start: addDays(TODAY, 20), end: addDays(TODAY, 30), daysAhead: 30 };
    await seedSettings({
      services: [...DEFAULT_SETTINGS.services, color],
      bookingWindowDays: 1,
      specialPeriods: [later, later, later, { name: 'Now', start: TODAY, end: TODAY, daysAhead: 10 }],
      weeklyHours: hoursWith(date, {
        breaks: [
          { start: '12:00', end: '12:30' },
          { start: '14:00', end: '15:00' },
        ],
      }),
      daysOff: Array.from({ length: 60 }, (_, i) => addDays(TODAY, 10 + i)),
    });
    await seed({ code: 'AAA222', time: '10:00', seat: 1, accountSeat: 1 });
    await assertSucceeds(
      book(rami(), { code: 'CCC444', date, service: color, time: '16:00', seat: 2, accountSeat: 2 }),
    );
  });

  it('a special period still respects days off', async () => {
    const far = addDays(TODAY, 8);
    await seedSettings({
      specialPeriods: [{ name: 'Holidays', start: TODAY, end: TODAY, daysAhead: 10 }],
      daysOff: [far],
    });
    await assertFails(book(rami(), { date: far }));
    await assertSucceeds(book(rami(), { date: addDays(far, 1) }));
  });
});

describe('blocked times', () => {
  const block = (db: Firestore, date: string, time: string, data: Record<string, unknown> = {}) =>
    setDoc(doc(db, 'slots', slotId(date, time)), { date, blocked: true, ...data });

  it('Eddy can block a free time', async () => {
    await assertSucceeds(block(admin(), TOMORROW, '16:00'));
  });

  it('customers cannot book a blocked time, or one running into it', async () => {
    await block(admin(), TOMORROW, '11:15');
    await assertFails(book(rami())); // 11:00–11:30
    await assertFails(book(rami(), { time: '11:15', service: SERVICES.beard }));
    await assertSucceeds(book(rami(), { time: '11:30' }));
  });

  it("Eddy's walk-ins cannot take a blocked time either", async () => {
    await block(admin(), TOMORROW, '11:00');
    await assertFails(book(admin(), { phone: null, customer: null, seat: null }));
  });

  it('Eddy cannot block a booked slot (the booking keeps it)', async () => {
    await seed();
    await assertFails(block(admin(), TOMORROW, '11:00'));
  });

  it('customers cannot block or unblock', async () => {
    await assertFails(block(rami(), TOMORROW, '16:00'));
    await assertFails(block(anyone(), TOMORROW, '16:00'));
    await block(admin(), TOMORROW, '16:00');
    await assertFails(deleteDoc(doc(rami(), 'slots', slotId(TOMORROW, '16:00'))));
  });

  it('Eddy can unblock', async () => {
    await block(admin(), TOMORROW, '16:00');
    await assertSucceeds(deleteDoc(doc(admin(), 'slots', slotId(TOMORROW, '16:00'))));
    await assertSucceeds(book(rami(), { time: '16:00' }));
  });

  it('refused with an extra field, another date than the ID, or off the grid', async () => {
    await assertFails(block(admin(), TOMORROW, '16:00', { reason: 'dentist' }));
    await assertFails(block(admin(), TOMORROW, '16:00', { blocked: 'yes' }));
    await assertFails(
      setDoc(doc(admin(), 'slots', slotId(TOMORROW, '16:00')), { date: TODAY, blocked: true }),
    );
    await assertFails(block(admin(), TOMORROW, '16:05'));
  });

  it("anyone can see a day's blocked times among the taken slots", async () => {
    await block(admin(), TOMORROW, '16:00');
    await assertSucceeds(getDocs(query(collection(anyone(), 'slots'), where('date', '==', TOMORROW))));
  });
});

describe('everything else', () => {
  it('is denied', async () => {
    await assertFails(getDoc(doc(anyone(), 'anything', 'x')));
    await assertFails(getDoc(doc(rami(), 'anything', 'x')));
    await assertFails(setDoc(doc(admin(), 'anything', 'x'), { a: 1 }));
  });
});
