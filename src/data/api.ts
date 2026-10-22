/**
 * Data access layer. The UI only talks to these functions.
 *
 * Customers book signed in with Google (see ./auth.ts); Eddy signs in with email/password.
 *
 * Firestore layout:
 * - settings/shop: Eddy's settings (see lib/settingsDoc.ts). Everyone reads it live; only Eddy
 *   writes it. It's created with DEFAULT_SETTINGS the first time Eddy opens /admin.
 * - bookings/{bookingCode}: the full booking, including the customer's name, phone, Google UID
 *   (customerUid) and email. Customers can only read and cancel their own; walk-ins Eddy adds
 *   have customerUid null.
 * - slots/{date}_{HHMM}: one doc per taken 15-min slot, holding only bookingId and date,
 *   so the customer page can see which times are taken without reading anyone's details.
 *   Times Eddy blocks are slot docs too ({date, blocked: true}), so they are taken the same way.
 * - phoneLimits/{phone}_{1|2}: the two "seats" a phone number can hold, each pointing at a booking.
 *   Customers can't read them; firestore.rules only lets a booking take a free seat, which
 *   caps each phone at MAX_ACTIVE_BOOKINGS_PER_PHONE upcoming bookings.
 * - userLimits/{uid}_{1|2}: the same seats per Google account (MAX_ACTIVE_BOOKINGS_PER_ACCOUNT).
 *   A customer can read their own, so the right one is picked up front.
 * - customers/{uid}: the name and phone they last booked with, to pre-fill the form.
 *
 * firestore.rules re-checks everything written here, so keep the two in step.
 */
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  Timestamp,
  where,
  type DocumentData,
  type DocumentReference,
  type Transaction,
} from 'firebase/firestore';
import {
  ADMIN_UID,
  MAX_ACTIVE_BOOKINGS_PER_ACCOUNT,
  MAX_ACTIVE_BOOKINGS_PER_PHONE,
  SHOP_TIME_ZONE,
  SLOT_MINUTES,
} from '../config';
import { generateBookingCode } from '../lib/bookingCode';
import { bookableDays, fitsHours } from '../lib/schedule';
import { DEFAULT_SETTINGS, fromSettingsDoc, toSettingsDoc, type SettingsDoc } from '../lib/settingsDoc';
import { isPast, slotsNeeded } from '../lib/slots';
import { minutesToTime, timeToMinutes, zonedInstant } from '../lib/time';
import type {
  AdminBooking,
  BlockedTime,
  BookingRequest,
  BookingStatus,
  ConfirmedBooking,
  CustomerBooking,
  CustomerProfile,
  DateKey,
  Settings,
  TimeString,
} from '../types';
import { isGoogleUser } from './auth';
import { auth, db } from './firebase';

const settingsRef = () => doc(db, 'settings', 'shop');

/**
 * Listens to the shop's settings in real time. Calls `onChange` with null while
 * settings/shop doesn't exist yet (until Eddy first opens /admin).
 * Returns a function that stops listening.
 */
export function subscribeSettings(
  onChange: (settings: Settings | null) => void,
  onError: (error: Error) => void,
): () => void {
  return onSnapshot(
    settingsRef(),
    (snap) => onChange(snap.exists() ? fromSettingsDoc(snap.data() as SettingsDoc) : null),
    onError,
  );
}

/** Eddy only: creates settings/shop with DEFAULT_SETTINGS if it doesn't exist yet. */
export async function ensureSettings(): Promise<void> {
  await runTransaction(db, async (tx) => {
    if ((await tx.get(settingsRef())).exists()) return;
    tx.set(settingsRef(), { ...toSettingsDoc(DEFAULT_SETTINGS), updatedAt: serverTimestamp() });
  });
}

/** Eddy only: replaces the settings. Existing bookings are never touched. */
export async function saveSettings(settings: Settings): Promise<void> {
  await setDoc(settingsRef(), { ...toSettingsDoc(settings), updatedAt: serverTimestamp() });
}

/** Thrown when a slot the booking needs was taken first by someone else. */
export class SlotTakenError extends Error {
  constructor() {
    super('Slot already taken');
    this.name = 'SlotTakenError';
  }
}

