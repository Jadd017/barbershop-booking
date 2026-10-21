import type { Settings } from '../types';

// Settings and services stay local until they move to Firestore in a later phase.
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
