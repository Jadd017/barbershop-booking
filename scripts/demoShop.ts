/**
 * A demo shop for the emulators (`npm run seed`, through scripts/seed.mjs): an owner, 4 barbers
 * with different hours, logins for all of them, a few bookings and some blocked time.
 *
 * Emulator only: it writes with @firebase/rules-unit-testing (which only talks to the emulator)
 * to the demo-barbershop project, and creates logins through the Auth emulator's REST API.
 * Everything already in the emulators is wiped first.
 */
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, Timestamp, type Firestore } from 'firebase/firestore';
import { SHOP_TIME_ZONE } from '../src/config';
import { dayDocId, hoursFromShop, slotKey, toBarberDoc } from '../src/lib/barberDoc';
import { defaultBranding, defaultShopSettings, toBrandingDoc, toShopDoc } from '../src/lib/shopDoc';
import { weekdayIndex } from '../src/lib/schedule';
import { slotsNeeded } from '../src/lib/slots';
import { addDays, zonedInstant } from '../src/lib/time';
import type { Barber, DayHours, Service, ShopSettings } from '../src/types';

const PROJECT_ID = 'demo-barbershop';
const AUTH_URL = 'http://127.0.0.1:9099';
export const DEMO_PASSWORD = 'password1';

const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: SHOP_TIME_ZONE }).format(new Date());
const SUNDAY = 6;
/** The demo's bookings are on the next day the shop is open (it's closed on Sundays). */
export const DEMO_DAY = weekdayIndex(addDays(TODAY, 1)) === SUNDAY ? addDays(TODAY, 2) : addDays(TODAY, 1);

const SHOP: ShopSettings = {
  ...defaultShopSettings('Demo Barbershop'),
  // Closed on Sundays.
  openingHours: defaultShopSettings('').openingHours.map((d, i) => (i === SUNDAY ? { ...d, closed: true } : d)),
  whatsapp: '+96171000000',
  shopAddress: 'Demo Street, Beirut',
};

function hours(change: (d: DayHours, weekday: number) => Partial<DayHours> = () => ({})): DayHours[] {
  return hoursFromShop(SHOP.openingHours).map((d, i) => ({ ...d, ...change(d, i) }));
}

const BARBERS: Barber[] = [
  // The owner, also a barber.
  { id: 'tony', name: 'Tony', active: true, order: 0, daysOff: [], weeklyHours: hours(() => ({ breaks: [{ start: '14:00', end: '15:00' }] })) },
  { id: 'karim', name: 'Karim Haddad', active: true, order: 1, daysOff: [], weeklyHours: hours(() => ({ breaks: [{ start: '13:00', end: '13:30' }, { start: '17:00', end: '17:15' }] })) },
  // Afternoons only.
  { id: 'sami', name: 'Sami', active: true, order: 2, daysOff: [], weeklyHours: hours((_, i) => ({ start: '12:00', closed: i === SUNDAY })) },
  { id: 'omar', name: 'Omar', active: true, order: 3, daysOff: [DEMO_DAY], weeklyHours: hours() },
  { id: 'fadi', name: 'Fadi', active: true, order: 4, daysOff: [], weeklyHours: hours(() => ({ end: '18:00' })) },
];

const LOGINS = [
  { username: 'tony', barberId: 'tony', role: 'owner' },
  { username: 'karim', barberId: 'karim', role: 'barber' },
  { username: 'sami', barberId: 'sami', role: 'barber' },
  { username: 'omar', barberId: 'omar', role: 'barber' },
  { username: 'fadi', barberId: 'fadi', role: 'barber' },
];

const service = (id: string): Service => SHOP.services.find((s) => s.id === id)!;

const BOOKINGS = [
  { code: 'DEM2AA', barberId: 'tony', date: DEMO_DAY, time: '10:00', service: service('haircut'), name: 'Rami', phone: '+96170111111' },
  { code: 'DEM2BB', barberId: 'karim', date: DEMO_DAY, time: '10:00', service: service('haircut-beard'), name: 'Sara', phone: '+96170222222' },
  { code: 'DEM2CC', barberId: 'karim', date: DEMO_DAY, time: '11:00', service: service('beard'), name: 'Nadim', phone: '+96170333333' },
  { code: 'DEM2DD', barberId: 'sami', date: DEMO_DAY, time: '12:30', service: service('haircut'), name: 'Walk-in', phone: null },
];

/** Creates an Auth emulator user and returns its UID. */
async function createUser(email: string): Promise<string> {
  const res = await fetch(`${AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: DEMO_PASSWORD, returnSecureToken: true }),
  });
  if (!res.ok) throw new Error(`Auth emulator: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { localId: string }).localId;
}

export async function seedDemoShop(): Promise<void> {
  const env = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { host: '127.0.0.1', port: 8080 } });
  try {
    await env.clearFirestore();
    await fetch(`${AUTH_URL}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: 'DELETE' });

    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore() as unknown as Firestore;
      const now = Timestamp.now();
      await setDoc(doc(db, 'settings', 'shop'), { ...toShopDoc(SHOP), updatedAt: now });
      await setDoc(doc(db, 'settings', 'branding'), { ...toBrandingDoc(defaultBranding(null)), updatedAt: now });
      for (const b of BARBERS) await setDoc(doc(db, 'barbers', b.id), { ...toBarberDoc(b), updatedAt: now });

      for (const login of LOGINS) {
        const email = `${login.username}.demo@staff.invalid`;
        const uid = await createUser(email);
        await setDoc(doc(db, 'staff', uid), { ...login, active: true, createdAt: now });
        await setDoc(doc(db, 'usernames', login.username), { uid, email });
      }

      const days = new Map<string, { booked: Record<string, string>; blocked: Record<string, true> }>();
      const dayOf = (barberId: string, date: string) => {
        const id = dayDocId(barberId, date);
        if (!days.has(id)) days.set(id, { booked: {}, blocked: {} });
        return days.get(id)!;
      };
      for (const b of BOOKINGS) {
        const barber = BARBERS.find((x) => x.id === b.barberId)!;
        await setDoc(doc(db, 'bookings', b.code), {
          name: b.name,
          phone: b.phone,
          serviceId: b.service.id,
          serviceName: b.service.name,
          date: b.date,
          startTime: b.time,
          startAt: Timestamp.fromDate(zonedInstant(b.date, b.time, SHOP_TIME_ZONE)),
          durationMinutes: b.service.durationMinutes,
          bookingCode: b.code,
          status: 'booked',
          createdAt: now,
          customerUid: null,
          customerEmail: null,
          barberId: barber.id,
          barberName: barber.name,
          anyBarber: false,
          phoneSeat: null,
          accountSeat: null,
        });
        for (const t of slotsNeeded(b.time, b.service.durationMinutes)) dayOf(b.barberId, b.date).booked[slotKey(t)] = b.code;
      }
      for (const t of slotsNeeded('16:00', 60)) dayOf('sami', DEMO_DAY).blocked[slotKey(t)] = true;
      for (const [id, day] of days) {
        const [barberId, date] = id.split('_');
        await setDoc(doc(db, 'days', id), { barberId, date, ...day, lastBookingId: 'seed', bookingAt: now });
      }
    });
  } finally {
    await env.cleanup();
  }
  console.log(`Demo shop ready (${DEMO_DAY} has bookings).`);
  console.log(`Staff logins, password "${DEMO_PASSWORD}": ${LOGINS.map((l) => `${l.username} (${l.role})`).join(', ')}`);
}
