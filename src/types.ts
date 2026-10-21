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

export interface Settings {
  barberName: string;
  workingHours: TimeRange;
  breakTime: TimeRange;
  services: Service[];
}

/** What the customer page sends when booking. */
export interface BookingRequest {
  name: string;
  /** Normalized, e.g. "+96170123456". */
  phone: string;
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

export type BookingStatus = 'booked' | 'cancelled';

/** Shown on the manage page once the code and phone match. */
export interface ManagedBooking {
  bookingCode: string;
  serviceName: string;
  durationMinutes: number;
  date: DateKey;
  startTime: TimeString;
  status: BookingStatus;
}

export interface StartTimeOption {
  time: TimeString;
  available: boolean;
}
