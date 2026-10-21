/**
 * Data access layer. The UI only talks to these functions.
 * Phase 1 serves fake data; phase 2 will replace the bodies with Firestore calls
 * while keeping the same signatures.
 */
import type { Booking, DateKey, Settings } from '../types';
import { fakeBookings, fakeSettings } from './fakeData';

/** Simulated network latency so loading states are exercised. */
const FAKE_DELAY_MS = 200;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), FAKE_DELAY_MS));
}

export function getSettings(): Promise<Settings> {
  return delay(structuredClone(fakeSettings));
}

export function getBookings(date: DateKey): Promise<Booking[]> {
  return delay(fakeBookings.filter((b) => b.date === date).map((b) => ({ ...b })));
}
