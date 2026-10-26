/**
 * A demo shop for the emulators (`npm run seed`, through scripts/seed.mjs): an owner who is also
 * a barber, 5 more barbers with different hours, logins for all of them, bookings today (around
 * the time it's run, for the staff dashboard) and on the next open day, and some blocked time.
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
import { overlaps, weekdayIndex } from '../src/lib/schedule';
import { slotsNeeded } from '../src/lib/slots';
import { addDays, minutesToTime, timeToMinutes, zonedInstant } from '../src/lib/time';
import type { Barber, BookingStatus, DayHours, Service, ShopSettings } from '../src/types';

const PROJECT_ID = 'demo-barbershop';
const AUTH_URL = 'http://127.0.0.1:9099';
export const DEMO_PASSWORD = 'password1';

const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: SHOP_TIME_ZONE }).format(new Date());
const MONDAY = 0;
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
  // Not on Mondays, and finishes at 15:00.
  { id: 'elie', name: 'Elie', active: true, order: 5, daysOff: [], weeklyHours: hours((d, i) => ({ end: '15:00', closed: d.closed || i === MONDAY })) },
];

export const LOGINS = [
  { username: 'tony', barberId: 'tony', role: 'owner' },
  { username: 'karim', barberId: 'karim', role: 'barber' },
  { username: 'sami', barberId: 'sami', role: 'barber' },
  { username: 'omar', barberId: 'omar', role: 'barber' },
  { username: 'fadi', barberId: 'fadi', role: 'barber' },
  { username: 'elie', barberId: 'elie', role: 'barber' },
];

const service = (id: string): Service => SHOP.services.find((s) => s.id === id)!;

interface DemoBooking {
  code: string;
  barberId: string;
  date: string;
  time: string;
  service: Service;
  name: string;
  phone: string | null;
  status?: BookingStatus;
}

const BOOKINGS: DemoBooking[] = [
  { code: 'DEM2AA', barberId: 'tony', date: DEMO_DAY, time: '10:00', service: service('haircut'), name: 'Rami', phone: '+96170111111' },
  { code: 'DEM2BB', barberId: 'karim', date: DEMO_DAY, time: '10:00', service: service('haircut-beard'), name: 'Sara', phone: '+96170222222' },
  { code: 'DEM2CC', barberId: 'karim', date: DEMO_DAY, time: '11:00', service: service('beard'), name: 'Nadim', phone: '+96170333333' },
  { code: 'DEM2DD', barberId: 'sami', date: DEMO_DAY, time: '12:30', service: service('haircut'), name: 'Walk-in', phone: null },
];

/** Minutes since midnight now, in the shop's time zone, rounded up to the 15-min grid. */
function nowOnGrid(): number {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: SHOP_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(new Date())
    .split(':')
    .map(Number);
  return Math.ceil((h * 60 + m) / 15) * 15;
}

/**
 * Today's bookings, placed around the time the seed runs (minutes from now), so the staff
 * dashboard's Today view has something earlier, up next and later whenever it's tried. Karim
 * gets a full day (done, no-show, up next, a walk-in, a cancelled one); Tony and Sami a few, to
 * check each barber sees only his own. Times outside the day or in a break are left out.
 */
function todaysBookings(): DemoBooking[] {
  const base = nowOnGrid();
  const plan: [string, string, number, string, string, string | null, BookingStatus][] = [
    ['TDK2AA', 'karim', -150, 'haircut', 'Georges', '+96170444444', 'done'],
    ['TDK2BB', 'karim', -90, 'beard', 'Hadi', '+96170555555', 'no-show'],
    ['TDK2CC', 'karim', -45, 'haircut', 'Joe', '+96170666666', 'booked'],
    ['TDK2DD', 'karim', 15, 'haircut-beard', 'Maya', '+96170777777', 'booked'],
    ['TDK2EE', 'karim', 75, 'haircut', 'Walk-in Ali', null, 'booked'],
    ['TDK2FF', 'karim', 135, 'beard', 'Ziad', '+96170888888', 'booked'],
    ['TDK2GG', 'karim', 270, 'haircut', 'Lina', '+96170999999', 'cancelled'],
    ['TDT2AA', 'tony', 30, 'haircut', 'Charbel', '+96171222222', 'booked'],
    ['TDT2BB', 'tony', 120, 'haircut-beard', 'Rita', '+96171333333', 'booked'],
    ['TDS2AA', 'sami', 15, 'haircut', 'Samir', '+96171444444', 'booked'],
  ];
  const weekday = weekdayIndex(TODAY);
  return plan.flatMap(([code, barberId, offset, serviceId, name, phone, status]) => {
    const s = service(serviceId);
    const start = base + offset;
    const end = start + s.durationMinutes;
    const breaks = BARBERS.find((b) => b.id === barberId)!.weeklyHours[weekday].breaks;
    const inBreak = breaks.some((b) => overlaps(start, end, timeToMinutes(b.start), timeToMinutes(b.end)));
    if (start < 0 || end > 24 * 60 || inBreak) return [];
    return [{ code, barberId, date: TODAY, time: minutesToTime(start), service: s, name, phone, status }];
  });
}

/** Karim's blocked time today: 3 to 4 hours from now, if that's still today. */
function todaysBlock(): string[] {
  const start = nowOnGrid() + 180;
  return start + 60 <= 24 * 60 ? slotsNeeded(minutesToTime(start), 60) : [];
}

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
      for (const b of [...BOOKINGS, ...todaysBookings()]) {
        const barber = BARBERS.find((x) => x.id === b.barberId)!;
        const status = b.status ?? 'booked';
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
          status,
          createdAt: now,
          customerUid: null,
          customerEmail: null,
          barberId: barber.id,
          barberName: barber.name,
          anyBarber: false,
          phoneSeat: null,
          accountSeat: null,
        });
        // A cancelled booking has freed its slots; done and no-show ones keep them.
        if (status === 'cancelled') continue;
        for (const t of slotsNeeded(b.time, b.service.durationMinutes)) dayOf(b.barberId, b.date).booked[slotKey(t)] = b.code;
      }
      for (const t of slotsNeeded('16:00', 60)) dayOf('sami', DEMO_DAY).blocked[slotKey(t)] = true;
      for (const t of todaysBlock()) dayOf('karim', TODAY).blocked[slotKey(t)] = true;
      for (const [id, day] of days) {
        const [barberId, date] = id.split('_');
        await setDoc(doc(db, 'days', id), { barberId, date, ...day, lastBookingId: 'seed', bookingAt: now });
      }
    });
  } finally {
    await env.cleanup();
  }
  console.log(`Demo shop ready (today ${TODAY} and ${DEMO_DAY} have bookings).`);
  console.log(`Staff logins, password "${DEMO_PASSWORD}": ${LOGINS.map((l) => `${l.username} (${l.role})`).join(', ')}`);
}
