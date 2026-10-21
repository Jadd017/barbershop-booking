import { DAYS_TO_SHOW } from '../config';
import { upcomingDateKeys } from '../lib/time';
import type { Booking, Settings } from '../types';

export const fakeSettings: Settings = {
  barberName: 'Eddy',
  workingHours: { start: '10:00', end: '20:00' },
  breakTime: { start: '14:00', end: '15:00' },
  services: [
    { id: 'haircut', name: 'Haircut', durationMinutes: 30 },
    { id: 'beard', name: 'Beard', durationMinutes: 15 },
    { id: 'haircut-beard', name: 'Haircut + Beard', durationMinutes: 45 },
  ],
};

// Bookings are generated relative to today so the demo always has data to show.
const days = upcomingDateKeys(DAYS_TO_SHOW);

export const fakeBookings: Booking[] = [
  { id: 'b1', date: days[0], start: '10:30', durationMinutes: 30, serviceId: 'haircut' },
  { id: 'b2', date: days[0], start: '11:00', durationMinutes: 45, serviceId: 'haircut-beard' },
  { id: 'b3', date: days[0], start: '16:15', durationMinutes: 15, serviceId: 'beard' },
  { id: 'b4', date: days[1], start: '10:00', durationMinutes: 30, serviceId: 'haircut' },
  { id: 'b5', date: days[1], start: '13:30', durationMinutes: 30, serviceId: 'haircut' },
  { id: 'b6', date: days[1], start: '17:00', durationMinutes: 45, serviceId: 'haircut-beard' },
  { id: 'b7', date: days[2], start: '12:00', durationMinutes: 15, serviceId: 'beard' },
  { id: 'b8', date: days[2], start: '12:30', durationMinutes: 30, serviceId: 'haircut' },
  { id: 'b9', date: days[2], start: '19:15', durationMinutes: 45, serviceId: 'haircut-beard' },
  { id: 'b10', date: days[3], start: '15:00', durationMinutes: 45, serviceId: 'haircut-beard' },
  { id: 'b11', date: days[3], start: '18:00', durationMinutes: 30, serviceId: 'haircut' },
];