/** Thrown when the chosen start time has already passed. */
export class TimePassedError extends Error {
  constructor() {
    super('Time already passed');
    this.name = 'TimePassedError';
  }
}

/**
 * Thrown when the settings no longer allow the booking: Eddy changed the hours, the service,
 * the booking window or added a day off while the customer was choosing.
 */
export class NotBookableError extends Error {
  constructor() {
    super('No longer bookable');
    this.name = 'NotBookableError';
  }
}

/** Thrown when booking as a customer without being signed in with Google. */
export class SignInRequiredError extends Error {
  constructor() {
    super('Sign in with Google to book');
    this.name = 'SignInRequiredError';
  }
}

/** Thrown when the booking doesn't exist, or isn't the signed-in customer's. */
export class BookingNotFoundError extends Error {
  constructor() {
    super('Booking not found');
    this.name = 'BookingNotFoundError';
  }
}

/** Thrown when cancelling a booking that is already done or marked as a no-show. */
export class NotCancellableError extends Error {
  constructor() {
    super('Booking can no longer be cancelled');
    this.name = 'NotCancellableError';
  }
}

/** Thrown when cancelling a booking that is already cancelled. */
export class AlreadyCancelledError extends Error {
  constructor() {
    super('Booking already cancelled');
    this.name = 'AlreadyCancelledError';
  }
}

/** Thrown when the phone, or the Google account, already has the maximum upcoming bookings. */
export class TooManyBookingsError extends Error {
  readonly limitedBy: 'phone' | 'account';

  constructor(limitedBy: 'phone' | 'account') {
    super(`Too many upcoming bookings for this ${limitedBy}`);
    this.limitedBy = limitedBy;
    this.name = 'TooManyBookingsError';
  }
}

/** Thrown when every generated code collided with an existing booking (astronomically unlikely). */
class NoFreeCodeError extends Error {
  constructor() {
    super('Could not generate a unique booking code');
    this.name = 'NoFreeCodeError';
  }
}

const MAX_CODE_ATTEMPTS = 5;

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
  /** Null for walk-ins Eddy adds; missing on bookings made before customers signed in. */
  customerUid?: string | null;
  customerEmail?: string | null;
}

/** Shape of a phoneLimits / userLimits seat. */
interface SeatDoc {
  bookingId: string;
  startAt: Timestamp;
}

/** The signed-in customer a booking is made for. */
interface Customer {
  uid: string;
  email: string | null;
}

/** "2026-10-22" + "12:30" → "2026-10-22_1230" */
function slotId(date: DateKey, time: TimeString): string {
  return `${date}_${time.replace(':', '')}`;
}

