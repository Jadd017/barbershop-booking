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
import { slotsNeeded } from '../src/lib/slots';
import { addDays, zonedInstant } from '../src/lib/time';

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

beforeEach(() => env.clearFirestore());

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
  it('can mark a booking done or no-show', async () => {
    await seed();
    await assertSucceeds(
      updateDoc(doc(admin(), 'bookings', 'ABC234'), { status: 'done', statusChangedAt: serverTimestamp() }),
    );
  });

  it('a signed-in customer cannot', async () => {
    await seed();
    await assertFails(
      updateDoc(doc(rami(), 'bookings', 'ABC234'), { status: 'done', statusChangedAt: serverTimestamp() }),
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

  it('can add a walk-in without a phone, a customer UID or any seat', async () => {
    await assertSucceeds(book(admin(), { phone: null, customer: null, seat: null }));
  });

  it('can delete a slot', async () => {
    await seed();
    await assertSucceeds(deleteDoc(doc(admin(), 'slots', slotId(TOMORROW, '11:00'))));
  });
});

describe('everything else', () => {
  it('is denied', async () => {
    await assertFails(getDoc(doc(anyone(), 'settings', 'shop')));
    await assertFails(getDoc(doc(rami(), 'settings', 'shop')));
    await assertFails(setDoc(doc(anyone(), 'settings', 'shop'), { barberName: 'X' }));
    await assertFails(setDoc(doc(admin(), 'anything', 'x'), { a: 1 }));
  });
});
