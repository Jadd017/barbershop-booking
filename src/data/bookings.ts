/**
 * Bookings for the multi-barber shop (docs/ARCHITECTURE.md, 6 and 7).
 *
 * - bookings/{bookingCode}: the full booking, with its barber. Customers read and cancel their
 *   own; a barber reads and manages his own; the owner all of them and moves them.
 * - Every change to a booking's time goes through one transaction with its barber's day doc
 *   (days.ts): the booking's 15-min slots are added to, or removed from, `booked` together with
 *   lastBookingId and bookingAt, which is what firestore.rules checks. That's what makes a barber
 *   impossible to double-book, even by two customers at the same moment.
 * - phoneLimits/{phone}_{1|2} and userLimits/{uid}_{1|2}: the two "seats" a phone and a Google
 *   account can hold, as in the single-barber data layer. The booking names the seats it takes.
 * - customers/{uid}: the name and phone a customer last booked with, to pre-fill the form.
 */
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
  type Firestore,
  type Query,
  type Transaction,
} from 'firebase/firestore';
import {
  MAX_ACTIVE_BOOKINGS_PER_ACCOUNT,
  MAX_ACTIVE_BOOKINGS_PER_PHONE,
  SHOP_TIME_ZONE,
} from '../config';
import { generateBookingCode } from '../lib/bookingCode';
import { fromBarberDoc, fromDayDoc, emptyDay, slotKey, type BarberDoc, type DayDoc } from '../lib/barberDoc';
import { bookableDaysFor, fitsBarberHours } from '../lib/barberSchedule';
import { chooseAnyBarber, freeBarbers } from '../lib/barberSlots';
import { fromShopDoc, type ShopDoc } from '../lib/shopDoc';
import { isPast, slotsNeeded } from '../lib/slots';
import { zonedInstant } from '../lib/time';
import type {
  Barber,
  BarberDay,
  BookingStatus,
  CustomerProfile,
  DateKey,
  ShopBookingRequest,
  ShopConfirmedBooking,
  ShopCustomerBooking,
  ShopSettings,
  ShopStaffBooking,
  TimeString,
} from '../types';
import { isGoogleUser } from './auth';
import { dayRef } from './days';
import {
  AlreadyCancelledError,
  BookingNotFoundError,
  isPermissionDenied,
  NotBookableError,
  NotCancellableError,
  SignInRequiredError,
  SlotTakenError,
  TimePassedError,
  TooManyBookingsError,
} from './errors';
import { barberRef } from './shop';
import type { Store } from './store';

/** Thrown when every generated code collided with an existing booking (astronomically unlikely). */
class NoFreeCodeError extends Error {
  constructor() {
    super('Could not generate a unique booking code');
    this.name = 'NoFreeCodeError';
  }
}

const MAX_CODE_ATTEMPTS = 5;

/**
 * How often a booking transaction is retried when someone else booked a barber it read first.
 * Firestore's default of 5 is enough for one barber; "Any barber" reads every barber's day, so a
 * rush of customers at once (6 in the tests) needs a few more rounds.
 */
const MAX_TRANSACTION_ATTEMPTS = 12;

/**
 * How often a customer booking is tried again after losing a race. When two people take the
 * same time at once, the loser's write is sometimes refused by the rules (the slot is no longer
 * free) instead of being retried by the transaction, so createBooking checks and tries again.
 */
const MAX_RACE_ATTEMPTS = 6;

/** Shape of a document in the "bookings" collection. */
interface BookingDoc {
  name: string;
  phone: string | null;
  serviceId: string;
  serviceName: string;
  date: DateKey;
  startTime: TimeString;
  /** The real instant of date + startTime in the shop's time zone. */
  startAt: Timestamp;
  durationMinutes: number;
  bookingCode: string;
  status: BookingStatus;
  customerUid: string | null;
  customerEmail: string | null;
  barberId: string;
  barberName: string;
  anyBarber: boolean;
  phoneSeat: number | null;
  accountSeat: number | null;
}

/** Shape of a phoneLimits / userLimits seat. */
interface SeatDoc {
  bookingId: string;
  startAt: Timestamp;
}

/** The signed-in customer a booking is made for, and the phone seat it tries. */
interface ForCustomer {
  uid: string;
  email: string | null;
  phoneSeat: number;
}

