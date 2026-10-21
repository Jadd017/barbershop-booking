import { BARBER_WHATSAPP } from '../config';
import type { ConfirmedBooking } from '../types';
import { formatDayLong } from './time';

/** A wa.me link that opens a chat with `phone` (any format), with `message` pre-filled if given. */
export function whatsappLink(phone: string, message?: string): string {
  // wa.me wants the number as digits only, with the country code and no "+".
  const base = `https://wa.me/${phone.replace(/\D/g, '')}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/** The wa.me link that sends a new booking's details to the barber. */
export function bookingWhatsappLink(booking: ConfirmedBooking, barberName: string): string {
  const message = [
    `Hi ${barberName}, I just booked an appointment:`,
    `Name: ${booking.name}`,
    `Service: ${booking.serviceName} (${booking.durationMinutes} min)`,
    `Day: ${formatDayLong(booking.date)}`,
    `Time: ${booking.startTime}`,
    `Booking code: ${booking.bookingCode}`,
  ].join('\n');
  return whatsappLink(BARBER_WHATSAPP, message);
}
