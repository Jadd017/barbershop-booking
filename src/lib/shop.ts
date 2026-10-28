/** Shop details shown to customers: service names, prices and the directions link. */
import { currentLanguage } from '../i18n';
import type { Service } from '../types';

/** A service's name in the site's language: its Arabic name in Arabic if it has one, else `name`. */
export function localServiceName(service: Pick<Service, 'name' | 'nameAr'>): string {
  const ar = service.nameAr?.trim();
  return currentLanguage() === 'ar' && ar ? ar : service.name;
}

/**
 * A booking's service name in the site's language. In Arabic: the Arabic name it was booked with,
 * or else the service's current one (found by `serviceId` in `services`). Otherwise, and when
 * there's no Arabic name, the English name stored with the booking.
 */
export function bookingServiceName(
  booking: { serviceId?: string; serviceName: string; serviceNameAr?: string },
  services: Service[],
): string {
  if (currentLanguage() !== 'ar') return booking.serviceName;
  const ar = booking.serviceNameAr?.trim() || services.find((s) => s.id === booking.serviceId)?.nameAr?.trim();
  return ar || booking.serviceName;
}

/** "$10", "$12.50". */
export function formatPrice(price: number): string {
  return `$${Number.isInteger(price) ? price : price.toFixed(2)}`;
}

/**
 * True for a link that's safe to put in an href: https, no spaces. Anything else (a
 * `javascript:` URL, a typo) is never linked. firestore.rules checks the same when saving.
 */
export function isSafeLink(url: string): boolean {
  return /^https:\/\/[^\s]+$/.test(url);
}
