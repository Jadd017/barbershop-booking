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

export interface Booking {
  id: string;
  date: DateKey;
  start: TimeString;
  /** Stored on the booking so later service changes don't affect existing bookings. */
  durationMinutes: number;
  serviceId: string;
}

export interface StartTimeOption {
  time: TimeString;
  available: boolean;
}
