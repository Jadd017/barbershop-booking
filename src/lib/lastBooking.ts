/**
 * Remembers the booking just made, so the confirmation screen survives the
 * trip to WhatsApp and back (mobile browsers often reload the page on return).
 */
import type { ConfirmedBooking } from '../types';
import { isPast } from './slots';

const STORAGE_KEY = 'lastConfirmedBooking';

export interface LastBooking {
  booking: ConfirmedBooking;
  barberName: string;
}

export function saveLastBooking(value: LastBooking): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the screen still works this visit.
  }
}

/** The remembered booking, unless its time has already passed. */
export function loadLastBooking(): LastBooking | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as LastBooking;
    const { booking } = value;
    if (typeof booking?.bookingCode !== 'string' || isPast(booking.date, booking.startTime)) {
      clearLastBooking();
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function clearLastBooking(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