const bookingRef = (db: Firestore, code: string) => doc(db, 'bookings', code);

/** The shop's settings and every barber, as they are now on the server. */
async function shopAndBarbers(db: Firestore): Promise<{ shop: ShopSettings | null; barbers: Barber[] }> {
  const [shopSnap, barbersSnap] = await Promise.all([
    getDoc(doc(db, 'settings', 'shop')),
    getDocs(collection(db, 'barbers')),
  ]);
  return {
    shop: shopSnap.exists() ? fromShopDoc(shopSnap.data() as ShopDoc) : null,
    barbers: barbersSnap.docs.map((d) => fromBarberDoc(d.id, d.data() as BarberDoc)),
  };
}

/**
 * The barbers a customer `request` could get, given the settings: the chosen one, or every
 * active one for "Any barber", that works for the whole service then. Empty if the service, the
 * day or the time is no longer offered.
 */
function candidatesFor(
  request: ShopBookingRequest,
  shop: ShopSettings | null,
  barbers: Barber[],
  now: Date,
): Barber[] {
  const { service, date, startTime, barberId } = request;
  if (!shop) return [];
  const current = shop.services.find((s) => s.id === service.id);
  if (current?.name !== service.name || current.durationMinutes !== service.durationMinutes) return [];
  const wanted = barbers.filter((b) => b.active && (barberId === null || b.id === barberId));
  if (!bookableDaysFor(shop, wanted, now).includes(date)) return [];
  return wanted.filter((b) => fitsBarberHours(shop, b, date, startTime, service.durationMinutes));
}

/**
 * Books for the signed-in Google customer, atomically: reads the candidate barbers' days, picks
 * the barber (the chosen one, or for "Any barber" the free one with the fewest bookings that day,
 * then the first in display order), and writes the booking with its slots and seats, all in one
 * transaction. If someone else takes the time first, the transaction runs again with what they
 * booked; SlotTakenError once no candidate is free.
 *
 * The phone's seats can't be read, so it tries each in turn: the rules refuse a seat in use.
 * Afterwards the name and phone are saved to pre-fill the next booking.
 */
export async function createBooking(
  store: Store,
  request: ShopBookingRequest,
  now: Date = new Date(),
): Promise<ShopConfirmedBooking> {
  const { date, startTime } = request;
  if (isPast(date, startTime, now)) throw new TimePassedError();
  const user = store.auth.currentUser;
  if (!user || !isGoogleUser(user) || !request.phone) throw new SignInRequiredError();

  const { shop, barbers } = await shopAndBarbers(store.db);
  const candidates = candidatesFor(request, shop, barbers, now);
  if (!shop || candidates.length === 0) throw new NotBookableError();

  let races = 0;
  for (let phoneSeat = 1; phoneSeat <= MAX_ACTIVE_BOOKINGS_PER_PHONE; ) {
    // The barber this attempt picks, to tell a lost race from a phone seat in use.
    const attempt: { barber: Barber | null } = { barber: null };
    try {
      const booking = await bookInTransaction(
        store.db,
        request,
        shop,
        candidates,
        now,
        { uid: user.uid, email: user.email, phoneSeat },
        (barber) => (attempt.barber = barber),
      );
      await saveCustomerProfile(store.db, user.uid, { name: request.name, phone: request.phone });
      return booking;
    } catch (err) {
      if (!isPermissionDenied(err)) throw err;
      // Someone took that barber's time first: try again (with another barber for "Any").
      const lost =
        attempt.barber !== null &&
        (await slotsTaken(store.db, attempt.barber.id, date, startTime, request.service.durationMinutes));
      if (lost && ++races < MAX_RACE_ATTEMPTS) continue;
      phoneSeat++;
    }
  }
  // Every phone seat refused. The page already checked everything else, so it's the limit,
  // unless the time passed or the settings changed while the customer was typing.
  if (isPast(date, startTime)) throw new TimePassedError();
  const fresh = await shopAndBarbers(store.db);
  if (candidatesFor(request, fresh.shop, fresh.barbers, new Date()).length === 0) {
    throw new NotBookableError();
  }
  throw new TooManyBookingsError('phone');
}

/**
 * Staff only: a walk-in or phone booking for `request.barberId`, at any day and time (the window,
 * hours and blocked time don't apply to staff). Still never double-books. No seats are taken.
 */
