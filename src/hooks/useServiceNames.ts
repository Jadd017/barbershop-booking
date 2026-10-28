import { createContext, useContext } from 'react';
import { bookingServiceName } from '../lib/shop';
import type { Service } from '../types';

/**
 * The shop's current services, for showing bookings' service names in Arabic (bookings store
 * only the English name). Provided by the pages that already listen to the shop.
 */
export const ServicesContext = createContext<Service[]>([]);

/** A booking's service name in the site's language (lib/shop.ts, bookingServiceName). */
export function useBookingServiceName() {
  const services = useContext(ServicesContext);
  return (booking: Parameters<typeof bookingServiceName>[0]) => bookingServiceName(booking, services);
}
