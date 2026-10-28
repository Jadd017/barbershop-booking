/**
 * The one-time setup of a new shop's Firestore and its owner's login (README, "Adding a new shop";
 * docs/ARCHITECTURE.md, 5.5), with the Firebase Admin SDK: what the rules can't let anyone do,
 * because there's no owner yet to do it. Run through scripts/setup-shop.mjs, which loads this
 * with Vite so it can use the app's own defaults and document shapes.
 *
 * It creates, and never overwrites:
 * - settings/shop: the shop's first name, the default services and opening hours (10:00–20:00
 *   every day, Haircut / Beard / Haircut + Beard), a 4-day booking window, and its WhatsApp number
 *   if given (otherwise the owner adds it in Settings → Shop);
 * - settings/branding: the config logo (if it's small enough) and the default colors;
 * - barbers/{id}: the owner as a barber, working the shop's hours;
 * - the owner's login: an Auth user "<username>.<4 random>@staff.invalid" with the password given,
 *   staff/{uid} (role owner) and usernames/{username}.
 */
import { randomInt } from 'node:crypto';
import type { Auth } from 'firebase-admin/auth';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { MAX_BARBER_NAME_LENGTH, MAX_SHOP_NAME_LENGTH, MIN_BARBER_NAME_LENGTH, MIN_SHOP_NAME_LENGTH } from '../src/config';
import { hoursFromShop, toBarberDoc } from '../src/lib/barberDoc';
import { isLogoDataUrl } from '../src/lib/logo';
import { normalizeLebanesePhone } from '../src/lib/phone';
import { defaultBranding, defaultShopSettings, toBrandingDoc, toShopDoc } from '../src/lib/shopDoc';
import { barberIdFor } from '../src/lib/team';
import type { Barber, ShopSettings } from '../src/types';

export interface SetupInput {
  shopName: string;
  ownerName: string;
  /** The owner's login username (3–20 lower-case letters and digits). */
  username: string;
  /** The shop's WhatsApp number, or empty to add it later in the app. */
  whatsapp: string;
  /** The logo as a data: URL, or null. */
  logo: string | null;
}

/** One document the setup would write: its path and what's in it (for the dry run's listing). */
export interface PlannedDoc {
  path: string;
  data: Record<string, unknown>;
}

export interface SetupPlan {
  /** Why it can't run; empty if it can. */
  problems: string[];
  shop: ShopSettings;
  barber: Barber;
  username: string;
  /** Notes for the person running it (e.g. the logo was too big and is left out). */
  notes: string[];
  /** Everything but the login's staff and username docs, which need the new user's UID. */
  docs: PlannedDoc[];
}

/** The logo file as a data: URL for settings/branding, or null if it's too big for it. */
export function logoDataUrl(png: Buffer): string | null {
  const url = `data:image/png;base64,${png.toString('base64')}`;
  return isLogoDataUrl(url) ? url : null;
}

/** A login's internal email, as src/data/accounts.ts makes them (firestore.rules checks the shape). */
export function loginEmail(username: string): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const suffix = Array.from({ length: 4 }, () => chars[randomInt(chars.length)]).join('');
  return `${username}.${suffix}@staff.invalid`;
}

/**
 * What setting up `input` would write, after reading what's there: refuses (`problems`) if the
 * shop is already set up, the username or barber already exist, or a value is wrong.
 */
export async function planSetup(db: Firestore, input: SetupInput): Promise<SetupPlan> {
  const problems: string[] = [];
  const notes: string[] = [];
  const shopName = input.shopName.trim();
  const ownerName = input.ownerName.trim();
  const username = input.username.trim().toLowerCase();
  const whatsapp = input.whatsapp.trim() ? normalizeLebanesePhone(input.whatsapp) : '';

  if (shopName.length < MIN_SHOP_NAME_LENGTH || shopName.length > MAX_SHOP_NAME_LENGTH) {
    problems.push(`The shop name must be ${MIN_SHOP_NAME_LENGTH} to ${MAX_SHOP_NAME_LENGTH} characters (VITE_SHOP_NAME).`);
  }
  if (ownerName.length < MIN_BARBER_NAME_LENGTH || ownerName.length > MAX_BARBER_NAME_LENGTH) {
    problems.push(`The owner's name must be ${MIN_BARBER_NAME_LENGTH} to ${MAX_BARBER_NAME_LENGTH} characters (--owner-name).`);
  }
  if (!/^[a-z0-9]{3,20}$/.test(username)) {
    problems.push('The username must be 3 to 20 letters (a–z) and digits, without spaces (--username).');
  }
  if (whatsapp === null) problems.push('The WhatsApp number must be a Lebanese mobile number (--whatsapp).');
  if (!input.logo) notes.push('No logo in settings/branding (missing or over 100 KB): the owner can upload one in Settings → Shop.');
  if (!whatsapp) notes.push("No WhatsApp number yet: customers can't send their bookings until the owner adds it in Settings → Shop.");

  const shop: ShopSettings = { ...defaultShopSettings(shopName), whatsapp: whatsapp ?? '' };
  const barber: Barber = {
    id: barberIdFor(ownerName, []),
    name: ownerName,
    active: true,
    order: 0,
    weeklyHours: hoursFromShop(shop.openingHours),
    daysOff: [],
  };

  const [shopSnap, usernameSnap, barberSnap, staffSnap] = await Promise.all([
    db.doc('settings/shop').get(),
    username ? db.doc(`usernames/${username}`).get() : null,
    db.doc(`barbers/${barber.id}`).get(),
    db.collection('staff').where('role', '==', 'owner').limit(1).get(),
  ]);
  if (shopSnap.exists) problems.push('This project is already set up (settings/shop exists). The setup only runs once.');
  if (!staffSnap.empty) problems.push('This project already has an owner (staff with role owner).');
  if (usernameSnap?.exists) problems.push(`The username "${username}" is already taken.`);
  if (barberSnap.exists) problems.push(`A barber "${barber.id}" already exists.`);

  return {
    problems,
    shop,
    barber,
    username,
    notes,
    docs: [
      { path: 'settings/shop', data: toShopDoc(shop) as unknown as Record<string, unknown> },
      { path: 'settings/branding', data: toBrandingDoc(defaultBranding(input.logo)) as unknown as Record<string, unknown> },
      { path: `barbers/${barber.id}`, data: toBarberDoc(barber) as unknown as Record<string, unknown> },
    ],
  };
}

/**
 * Writes `plan` (from planSetup, with no problems) and creates the owner's login with `password`.
 * The Auth user comes first: if the writes then fail, it has no staff doc and so no access, and
 * running the setup again makes a new one (the random email suffix never collides).
 * Returns the owner's UID.
 */
export async function applySetup(db: Firestore, auth: Auth, plan: SetupPlan, password: string): Promise<string> {
  if (plan.problems.length) throw new Error(`Setup refused: ${plan.problems.join(' ')}`);
  if (password.length < 8) throw new Error('The password needs at least 8 characters.');
  const email = loginEmail(plan.username);
  const { uid } = await auth.createUser({ email, password });
  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  for (const { path, data } of plan.docs) batch.create(db.doc(path), { ...data, updatedAt: now });
  batch.create(db.doc(`staff/${uid}`), {
    username: plan.username,
    barberId: plan.barber.id,
    role: 'owner',
    active: true,
    createdAt: now,
  });
  batch.create(db.doc(`usernames/${plan.username}`), { uid, email });
  await batch.commit();
  return uid;
}
