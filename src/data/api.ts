/**
 * Data access layer. The UI only talks to these functions.
 * Settings are still local fake data; bookings live in Firestore.
 *
 * Firestore layout:
 * - bookings/{bookingCode}: the full booking, including the customer's name and phone.
 *   Using the code as the ID lets a customer fetch their own booking without listing others.
 * - slots/{date}_{HHMM}: one doc per taken 15-min slot, holding only bookingId and date,
 *   so the customer page can see which times are taken without reading anyone's details.
 */
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { generateBookingCode } from '../lib/bookingCode';
import { isPast, slotsNeeded } from '../lib/slots';
import type {
  AdminBooking,
  BookingRequest,
  BookingStatus,
  ConfirmedBooking,
  DateKey,
  ManagedBooking,
  Settings,
  TimeString,
} from '../types';
import { fakeSettings } from './fakeData';
import { db } from './firebase';

/** Simulated network latency so loading states are exercised. */
const FAKE_DELAY_MS = 200;

export function getSettings(): Promise<Settings> {
  return new Promise((resolve) =>
    setTimeout(() => resolve(structuredClone(fakeSettings)), FAKE_DELAY_MS),
  );
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

/** Thrown when no booking matches the code and phone (deliberately doesn't say which). */
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
  durationMinutes: number;
  bookingCode: string;
  status: BookingStatus;
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

/**
 * Listens to the taken slots of `date` in real time.
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
 */
export async function createBooking(request: BookingRequest): Promise<ConfirmedBooking> {
  const { name, phone, service, date, startTime } = request;
  if (isPast(date, startTime)) throw new TimePassedError();

  const slotRefs = slotsNeeded(startTime, service.durationMinutes).map((time) =>
    doc(db, 'slots', slotId(date, time)),
  );

  const bookingCode = await runTransaction(db, async (tx) => {
    // Firestore requires all reads before any writes in a transaction.
    const existing = await Promise.all(slotRefs.map((ref) => tx.get(ref)));
    if (existing.some((snap) => snap.exists())) throw new SlotTakenError();

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
      durationMinutes: service.durationMinutes,
      bookingCode: code,
      status: 'booked',
      createdAt: serverTimestamp(),
    });
    for (const ref of slotRefs) {
      tx.set(ref, { bookingId: code, date });
    }
    return code;
  });

  return {
    bookingCode,
    name,
    serviceName: service.name,
    durationMinutes: service.durationMinutes,
    date,
    startTime,
  };
}

/** True if the booking exists and was made with this phone. */
function matches(data: BookingDoc | undefined, phone: string): data is BookingDoc {
  return data !== undefined && data.phone === phone;
}

/**
 * Fetches a booking by its code, only if `phone` (normalized) matches.
 * Throws BookingNotFoundError for a wrong code or a wrong phone alike.
 */
export async function findBooking(bookingCode: string, phone: string): Promise<ManagedBooking> {
  const snap = await getDoc(doc(db, 'bookings', bookingCode));
  const data = snap.data() as BookingDoc | undefined;
  if (!matches(data, phone)) throw new BookingNotFoundError();

  return {
    bookingCode,
    serviceName: data.serviceName,
    durationMinutes: data.durationMinutes,
    date: data.date,
    startTime: data.startTime,
    status: data.status,
  };
}

/**
 * Cancels atomically: marks the booking cancelled and deletes its slot docs,
 * so the times free up for everyone at once. Only "booked" bookings can be cancelled.
 * `check` runs inside the transaction for caller-specific rules (phone match, past time).
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

/** Customer cancel: the phone must match, and the start time must not have passed. */
export function cancelBooking(bookingCode: string, phone: string): Promise<void> {
  return cancelInTransaction(bookingCode, (data) => {
    if (!matches(data, phone)) throw new BookingNotFoundError();
    if (isPast(data.date, data.startTime)) throw new TimePassedError();
  });
}

/** Admin cancel: no phone check, and Eddy may cancel at any time. */
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
