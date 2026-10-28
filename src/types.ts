/** Time of day as "HH:MM" (24h). */
export type TimeString = string;

/** Calendar date as "YYYY-MM-DD" (local time). */
export type DateKey = string;

export interface Service {
  id: string;
  /** The English name, and the one bookings store and firestore.rules check. */
  name: string;
  /** Shown instead of `name` when the site is in Arabic; not set: `name` is shown. */
  nameAr?: string;
  durationMinutes: number;
  /** In US dollars, shown to customers. Not set: no price shown. */
  price?: number;
}

export interface TimeRange {
  start: TimeString;
  end: TimeString;
}

/** Opening hours of one weekday. Times are kept while closed, so reopening restores them. */
export interface DayHours {
  closed: boolean;
  start: TimeString;
  end: TimeString;
  /** At most MAX_BREAKS_PER_DAY, each within start–end. */
  breaks: TimeRange[];
}

/** While today is between `start` and `end` (inclusive), customers can book `daysAhead` days ahead. */
export interface SpecialPeriod {
  name: string;
  start: DateKey;
  end: DateKey;
  daysAhead: number;
}

export interface Settings {
  barberName: string;
  /** 7 entries, Monday first. */
  weeklyHours: DayHours[];
  /** In the order customers see them. */
  services: Service[];
  /** How many days (starting today) customers can book. */
  bookingWindowDays: number;
  /** At most MAX_SPECIAL_PERIODS. */
  specialPeriods: SpecialPeriod[];
  /** Dates the shop is closed, sorted. */
  daysOff: DateKey[];
  /** Street address shown with "Get directions"; may be empty. */
  shopAddress: string;
  /** Google Maps link for "Get directions": https only (see lib/shop.ts), or empty. */
  mapsUrl: string;
}

/** A time range Eddy blocked on one day (stored as blocked slot docs). */
export interface BlockedTime {
  date: DateKey;
  start: TimeString;
  end: TimeString;
}

/** What the customer page sends when booking. */
export interface BookingRequest {
  name: string;
  /** Normalized, e.g. "+96170123456". Null only for walk-ins Eddy adds without a phone. */
  phone: string | null;
  service: Service;
  date: DateKey;
  startTime: TimeString;
}

/** Shown on the confirmation screen. */
export interface ConfirmedBooking {
  bookingCode: string;
  name: string;
  serviceName: string;
  durationMinutes: number;
  date: DateKey;
  startTime: TimeString;
  /** The service's price when booked, if it had one. Only shown, never stored in Firestore. */
  price?: number;
  /** The service's Arabic name when booked, if it had one. Only shown, never stored in Firestore. */
  serviceNameAr?: string;
}

export type BookingStatus = 'booked' | 'cancelled' | 'done' | 'no-show';

/** One of the signed-in customer's bookings, on the "My bookings" page. */
export interface CustomerBooking {
  bookingCode: string;
  /** To show the service's current Arabic name; missing on bookings from before phase 3. */
  serviceId?: string;
  serviceName: string;
  durationMinutes: number;
  date: DateKey;
  startTime: TimeString;
  status: BookingStatus;
}

/** What a customer last booked with, to pre-fill their next booking. */
export interface CustomerProfile {
  name: string;
  phone: string;
}

export interface StartTimeOption {
  time: TimeString;
  available: boolean;
}

/** A booking as Eddy sees it on the dashboard. */
export interface AdminBooking {
  /** Firestore document ID (the booking code for every booking made since phase 3). */
  id: string;
  bookingCode: string;
  name: string;
  phone: string | null;
  /** To show the service's current Arabic name; missing on bookings from before phase 3. */
  serviceId?: string;
  serviceName: string;
  durationMinutes: number;
  date: DateKey;
  startTime: TimeString;
  status: BookingStatus;
  /** The Google account that booked; null for walk-ins Eddy added. */
  customerEmail: string | null;
}

// ---- Multi-barber (docs/ARCHITECTURE.md). Replaces Settings once the pages switch over. ----

