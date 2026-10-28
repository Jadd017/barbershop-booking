import i18n from '../i18n';
import type { ShopConfirmedBooking, ShopStaffBooking } from '../types';
import { bookingServiceName } from './shop';
import { formatDayLong } from './time';

/** A wa.me link that opens a chat with `phone` (any format), with `message` pre-filled if given. */
export function whatsappLink(phone: string, message?: string): string {
  // wa.me wants the number as digits only, with the country code and no "+".
  const base = `https://wa.me/${phone.replace(/\D/g, '')}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/** The message a customer sends the shop about a new booking, in the language they're using. */
export function bookingMessage(booking: ShopConfirmedBooking, shopName: string): string {
  return [
    i18n.t('whatsapp.intro', { shop: shopName }),
    i18n.t(booking.anyBarber ? 'whatsapp.barberAny' : 'whatsapp.barber', { name: booking.barberName }),
    i18n.t('whatsapp.name', { name: booking.name }),
    i18n.t('whatsapp.service', { service: bookingServiceName(booking, []), minutes: booking.durationMinutes }),
    i18n.t('whatsapp.day', { day: formatDayLong(booking.date) }),
    i18n.t('whatsapp.time', { time: booking.startTime }),
    i18n.t('whatsapp.code', { code: booking.bookingCode }),
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
  return i18n.t('whatsapp.moved', {
    name: booking.name,
    shop: shopName,
    day: formatDayLong(booking.date),
    time: booking.startTime,
    barber: booking.barberName,
    code: booking.bookingCode,
  });
}