/** "2026-10-22_1230" → "12:30" */
function slotTime(id: string): TimeString {
  const hhmm = id.slice(id.indexOf('_') + 1);
  return `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;
}

/** Slot docs for every 15-min slot from `start` up to (not including) `end` on `date`. */
function slotRefsBetween(date: DateKey, start: TimeString, end: TimeString): DocumentReference[] {
  return slotsNeeded(start, timeToMinutes(end) - timeToMinutes(start)).map((time) =>
    doc(db, 'slots', slotId(date, time)),
  );
}

/**
 * Listens to the taken slots of `date` in real time (booked or blocked).
 * Calls `onChange` right away and again whenever anyone books.
 * Returns a function that stops listening.
 */
export function subscribeTakenSlots(
  date: DateKey,
  onChange: (taken: Set<TimeString>) => void,
  onError: (error: Error) => void,
): () => void {
  const q = query(collection(db, 'slots'), where('date', '==', date));
  return onSnapshot(
    q,
    (snapshot) => onChange(new Set(snapshot.docs.map((d) => slotTime(d.id)))),
    onError,
  );
}

/**
 * Books atomically: checks every slot the service needs and, only if all are
 * free, creates the booking and its slot docs together. If any slot is taken,
 * nothing is written and SlotTakenError is thrown.
 *
 * Customer bookings also take one of their Google account's seats and one of the
 * phone's seats (see the top of this file). The account's seats are read in the
 * transaction; the phone's can't be read, so it tries each in turn: the rules refuse
 * a seat in use. Afterwards the name and phone are saved to pre-fill the next booking.
 */
export async function createBooking(request: BookingRequest): Promise<ConfirmedBooking> {
  const { date, startTime } = request;
  if (isPast(date, startTime)) throw new TimePassedError();

  // Eddy's own bookings (walk-ins, phone calls) don't count towards the limits.
  const user = auth.currentUser;
  if (user?.uid === ADMIN_UID) {
    return confirmed(request, await bookInTransaction(request, null));
  }
  if (!user || !isGoogleUser(user) || !request.phone) throw new SignInRequiredError();

  const customer = { uid: user.uid, email: user.email };
  for (let phoneSeat = 1; phoneSeat <= MAX_ACTIVE_BOOKINGS_PER_PHONE; phoneSeat++) {
    try {
      const code = await bookInTransaction(request, { customer, phoneSeat });
      await saveCustomerProfile(customer.uid, { name: request.name, phone: request.phone });
      return confirmed(request, code);
    } catch (err) {
      if (!isPermissionDenied(err)) throw err;
    }
  }
  // Every phone seat refused. The page already checked everything else, so it's the limit,
  // unless the time passed or Eddy changed the settings while the customer was typing.
  if (isPast(date, startTime)) throw new TimePassedError();
  if (!(await allowedBySettings(request))) throw new NotBookableError();
  throw new TooManyBookingsError('phone');
}

/** True if the current settings still offer `request`'s service, day and time to customers. */
async function allowedBySettings(request: BookingRequest): Promise<boolean> {
  const snap = await getDoc(settingsRef());
  if (!snap.exists()) return false;
  const settings = fromSettingsDoc(snap.data() as SettingsDoc);
  const { service, date, startTime } = request;
  const current = settings.services.find((s) => s.id === service.id);
  return (
    current?.name === service.name &&
    current.durationMinutes === service.durationMinutes &&
    bookableDays(settings).includes(date) &&
    fitsHours(settings, date, startTime, service.durationMinutes)
  );
}

/** Checks the code rather than the class, which can differ if two copies of the SDK are loaded. */
function isPermissionDenied(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === 'permission-denied';
}

function confirmed(request: BookingRequest, bookingCode: string): ConfirmedBooking {
  return {
    bookingCode,
    name: request.name,
    serviceName: request.service.name,
    durationMinutes: request.service.durationMinutes,
    date: request.date,
    startTime: request.startTime,
  };
}

/**
 * Reads the customer's seats in `tx` and returns the number of a free one.
 * A seat is free once its booking has started or is no longer "booked".
 * Throws TooManyBookingsError('account') if both are in use.
 */
async function freeAccountSeat(tx: Transaction, uid: string): Promise<number> {
  for (let seat = 1; seat <= MAX_ACTIVE_BOOKINGS_PER_ACCOUNT; seat++) {
    const snap = await tx.get(doc(db, 'userLimits', `${uid}_${seat}`));
    const data = snap.data() as SeatDoc | undefined;
    if (!data || data.startAt.toMillis() <= Date.now()) return seat;
    const booking = await tx.get(doc(db, 'bookings', data.bookingId));
    if (booking.get('status') !== 'booked') return seat;
  }
  throw new TooManyBookingsError('account');
}

/**
 * Writes the booking and its slots, plus (for a customer) the account seat and phone seat
 * `phoneSeat`. Returns the code.
 */
function bookInTransaction(
  request: BookingRequest,
  forCustomer: { customer: Customer; phoneSeat: number } | null,
): Promise<string> {
  const { name, phone, service, date, startTime } = request;
  const startAt = Timestamp.fromDate(zonedInstant(date, startTime, SHOP_TIME_ZONE));
  const slotRefs = slotsNeeded(startTime, service.durationMinutes).map((time) =>
    doc(db, 'slots', slotId(date, time)),
  );
  const customer = forCustomer?.customer ?? null;

  return runTransaction(db, async (tx) => {
    // Firestore requires all reads before any writes in a transaction.
    const existing = await Promise.all(slotRefs.map((ref) => tx.get(ref)));
    if (existing.some((snap) => snap.exists())) throw new SlotTakenError();

    const accountSeat = customer ? await freeAccountSeat(tx, customer.uid) : null;

    // The code is the document ID, so pick one that isn't used yet.
    let code: string | null = null;
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS && !code; attempt++) {
      const candidate = generateBookingCode();
      if (!(await tx.get(doc(db, 'bookings', candidate))).exists()) code = candidate;
    }
    if (!code) throw new NoFreeCodeError();

    tx.set(doc(db, 'bookings', code), {
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
    });
    for (const ref of slotRefs) {
      tx.set(ref, { bookingId: code, date });
    }
    if (customer && forCustomer) {
      tx.set(doc(db, 'userLimits', `${customer.uid}_${accountSeat}`), { bookingId: code, startAt });
      tx.set(doc(db, 'phoneLimits', `${phone}_${forCustomer.phoneSeat}`), {
        bookingId: code,
        startAt,
      });
    }
    return code;
  });
}

/** The name and phone the customer last booked with, or null before their first booking. */
export async function getCustomerProfile(uid: string): Promise<CustomerProfile | null> {
  const data = (await getDoc(doc(db, 'customers', uid))).data();
  return data ? { name: data.name, phone: data.phone } : null;
}

/** Best effort: the booking is already made, so a failure here only loses the pre-fill. */
async function saveCustomerProfile(uid: string, profile: CustomerProfile): Promise<void> {
  try {
    await setDoc(doc(db, 'customers', uid), { ...profile, updatedAt: serverTimestamp() });
  } catch (err) {
    console.error(err);
  }
}

function toCustomerBooking(data: DocumentData): CustomerBooking {
  const b = data as BookingDoc;
  return {
    bookingCode: b.bookingCode,
    serviceName: b.serviceName,
    durationMinutes: b.durationMinutes,
    date: b.date,
    startTime: b.startTime,
    status: b.status,
  };
}

/**
 * Listens to every booking of the customer `uid` (all statuses and dates), soonest first.
 * Returns a function that stops listening.
 */
export function subscribeMyBookings(
  uid: string,
  onChange: (bookings: CustomerBooking[]) => void,
  onError: (error: Error) => void,
): () => void {
  // Sorted here rather than with orderBy, so Firestore doesn't need a composite index.
  const q = query(collection(db, 'bookings'), where('customerUid', '==', uid));
  return onSnapshot(
    q,
    (snapshot) =>
      onChange(
        snapshot.docs
          .map((d) => toCustomerBooking(d.data()))
          .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`)),
      ),
    onError,
  );
}

