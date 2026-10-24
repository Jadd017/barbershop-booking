import type { ShopConfirmedBooking } from '../types';
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
