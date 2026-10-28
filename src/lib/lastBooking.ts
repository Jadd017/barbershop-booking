/**
 * Remembers the booking just made, so the confirmation screen survives the
 * trip to WhatsApp and back (mobile browsers often reload the page on return).
 */
import type { ShopConfirmedBooking } from '../types';
import { isPast } from './slots';

/** Not the single-barber site's key: what it stored has no barber. */
const STORAGE_KEY = 'lastShopBooking';

export interface LastBooking {
  booking: ShopConfirmedBooking;
  /** The shop's name and WhatsApp number when it was booked, for the message. */
  shopName: string;
  whatsapp: string;
}

export function saveLastBooking(value: LastBooking): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the screen still works this visit.
  }
}

/** The remembered booking, unless its time has already passed or it doesn't look right. */
export function loadLastBooking(): LastBooking | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as LastBooking;
    const { booking } = value;
    const valid =
      typeof booking?.bookingCode === 'string' &&
      typeof booking.barberName === 'string' &&
      typeof value.shopName === 'string' &&
      typeof value.whatsapp === 'string';
    if (!valid || isPast(booking.date, booking.startTime)) {
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