/**
 * Cancels atomically: marks the booking cancelled and deletes its slot docs,
 * so the times free up for everyone at once. Only "booked" bookings can be cancelled.
 * `check` runs inside the transaction for caller-specific rules (owner, past time).
 */
async function cancelInTransaction(
  bookingId: string,
  check: (data: BookingDoc | undefined) => asserts data is BookingDoc,
): Promise<void> {
  const bookingRef = doc(db, 'bookings', bookingId);

  await runTransaction(db, async (tx) => {
    const data = (await tx.get(bookingRef)).data() as BookingDoc | undefined;
    check(data);
    if (data.status === 'cancelled') throw new AlreadyCancelledError();
    if (data.status !== 'booked') throw new NotCancellableError();

    const slotRefs = slotsNeeded(data.startTime, data.durationMinutes).map((time) =>
      doc(db, 'slots', slotId(data.date, time)),
    );
    const slots = await Promise.all(slotRefs.map((ref) => tx.get(ref)));

    tx.update(bookingRef, { status: 'cancelled', cancelledAt: serverTimestamp() });
    // Only delete slots that still belong to this booking.
    for (const slot of slots) {
      if (slot.get('bookingId') === bookingId) tx.delete(slot.ref);
    }
  });
}

/** Customer cancel: it must be the signed-in customer's, and its start time must not have passed. */
export function cancelMyBooking(bookingCode: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  return cancelInTransaction(bookingCode, (data) => {
    if (!uid || !data || data.customerUid !== uid) throw new BookingNotFoundError();
    if (isPast(data.date, data.startTime)) throw new TimePassedError();
  });
}

/** Admin cancel: any booking, and Eddy may cancel at any time. */
export function adminCancelBooking(bookingId: string): Promise<void> {
  return cancelInTransaction(bookingId, (data) => {
    if (!data) throw new BookingNotFoundError();
  });
}

/**
 * Marks a booking as done or as a no-show, or back to booked to undo a mistap.
 * Slots stay taken either way, so this can never cause a double booking.
 */
