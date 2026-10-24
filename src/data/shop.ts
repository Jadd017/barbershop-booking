/**
 * The shop's settings, branding and barbers (docs/ARCHITECTURE.md, 4.1–4.3).
 *
 * - settings/shop and settings/branding: everyone reads them live; only the owner writes them.
 *   Both are created the first time the owner opens a new shop's dashboard (ensureShop), with
 *   the name and logo from the shop's config file.
 * - barbers/{barberId}: everyone reads them; the owner writes everything, a barber only his own
 *   hours and days off (saveMySchedule).
 *
 * firestore.rules re-checks everything written here, so keep the two in step.
 */
import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { fromBarberDoc, sortBarbers, toBarberDoc, type BarberDoc } from '../lib/barberDoc';
import { hoursOutsideShop, trimToShopHours } from '../lib/barberSchedule';
import {
  dayHoursToDoc,
  defaultBranding,
  defaultShopSettings,
  fromBrandingDoc,
  fromShopDoc,
  toBrandingDoc,
  toShopDoc,
  type BrandingDoc,
  type ShopDoc,
} from '../lib/shopDoc';
import type { Barber, Branding, DateKey, DayHours, ShopSettings } from '../types';
import { BarberExistsError } from './errors';
import type { Store } from './store';

const shopRef = (db: Firestore) => doc(db, 'settings', 'shop');
const brandingRef = (db: Firestore) => doc(db, 'settings', 'branding');
export const barberRef = (db: Firestore, barberId: string) => doc(db, 'barbers', barberId);

/**
 * Listens to settings/shop. Calls `onChange` with null while it doesn't exist yet (until the
 * owner first opens the dashboard). Returns a function that stops listening.
 */
export function subscribeShop(
  { db }: Store,
  onChange: (shop: ShopSettings | null) => void,
  onError: (error: Error) => void,
): () => void {
  return onSnapshot(
    shopRef(db),
    (snap) => onChange(snap.exists() ? fromShopDoc(snap.data() as ShopDoc) : null),
    onError,
  );
}

/** Listens to settings/branding; null while it doesn't exist yet. */
export function subscribeBranding(
  { db }: Store,
  onChange: (branding: Branding | null) => void,
  onError: (error: Error) => void,
): () => void {
  return onSnapshot(
    brandingRef(db),
    (snap) => onChange(snap.exists() ? fromBrandingDoc(snap.data() as BrandingDoc) : null),
    onError,
  );
}

/** Listens to every barber, active or not, in display order. */
export function subscribeBarbers(
  { db }: Store,
  onChange: (barbers: Barber[]) => void,
  onError: (error: Error) => void,
): () => void {
  return onSnapshot(
    collection(db, 'barbers'),
    (snapshot) =>
      onChange(sortBarbers(snapshot.docs.map((d) => fromBarberDoc(d.id, d.data() as BarberDoc)))),
    onError,
  );
}

/**
 * Owner only: creates settings/shop and settings/branding if they don't exist yet, from the
 * shop's config file (`shopName`, and its logo already compressed, or null).
 */
export async function ensureShop({ db }: Store, shopName: string, logo: string | null): Promise<void> {
  await runTransaction(db, async (tx) => {
    const [shop, branding] = await Promise.all([tx.get(shopRef(db)), tx.get(brandingRef(db))]);
    if (!shop.exists()) {
      tx.set(shopRef(db), { ...toShopDoc(defaultShopSettings(shopName)), updatedAt: serverTimestamp() });
    }
    if (!branding.exists()) {
      tx.set(brandingRef(db), { ...toBrandingDoc(defaultBranding(logo)), updatedAt: serverTimestamp() });
    }
  });
}

/** Owner only: replaces the shop's settings. Bookings and barbers are never touched. */
export async function saveShop({ db }: Store, shop: ShopSettings): Promise<void> {
  await setDoc(shopRef(db), { ...toShopDoc(shop), updatedAt: serverTimestamp() });
}

/** Owner only: replaces the logo and colors (a null logo shows the shop name only). */
export async function saveBranding({ db }: Store, branding: Branding): Promise<void> {
  await setDoc(brandingRef(db), { ...toBrandingDoc(branding), updatedAt: serverTimestamp() });
}

/** Owner only: adds a new barber. Throws BarberExistsError if his ID is already used. */
export async function addBarber({ db }: Store, barber: Barber): Promise<void> {
  await runTransaction(db, async (tx) => {
    if ((await tx.get(barberRef(db, barber.id))).exists()) throw new BarberExistsError();
    tx.set(barberRef(db, barber.id), { ...toBarberDoc(barber), updatedAt: serverTimestamp() });
  });
}

/** Owner only: replaces a barber (name, active, order, hours, days off). */
export async function saveBarber({ db }: Store, barber: Barber): Promise<void> {
  await setDoc(barberRef(db, barber.id), { ...toBarberDoc(barber), updatedAt: serverTimestamp() });
}

/** The barber himself (or the owner): his weekly hours, breaks and days off. */
export async function saveMySchedule(
  { db }: Store,
  barberId: string,
  weeklyHours: DayHours[],
  daysOff: DateKey[],
): Promise<void> {
  await updateDoc(barberRef(db, barberId), {
    weeklyHours: weeklyHours.map(dayHoursToDoc),
    daysOff: [...daysOff].sort(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Owner only, after narrowing the shop's opening hours: cuts every barber's hours that stick out
 * to fit (trimToShopHours). Returns the IDs of the barbers it changed.
 */
export async function trimBarbersToShop(
  { db }: Store,
  shop: ShopSettings,
  barbers: Barber[],
): Promise<string[]> {
  const outside = barbers.filter((b) => hoursOutsideShop(b.weeklyHours, shop.openingHours).length);
  if (outside.length === 0) return [];
  const batch = writeBatch(db);
  for (const barber of outside) {
    batch.update(barberRef(db, barber.id), {
      weeklyHours: trimToShopHours(barber.weeklyHours, shop.openingHours).map(dayHoursToDoc),
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
  return outside.map((b) => b.id);
}
