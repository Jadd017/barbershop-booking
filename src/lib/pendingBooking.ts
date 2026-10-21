/**
 * Remembers the service, day and time chosen before signing in with Google, so they
 * survive a redirect sign-in (which reloads the page). Session storage: this tab only.
 */
import type { DateKey, TimeString } from '../types';

const STORAGE_KEY = 'pendingBooking';

export interface PendingBooking {
  serviceId: string;
  day: DateKey;
  time: TimeString;
}

export function savePendingBooking(value: PendingBooking): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage can be unavailable; the popup sign-in keeps the choice in memory anyway.
  }
}

export function loadPendingBooking(): PendingBooking | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as PendingBooking;
    const valid = [value?.serviceId, value?.day, value?.time].every((v) => typeof v === 'string');
    return valid ? value : null;
  } catch {
    return null;
  }
}

export function clearPendingBooking(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
