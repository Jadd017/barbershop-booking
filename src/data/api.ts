/**
 * Data access layer. The UI only talks to these functions.
 * Settings are still local fake data; bookings live in Firestore.
 *
 * Firestore layout:
 * - bookings/{autoId}: the full booking, including the customer's name and phone.
 * - slots/{date}_{HHMM}: one doc per taken 15-min slot, holding only bookingId and date,
 *   so the customer page can see which times are taken without reading anyone's details.
 */
import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { generateBookingCode } from '../lib/bookingCode';
import { isPast, slotsNeeded } from '../lib/slots';
import type {
  BookingRequest,
  ConfirmedBooking,
  DateKey,
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

  const bookingRef = doc(collection(db, 'bookings'));
  const slotRefs = slotsNeeded(startTime, service.durationMinutes).map((time) =>
    doc(db, 'slots', slotId(date, time)),
  );
  const bookingCode = generateBookingCode();

  await runTransaction(db, async (tx) => {
    // Firestore requires all reads before any writes in a transaction.
    const existing = await Promise.all(slotRefs.map((ref) => tx.get(ref)));
    if (existing.some((snap) => snap.exists())) throw new SlotTakenError();

    tx.set(bookingRef, {
      name,
      phone,
      serviceId: service.id,
      serviceName: service.name,
      date,
      startTime,
      durationMinutes: service.durationMinutes,
      bookingCode,
      status: 'booked',
      createdAt: serverTimestamp(),
    });
    for (const ref of slotRefs) {
      tx.set(ref, { bookingId: bookingRef.id, date });
    }
  });

  return {
    id: bookingRef.id,
    bookingCode,
    serviceName: service.name,
    durationMinutes: service.durationMinutes,
    date,
    startTime,
  };
}
