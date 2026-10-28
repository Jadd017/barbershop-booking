import { afterEach, describe, expect, it } from 'vitest';
import i18n from '../i18n';
import type { Service } from '../types';
import { bookingServiceName, localServiceName } from './shop';
import { bookingMessage } from './whatsapp';

const SERVICES: Service[] = [
  { id: 'haircut', name: 'Haircut', nameAr: 'قص شعر', durationMinutes: 30 },
  { id: 'beard', name: 'Beard', durationMinutes: 15 },
];

afterEach(() => i18n.changeLanguage('en'));

describe('service names in Arabic', () => {
  it('shows the Arabic name in Arabic, and the English name otherwise or without one', async () => {
    expect(localServiceName(SERVICES[0])).toBe('Haircut');
    await i18n.changeLanguage('ar');
    expect(localServiceName(SERVICES[0])).toBe('قص شعر');
    expect(localServiceName(SERVICES[1])).toBe('Beard');
  });

  it("finds a booking's Arabic name by its service ID, else keeps the name it was booked with", async () => {
    const booking = { serviceId: 'haircut', serviceName: 'Old haircut name' };
    expect(bookingServiceName(booking, SERVICES)).toBe('Old haircut name');
    await i18n.changeLanguage('ar');
    expect(bookingServiceName(booking, SERVICES)).toBe('قص شعر');
    expect(bookingServiceName({ serviceId: 'beard', serviceName: 'Beard' }, SERVICES)).toBe('Beard');
    expect(bookingServiceName({ serviceId: 'gone', serviceName: 'Shave' }, SERVICES)).toBe('Shave');
    expect(bookingServiceName({ serviceName: 'Haircut', serviceNameAr: 'حلاقة' }, [])).toBe('حلاقة');
  });

  it('the WhatsApp message names the service in the language it was booked in', async () => {
    const booking = {
      bookingCode: 'K7M2QX', name: 'Rami', serviceName: 'Haircut', serviceNameAr: 'قص شعر', durationMinutes: 30,
      date: '2026-10-26', startTime: '11:00', barberId: 'karim', barberName: 'Karim', anyBarber: false,
    };
    expect(bookingMessage(booking, 'Shop')).toContain('Service: Haircut (30 min)');
    await i18n.changeLanguage('ar');
    expect(bookingMessage(booking, 'Shop')).toContain('قص شعر');
  });
});