/** The shop's opening hours on one weekday. Times are kept while closed, like DayHours. */
export interface OpeningHours {
  closed: boolean;
  start: TimeString;
  end: TimeString;
}

/** Shop-wide settings (settings/shop): the same for every barber. */
export interface ShopSettings {
  /** Header, browser tab title and WhatsApp text. */
  shopName: string;
  /** 7 entries, Monday first. Every barber's hours must fit inside them. */
  openingHours: OpeningHours[];
  /** In the order customers see them. */
  services: Service[];
  /** How many days (starting today) customers can book. */
  bookingWindowDays: number;
  /** At most MAX_SPECIAL_PERIODS. */
  specialPeriods: SpecialPeriod[];
  /** Dates the whole shop is closed, sorted. */
  closedDays: DateKey[];
  /** Where customers send their booking, e.g. "+96170123456"; empty until the owner sets it. */
  whatsapp: string;
  /** Street address shown with "Get directions"; may be empty. */
  shopAddress: string;
  /** Google Maps link for "Get directions": https only (see lib/shop.ts), or empty. */
  mapsUrl: string;
}

/** "#RRGGBB" colors the page is drawn in (become the Tailwind theme variables). */
export interface BrandColors {
  /** Header and text (today's charcoal). */
  dark: string;
  /** Buttons and highlights (today's brass). */
  accent: string;
  /** Page background (today's cream). */
  light: string;
}

/** The shop's look (settings/branding). */
export interface Branding {
  /** A small image as a data: URL (see lib/logo.ts), or null to show the shop name only. */
  logo: string | null;
  colors: BrandColors;
}

/** One barber (barbers/{id}): what customers pick, and his own schedule. */
export interface Barber {
  /** Short slug chosen when he's added ("karim"), never changed. */
  id: string;
  name: string;
  /** Inactive barbers aren't shown to customers and can't be booked by them. */
  active: boolean;
  /** Display order, and the tie-break when assigning "Any barber". */
  order: number;
  /** 7 entries, Monday first. Each open day fits inside the shop's opening hours. */
  weeklyHours: DayHours[];
  /** His personal days off, sorted. */
  daysOff: DateKey[];
}

/** One barber's taken time on one day (days/{barberId}_{date}). */
export interface BarberDay {
  barberId: string;
  date: DateKey;
  /** Each taken 15-min slot → the booking that occupies it. */
  booked: ReadonlyMap<TimeString, string>;
  /** Slots the barber or owner blocked. */
  blocked: ReadonlySet<TimeString>;
}

/** A start time for "Any barber": available if at least one barber is free then. */
export interface AnyStartTimeOption extends StartTimeOption {
  /** The barbers free for the whole service from this time, in display order. */
  freeBarberIds: string[];
}

/** What the booking page sends (or a walk-in): `barberId` null means "Any barber". */
export interface ShopBookingRequest {
  name: string;
  /** Normalized, e.g. "+96170123456". Null only for walk-ins without a phone. */
  phone: string | null;
  service: Service;
  date: DateKey;
  startTime: TimeString;
  barberId: string | null;
}

/** Shown on the confirmation screen and in the WhatsApp message. */
export interface ShopConfirmedBooking extends ConfirmedBooking {
  barberId: string;
  barberName: string;
  /** The customer chose "Any barber" and was given this one. */
  anyBarber: boolean;
}

/** One of the signed-in customer's bookings, on the "My bookings" page. */
export interface ShopCustomerBooking extends CustomerBooking {
  barberName: string;
}

/** A booking as staff see it on the dashboard. */
export interface ShopStaffBooking extends AdminBooking {
  barberId: string;
  barberName: string;
  anyBarber: boolean;
}

export type StaffRole = 'owner' | 'barber';

/** A staff login (staff/{uid}). */
export interface StaffMember {
  uid: string;
  username: string;
  /** The barber this login acts as; the owner is a barber too. */
  barberId: string;
  role: StaffRole;
  active: boolean;
}
