import type { ShopConfirmedBooking, ShopStaffBooking } from '../types';
import { formatDayLong } from './time';

/** A wa.me link that opens a chat with `phone` (any format), with `message` pre-filled if given. */
export function whatsappLink(phone: string, message?: string): string {
  // wa.me wants the number as digits only, with the country code and no "+".
  const base = `https://wa.me/${phone.replace(/\D/g, '')}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/** The message a customer sends the shop about a new booking. */
export function bookingMessage(booking: ShopConfirmedBooking, shopName: string): string {
  return [
    `Hi ${shopName}, I just booked an appointment:`,
    `Barber: ${booking.barberName}${booking.anyBarber ? ' (any barber)' : ''}`,
    `Name: ${booking.name}`,
    `Service: ${booking.serviceName} (${booking.durationMinutes} min)`,
    `Day: ${formatDayLong(booking.date)}`,
    `Time: ${booking.startTime}`,
    `Booking code: ${booking.bookingCode}`,
  ].join('\n');
}

/** The wa.me link that sends a new booking's details to the shop's WhatsApp number. */
export function bookingWhatsappLink(
  booking: ShopConfirmedBooking,
  shopName: string,
  shopWhatsapp: string,
): string {
  return whatsappLink(shopWhatsapp, bookingMessage(booking, shopName));
}

/**
 * What the owner sends a customer after moving their booking to another barber, e.g. "Hi Rami,
 * your booking at Sassine Maatouk on Monday, October 26 at 16:30 is now with Karim. Booking
 * code: K7M2QX".
 */
export function movedMessage(booking: ShopStaffBooking, shopName: string): string {
  return (
    `Hi ${booking.name}, your booking at ${shopName} on ${formatDayLong(booking.date)} at ` +
    `${booking.startTime} is now with ${booking.barberName}. Booking code: ${booking.bookingCode}`
  );
}
