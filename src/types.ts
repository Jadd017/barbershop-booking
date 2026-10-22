/** Time of day as "HH:MM" (24h). */
export type TimeString = string;

/** Calendar date as "YYYY-MM-DD" (local time). */
export type DateKey = string;

export interface Service {
  id: string;
  name: string;
  durationMinutes: number;
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
}

export type BookingStatus = 'booked' | 'cancelled' | 'done' | 'no-show';

/** One of the signed-in customer's bookings, on the "My bookings" page. */
export interface CustomerBooking {
  bookingCode: string;
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
  serviceName: string;
  durationMinutes: number;
  date: DateKey;
  startTime: TimeString;
  status: BookingStatus;
  /** The Google account that booked; null for walk-ins Eddy added. */
  customerEmail: string | null;
}