export async function createWalkIn(
  store: Store,
  request: ShopBookingRequest & { barberId: string },
): Promise<ShopConfirmedBooking> {
  const barberSnap = await getDoc(barberRef(store.db, request.barberId));
  if (!barberSnap.exists()) throw new NotBookableError();
  const barber = fromBarberDoc(barberSnap.id, barberSnap.data() as BarberDoc);
  return runTransaction(store.db, async (tx) => {
    const day = await readDay(tx, store.db, barber.id, request.date);
    const slots = slotsNeeded(request.startTime, request.service.durationMinutes);
    if (slots.some((t) => day.booked.has(t))) throw new SlotTakenError();
    const code = await freeCode(tx, store.db);
    writeBooking(tx, store.db, request, barber, day, code, null, null);
    return confirmed(request, code, barber, false);
  });
}

/** True if any slot from `startTime` for `durationMinutes` is now booked in a barber's day. */
async function slotsTaken(
  db: Firestore,
  barberId: string,
  date: DateKey,
  startTime: TimeString,
  durationMinutes: number,
): Promise<boolean> {
  const day = (await getDocFromServer(dayRef(db, barberId, date))).data() as DayDoc | undefined;
  return slotsNeeded(startTime, durationMinutes).some((time) => day?.booked?.[slotKey(time)] !== undefined);
}

/** Reads a barber's day doc in `tx`; empty if it doesn't exist yet. */
async function readDay(tx: Transaction, db: Firestore, barberId: string, date: DateKey): Promise<BarberDay> {
  const snap = await tx.get(dayRef(db, barberId, date));
  return snap.exists() ? fromDayDoc(snap.data() as DayDoc) : emptyDay(barberId, date);
}

/** The code is the document ID, so pick one that isn't used yet. */
async function freeCode(tx: Transaction, db: Firestore): Promise<string> {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const candidate = generateBookingCode();
    if (!(await tx.get(bookingRef(db, candidate))).exists()) return candidate;
  }
  throw new NoFreeCodeError();
}

function bookInTransaction(
  db: Firestore,
  request: ShopBookingRequest,
  shop: ShopSettings,
  candidates: Barber[],
  now: Date,
  customer: ForCustomer,
  onPick: (barber: Barber) => void,
): Promise<ShopConfirmedBooking> {
  return runTransaction(
    db,
    async (tx) => {
      // Firestore requires all reads before any writes in a transaction.
      const days = new Map(
        await Promise.all(
          candidates.map(async (b) => [b.id, await readDay(tx, db, b.id, request.date)] as const),
        ),
      );
      const free = freeBarbers(
        request.date,
        request.startTime,
        request.service.durationMinutes,
        shop,
        candidates,
        days,
        now,
      );
      const barber = request.barberId === null ? chooseAnyBarber(free, request.date, days) : free[0];
      if (!barber) throw new SlotTakenError();
      onPick(barber);

      const accountSeat = await freeAccountSeat(tx, db, customer.uid);
      const code = await freeCode(tx, db);
      const day = days.get(barber.id) ?? emptyDay(barber.id, request.date);
      writeBooking(tx, db, request, barber, day, code, customer, accountSeat);
      return confirmed(request, code, barber, request.barberId === null);
    },
    { maxAttempts: MAX_TRANSACTION_ATTEMPTS },
  );
}

/**
 * Reads the customer's seats in `tx` and returns the number of a free one.
 * A seat is free once its booking has started or is no longer "booked".
 * Throws TooManyBookingsError('account') if both are in use.
 */
async function freeAccountSeat(tx: Transaction, db: Firestore, uid: string): Promise<number> {
  for (let seat = 1; seat <= MAX_ACTIVE_BOOKINGS_PER_ACCOUNT; seat++) {
    const snap = await tx.get(doc(db, 'userLimits', `${uid}_${seat}`));
    const data = snap.data() as SeatDoc | undefined;
    if (!data || data.startAt.toMillis() <= Date.now()) return seat;
    const booking = await tx.get(bookingRef(db, data.bookingId));
    if (booking.get('status') !== 'booked') return seat;
  }
  throw new TooManyBookingsError('account');
}

