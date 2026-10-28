import { describe, expect, it } from 'vitest';
import type { ShopConfirmedBooking } from '../types';
import { bookingMessage, bookingWhatsappLink, movedMessage, whatsappLink } from './whatsapp';

const BOOKING: ShopConfirmedBooking = {
  bookingCode: 'K7M2QX',
  name: 'Rami',
  serviceName: 'Haircut',
  durationMinutes: 30,
  date: '2026-10-26',
  startTime: '11:00',
  barberId: 'karim',
  barberName: 'Karim',
  anyBarber: false,
};

describe('booking WhatsApp message', () => {
  it("goes to the shop's number and names the shop and the barber", () => {
    expect(bookingMessage(BOOKING, 'Sassine Maatouk')).toBe(
      [
        'Hi Sassine Maatouk, I just booked an appointment:',
        'Barber: Karim',
        'Name: Rami',
        'Service: Haircut (30 min)',
        'Day: Monday, October 26',
        'Time: 11:00',
        'Booking code: K7M2QX',
      ].join('\n'),
    );
    expect(bookingWhatsappLink(BOOKING, 'Sassine Maatouk', '+961 71 000 000')).toMatch(
      /^https:\/\/wa\.me\/96171000000\?text=Hi%20Sassine%20Maatouk/,
    );
  });

  it('says when "Any barber" chose him', () => {
    expect(bookingMessage({ ...BOOKING, anyBarber: true }, 'Shop')).toContain('Barber: Karim (any barber)');
  });

  it('a plain chat link has digits only', () => {
    expect(whatsappLink('+961 70-123 456')).toBe('https://wa.me/96170123456');
  });
});

describe('moved booking WhatsApp message', () => {
  it('tells the customer their new barber, day, time and code', () => {
    const moved = {
      ...BOOKING,
      id: 'K7M2QX',
      phone: '+96170111111',
      status: 'booked' as const,
      customerEmail: null,
      barberId: 'sami',
      barberName: 'Sami',
    };
    expect(movedMessage(moved, 'Sassine Maatouk')).toBe(
      'Hi Rami, your booking at Sassine Maatouk on Monday, October 26 at 11:00 is now with Sami. Booking code: K7M2QX',
    );
  });
});