export function setBookingStatus(
  bookingId: string,
  status: 'booked' | 'done' | 'no-show',
): Promise<void> {
  return updateDoc(doc(db, 'bookings', bookingId), {
    status,
    statusChangedAt: serverTimestamp(),
  });
}

function toAdminBooking(id: string, data: DocumentData): AdminBooking {
  const b = data as BookingDoc;
  return {
    id,
    bookingCode: b.bookingCode ?? id,
    name: b.name,
    phone: b.phone ?? null,
    serviceName: b.serviceName,
    durationMinutes: b.durationMinutes,
    date: b.date,
    startTime: b.startTime,
    status: b.status,
    customerEmail: b.customerEmail ?? null,
  };
}

/** Listens to every booking on `date` (all statuses), sorted by start time. */
export function subscribeBookings(
  date: DateKey,
  onChange: (bookings: AdminBooking[]) => void,
  onError: (error: Error) => void,
): () => void {
  // Sorted here rather than with orderBy, so Firestore doesn't need a composite index.
  const q = query(collection(db, 'bookings'), where('date', '==', date));
  return onSnapshot(
    q,
    (snapshot) =>
      onChange(
        snapshot.docs
          .map((d) => toAdminBooking(d.id, d.data()))
          .sort((a, b) => a.startTime.localeCompare(b.startTime)),
      ),
    onError,
  );
}

/**
 * Listens to every booking from `fromDate` on (all statuses), soonest first.
 * Eddy uses it to find bookings that clash with new hours or days off.
 */
export function subscribeUpcomingBookings(
  fromDate: DateKey,
  onChange: (bookings: AdminBooking[]) => void,
  onError: (error: Error) => void,
): () => void {
  const q = query(collection(db, 'bookings'), where('date', '>=', fromDate));
  return onSnapshot(
    q,
    (snapshot) =>
      onChange(
        snapshot.docs
          .map((d) => toAdminBooking(d.id, d.data()))
          .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`)),
      ),
    onError,
  );
}

/**
 * Listens to the times Eddy blocked from `fromDate` on, soonest first.
 * Back-to-back blocked slots on a day are merged into one range.
 */
export function subscribeBlockedTimes(
  fromDate: DateKey,
  onChange: (blocked: BlockedTime[]) => void,
  onError: (error: Error) => void,
): () => void {
  // Filtered on `blocked` here rather than in the query, so Firestore doesn't need a composite index.
  const q = query(collection(db, 'slots'), where('date', '>=', fromDate));
  return onSnapshot(
    q,
    (snapshot) => {
      const ids = snapshot.docs
        .filter((d) => d.get('blocked') === true)
        .map((d) => d.id)
        .sort();
      const ranges: BlockedTime[] = [];
      for (const id of ids) {
        const date = id.slice(0, id.indexOf('_'));
        const start = slotTime(id);
        const last = ranges[ranges.length - 1];
        if (last?.date === date && last.end === start) {
          last.end = minutesToTime(timeToMinutes(start) + SLOT_MINUTES);
        } else {
          ranges.push({ date, start, end: minutesToTime(timeToMinutes(start) + SLOT_MINUTES) });
        }
      }
      onChange(ranges);
    },
    onError,
  );
}

/**
 * Eddy only: blocks every free slot from `start` to `end` on `date`, so customers can't book them.
 * Slots already booked are left to their bookings. Returns how many slots were blocked.
 */
export function blockTime(date: DateKey, start: TimeString, end: TimeString): Promise<number> {
  const refs = slotRefsBetween(date, start, end);
  return runTransaction(db, async (tx) => {
    const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
    const free = snaps.filter((snap) => !snap.exists());
    for (const snap of free) tx.set(snap.ref, { date, blocked: true });
    return free.length;
  });
}

/** Eddy only: frees the blocked slots from `start` to `end` on `date` (booked ones stay). */
export async function unblockTime(date: DateKey, start: TimeString, end: TimeString): Promise<void> {
  const refs = slotRefsBetween(date, start, end);
  await runTransaction(db, async (tx) => {
    const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
    for (const snap of snaps) {
      if (snap.get('blocked') === true) tx.delete(snap.ref);
    }
  });
}