/** Writes the booking, its slots in `barber`'s day, and (for a customer) its seats. */
function writeBooking(
  tx: Transaction,
  db: Firestore,
  request: ShopBookingRequest,
  barber: Barber,
  day: BarberDay,
  code: string,
  customer: ForCustomer | null,
  accountSeat: number | null,
) {
  const { name, phone, service, date, startTime } = request;
  const startAt = Timestamp.fromDate(zonedInstant(date, startTime, SHOP_TIME_ZONE));
  tx.set(bookingRef(db, code), {
    name,
    phone,
    serviceId: service.id,
    serviceName: service.name,
    date,
    startTime,
    startAt,
    durationMinutes: service.durationMinutes,
    bookingCode: code,
    status: 'booked',
    createdAt: serverTimestamp(),
    customerUid: customer?.uid ?? null,
    customerEmail: customer?.email ?? null,
    barberId: barber.id,
    barberName: barber.name,
    anyBarber: customer !== null && request.barberId === null,
    phoneSeat: customer?.phoneSeat ?? null,
    accountSeat,
  });
  const booked = bookedMap(day);
  for (const time of slotsNeeded(startTime, service.durationMinutes)) booked[slotKey(time)] = code;
  tx.set(dayRef(db, barber.id, date), {
    barberId: barber.id,
    date,
    booked,
    blocked: blockedMap(day),
    lastBookingId: code,
    bookingAt: serverTimestamp(),
  });
  if (customer && phone) {
    tx.set(doc(db, 'userLimits', `${customer.uid}_${accountSeat}`), { bookingId: code, startAt });
    tx.set(doc(db, 'phoneLimits', `${phone}_${customer.phoneSeat}`), { bookingId: code, startAt });
  }
}

function bookedMap(day: BarberDay): Record<string, string> {
  return Object.fromEntries([...day.booked].map(([time, id]) => [slotKey(time), id]));
}

function blockedMap(day: BarberDay): Record<string, true> {
  return Object.fromEntries([...day.blocked].map((time) => [slotKey(time), true as const]));
}

function confirmed(
  request: ShopBookingRequest,
  bookingCode: string,
  barber: Barber,
  anyBarber: boolean,
): ShopConfirmedBooking {
  return {
    bookingCode,
    name: request.name,
    serviceName: request.service.name,
    durationMinutes: request.service.durationMinutes,
    date: request.date,
    startTime: request.startTime,
    ...(request.service.price === undefined ? {} : { price: request.service.price }),
    ...(request.service.nameAr ? { serviceNameAr: request.service.nameAr } : {}),
    barberId: barber.id,
    barberName: barber.name,
    anyBarber,
  };
}

/** The name and phone the customer last booked with, or null before their first booking. */
export async function getCustomerProfile({ db }: Store, uid: string): Promise<CustomerProfile | null> {
  const data = (await getDoc(doc(db, 'customers', uid))).data();
  return data ? { name: data.name, phone: data.phone } : null;
}

/** Best effort: the booking is already made, so a failure here only loses the pre-fill. */
async function saveCustomerProfile(db: Firestore, uid: string, profile: CustomerProfile): Promise<void> {
  try {
    await setDoc(doc(db, 'customers', uid), { ...profile, updatedAt: serverTimestamp() });
  } catch (err) {
    console.error(err);
  }
}

// ---- Cancelling, status, moving ----

/** The booking's slot keys in its barber's day doc, with only those that still hold it removed. */
function withoutBooking(day: DayDoc | undefined, b: BookingDoc, code: string): Record<string, string> {
  const booked = { ...(day?.booked ?? {}) };
  for (const time of slotsNeeded(b.startTime, b.durationMinutes)) {
    if (booked[slotKey(time)] === code) delete booked[slotKey(time)];
  }
  return booked;
}

/**
 * Cancels atomically: marks the booking cancelled and frees its slots in its barber's day, so
 * the time is free for everyone at once. Only "booked" bookings can be cancelled.
 * `check` runs inside the transaction for caller-specific rules (owner, past time).
 */
