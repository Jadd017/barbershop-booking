/**
 * Each barber's taken time: days/{barberId}_{date} (docs/ARCHITECTURE.md, 4.4).
 *
 * `booked` changes only together with a booking (bookings.ts); this file reads days and changes
 * `blocked`, which the barber himself or the owner may do. Everyone can read day docs: they hold
 * booking codes only, never names or phones.
 */
import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  where,
  type Firestore,
} from 'firebase/firestore';
import { dayDocId, emptyDay, fromDayDoc, slotKey, slotTime, type DayDoc } from '../lib/barberDoc';
import { slotsNeeded } from '../lib/slots';
import { blockedRanges } from '../lib/staffDay';
import { timeToMinutes } from '../lib/time';
import type { BarberDay, BlockedTime, DateKey, TimeString } from '../types';
import type { Store } from './store';

export const dayRef = (db: Firestore, barberId: string, date: DateKey) =>
  doc(db, 'days', dayDocId(barberId, date));

/** Listens to one barber's day; a day with no doc yet is empty. */
export function subscribeDay(
  { db }: Store,
  barberId: string,
  date: DateKey,
  onChange: (day: BarberDay) => void,
  onError: (error: Error) => void,
): () => void {
  return onSnapshot(
    dayRef(db, barberId, date),
    (snap) => onChange(snap.exists() ? fromDayDoc(snap.data() as DayDoc) : emptyDay(barberId, date)),
    onError,
  );
}

/**
 * Listens to every barber's day on `date` ("Any barber"), by barber ID. Barbers with nothing
 * booked or blocked that day have no doc, so they're missing from the map: treat them as free.
 */
export function subscribeDaysOn(
  { db }: Store,
  date: DateKey,
  onChange: (days: Map<string, BarberDay>) => void,
  onError: (error: Error) => void,
): () => void {
  return onSnapshot(
    query(collection(db, 'days'), where('date', '==', date)),
    (snapshot) =>
      onChange(
        new Map(
          snapshot.docs.map((d) => {
            const day = fromDayDoc(d.data() as DayDoc);
            return [day.barberId, day];
          }),
        ),
      ),
    onError,
  );
}

/**
 * Listens to the times `barberId` has blocked from `fromDate` on, soonest first. Back-to-back
 * blocked slots on a day are merged into one range.
 */
export function subscribeBlockedTimes(
  { db }: Store,
  barberId: string,
  fromDate: DateKey,
  onChange: (blocked: BlockedTime[]) => void,
  onError: (error: Error) => void,
): () => void {
  const q = query(
    collection(db, 'days'),
    where('barberId', '==', barberId),
    where('date', '>=', fromDate),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const days = snapshot.docs
        .map((d) => d.data() as DayDoc)
        .sort((a, b) => a.date.localeCompare(b.date));
      onChange(
        days.flatMap((day) =>
          blockedRanges(Object.keys(day.blocked ?? {}).map(slotTime)).map((r) => ({ date: day.date, ...r })),
        ),
      );
    },
    onError,
  );
}

/** Every grid slot from `start` up to (not including) `end`. */
function slotsBetween(start: TimeString, end: TimeString): TimeString[] {
  return slotsNeeded(start, timeToMinutes(end) - timeToMinutes(start));
}

/**
 * The barber himself or the owner: blocks every free slot from `start` to `end` on `date`, so
 * customers can't book them. Booked slots are left to their bookings. Returns how many slots
 * were blocked.
 */
export function blockTime(
  { db }: Store,
  barberId: string,
  date: DateKey,
  start: TimeString,
  end: TimeString,
): Promise<number> {
  const ref = dayRef(db, barberId, date);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() as DayDoc | undefined;
    const blocked = { ...(data?.blocked ?? {}) };
    let count = 0;
    for (const time of slotsBetween(start, end)) {
      const key = slotKey(time);
      if (data?.booked?.[key] || blocked[key]) continue;
      blocked[key] = true;
      count++;
    }
    if (count === 0) return 0;
    // Only `blocked` changes: the rules refuse anything else from a block.
    if (snap.exists()) tx.update(ref, { blocked });
    else tx.set(ref, { barberId, date, booked: {}, blocked });
    return count;
  });
}

/** The barber himself or the owner: frees the blocked slots from `start` to `end` on `date`. */
export async function unblockTime(
  { db }: Store,
  barberId: string,
  date: DateKey,
  start: TimeString,
  end: TimeString,
): Promise<void> {
  const ref = dayRef(db, barberId, date);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const blocked = { ...((snap.data() as DayDoc).blocked ?? {}) };
    for (const time of slotsBetween(start, end)) delete blocked[slotKey(time)];
    tx.update(ref, { blocked });
  });
}