async function cancelInTransaction(
  { db }: Store,
  code: string,
  check: (data: BookingDoc | undefined) => asserts data is BookingDoc,
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const data = await readBooking(tx, db, code);
    check(data);
    if (data.status === 'cancelled') throw new AlreadyCancelledError();
    if (data.status !== 'booked') throw new NotCancellableError();
    const ref = dayRef(db, data.barberId, data.date);
    const day = (await tx.get(ref)).data() as DayDoc | undefined;

    tx.update(bookingRef(db, code), { status: 'cancelled', cancelledAt: serverTimestamp() });
    tx.update(ref, { booked: withoutBooking(day, data, code), lastBookingId: code, bookingAt: serverTimestamp() });
  });
}

/** The booking `code`, or undefined if it doesn't exist or the rules don't let us read it. */
async function readBooking(tx: Transaction, db: Firestore, code: string): Promise<BookingDoc | undefined> {
  try {
    return (await tx.get(bookingRef(db, code))).data() as BookingDoc | undefined;
  } catch (err) {
    if (isPermissionDenied(err)) return undefined;
    throw err;
  }
}

/** Customer cancel: it must be the signed-in customer's, and its start time must not have passed. */
export function cancelMyBooking(store: Store, bookingCode: string): Promise<void> {
  const uid = store.auth.currentUser?.uid;
  return cancelInTransaction(store, bookingCode, (data) => {
    if (!uid || !data || data.customerUid !== uid) throw new BookingNotFoundError();
    if (isPast(data.date, data.startTime)) throw new TimePassedError();
  });
}

/** Staff cancel: the barber's own bookings, or any for the owner, at any time. */
export function staffCancelBooking(store: Store, bookingCode: string): Promise<void> {
  return cancelInTransaction(store, bookingCode, (data) => {
    if (!data) throw new BookingNotFoundError();
  });
}

/**
 * Staff: marks a booking as done or as a no-show, or back to booked to undo a mistap.
 * Slots stay taken either way, so this can never cause a double booking.
 */
export async function setBookingStatus(
  { db }: Store,
  bookingCode: string,
  status: 'booked' | 'done' | 'no-show',
): Promise<void> {
  await updateDoc(bookingRef(db, bookingCode), { status, statusChangedAt: serverTimestamp() });
}

/**
 * Owner only: moves a booking to another active barber, same day and time, in one transaction:
 * its slots leave the old barber's day and join the new one's. SlotTakenError if the new barber
 * has any of them booked; blocked time and his hours are the owner's call (the page warns).
 * Returns the moved booking, for the "WhatsApp the customer" button.
 */
export async function moveBooking(
  { db }: Store,
  bookingCode: string,
  toBarberId: string,
): Promise<ShopStaffBooking> {
  const barberSnap = await getDoc(barberRef(db, toBarberId));
  const barber = barberSnap.exists() ? fromBarberDoc(barberSnap.id, barberSnap.data() as BarberDoc) : null;
  if (!barber?.active) throw new NotBookableError();

  try {
    return await moveInTransaction(db, bookingCode, barber);
  } catch (err) {
    // Another move or booking took the new barber's time first, and the rules refused this one.
    if (!isPermissionDenied(err)) throw err;
    const data = (await getDoc(bookingRef(db, bookingCode))).data() as BookingDoc | undefined;
    const taken =
      data && (await slotsTaken(db, barber.id, data.date, data.startTime, data.durationMinutes));
    throw taken ? new SlotTakenError() : err;
  }
}

function moveInTransaction(db: Firestore, bookingCode: string, barber: Barber): Promise<ShopStaffBooking> {
  const toBarberId = barber.id;
  return runTransaction(db, async (tx) => {
    const ref = bookingRef(db, bookingCode);
    const data = (await tx.get(ref)).data() as BookingDoc | undefined;
    if (!data) throw new BookingNotFoundError();
    if (data.status === 'cancelled') throw new AlreadyCancelledError();
    if (data.status !== 'booked') throw new NotCancellableError();
    if (data.barberId === toBarberId) return toStaffBooking(bookingCode, data);

    const fromRef = dayRef(db, data.barberId, data.date);
    const toRef = dayRef(db, toBarberId, data.date);
    const [fromDay, toDay] = await Promise.all([tx.get(fromRef), tx.get(toRef)]);
    const toData = toDay.data() as DayDoc | undefined;
    const booked = { ...(toData?.booked ?? {}) };
    for (const time of slotsNeeded(data.startTime, data.durationMinutes)) {
      if (booked[slotKey(time)]) throw new SlotTakenError();
      booked[slotKey(time)] = bookingCode;
    }

    tx.update(ref, { barberId: barber.id, barberName: barber.name, movedAt: serverTimestamp() });
    tx.update(fromRef, {
      booked: withoutBooking(fromDay.data() as DayDoc | undefined, data, bookingCode),
      lastBookingId: bookingCode,
      bookingAt: serverTimestamp(),
    });
    tx.set(toRef, {
      barberId: toBarberId,
      date: data.date,
      booked,
      blocked: toData?.blocked ?? {},
      lastBookingId: bookingCode,
      bookingAt: serverTimestamp(),
    });
    return toStaffBooking(bookingCode, { ...data, barberId: barber.id, barberName: barber.name });
  });
}

// ---- Listening ----

function toCustomerBooking(data: DocumentData): ShopCustomerBooking {
  const b = data as BookingDoc;
  return {
    bookingCode: b.bookingCode,
    serviceId: b.serviceId,
    serviceName: b.serviceName,
    durationMinutes: b.durationMinutes,
    date: b.date,
    startTime: b.startTime,
    status: b.status,
    barberName: b.barberName,
  };
}

function toStaffBooking(id: string, data: DocumentData): ShopStaffBooking {
  const b = data as BookingDoc;
  return {
    id,
    bookingCode: b.bookingCode ?? id,
    name: b.name,
    phone: b.phone ?? null,
    serviceId: b.serviceId,
    serviceName: b.serviceName,
    durationMinutes: b.durationMinutes,
    date: b.date,
    startTime: b.startTime,
    status: b.status,
    customerEmail: b.customerEmail ?? null,
    barberId: b.barberId,
    barberName: b.barberName,
    anyBarber: b.anyBarber === true,
  };
}

const byStart = (a: { date: DateKey; startTime: TimeString }, b: { date: DateKey; startTime: TimeString }) =>
  `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`);

/** Listens to `q` as staff bookings, soonest first. Sorted here, so no composite index is needed. */
function subscribeStaffBookings(
  q: Query,
  onChange: (bookings: ShopStaffBooking[]) => void,
  onError: (error: Error) => void,
): () => void {
  return onSnapshot(
    q,
    (snapshot) => onChange(snapshot.docs.map((d) => toStaffBooking(d.id, d.data())).sort(byStart)),
    onError,
  );
}

/** Listens to every booking of the customer `uid` (all statuses and dates), soonest first. */
export function subscribeMyBookings(
  { db }: Store,
  uid: string,
  onChange: (bookings: ShopCustomerBooking[]) => void,
  onError: (error: Error) => void,
): () => void {
  const q = query(collection(db, 'bookings'), where('customerUid', '==', uid));
  return onSnapshot(
    q,
    (snapshot) => onChange(snapshot.docs.map((d) => toCustomerBooking(d.data())).sort(byStart)),
    onError,
  );
}

/**
 * Staff: listens to one barber's bookings on `date` (a barber may only ask for his own), or with
 * `barberId` null every barber's (owner only).
 */
export function subscribeBookingsOn(
  { db }: Store,
  barberId: string | null,
  date: DateKey,
  onChange: (bookings: ShopStaffBooking[]) => void,
  onError: (error: Error) => void,
): () => void {
  const bookings = collection(db, 'bookings');
  const q =
    barberId === null
      ? query(bookings, where('date', '==', date))
      : query(bookings, where('barberId', '==', barberId), where('date', '==', date));
  return subscribeStaffBookings(q, onChange, onError);
}

/**
 * Staff: listens to one barber's bookings from `fromDate` on, all statuses (his calendar, and the
 * owner's list of a deactivated barber's bookings to move), or every barber's with null.
 * Needs the barberId + date index (firestore.indexes.json).
 */
export function subscribeUpcomingBookings(
  { db }: Store,
  barberId: string | null,
  fromDate: DateKey,
  onChange: (bookings: ShopStaffBooking[]) => void,
  onError: (error: Error) => void,
): () => void {
  const bookings = collection(db, 'bookings');
  const q =
    barberId === null
      ? query(bookings, where('date', '>=', fromDate))
      : query(bookings, where('barberId', '==', barberId), where('date', '>=', fromDate));
  return subscribeStaffBookings(q, onChange, onError);
}
