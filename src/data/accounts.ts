/**
 * Staff logins: username + password on top of Firebase email/password, all on the free plan
 * (docs/ARCHITECTURE.md, 5).
 *
 * - Each login's email is internal and never mailed: "<username>.<4 random chars>@staff.invalid".
 *   usernames/{username} says which login (uid + email) a username signs in as right now.
 * - staff/{uid}: {username, barberId, role, active}. Only the owner writes it; the rules deny
 *   everything to a login that isn't active.
 * - The owner creates logins on a second, throw-away Firebase app, so he stays signed in.
 * - Nobody can set another user's password without a server, so a forgotten password is a "new
 *   login": same username and barber, new password, and the old login is turned off.
 */
import { deleteApp, initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  inMemoryPersistence,
  initializeAuth,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import type { StaffMember, StaffRole } from '../types';
import { OwnAccountError, UsernameTakenError, WrongLoginError } from './errors';
import { AUTH_EMULATOR_URL, firebaseConfig, useEmulator } from './firebase';
import { barberRef } from './shop';
import type { Store } from './store';

export const MIN_PASSWORD_LENGTH = 8;

const staffRef = (db: Firestore, uid: string) => doc(db, 'staff', uid);
const usernameRef = (db: Firestore, username: string) => doc(db, 'usernames', username);

/** Shape of a document in the "staff" collection. */
interface StaffDoc {
  username: string;
  barberId: string;
  role: StaffRole;
  active: boolean;
}

/** What a username is typed as: trimmed, lower case. */
export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

/** What's wrong with a (normalized) username; empty if it can be used. Same as firestore.rules. */
export function usernameErrors(username: string): string[] {
  return /^[a-z0-9]{3,20}$/.test(username)
    ? []
    : ['A username is 3 to 20 letters (a–z) and digits, without spaces.'];
}

/** What's wrong with a new password; empty if it can be used. */
export function passwordErrors(password: string): string[] {
  return password.length >= MIN_PASSWORD_LENGTH
    ? []
    : [`A password needs at least ${MIN_PASSWORD_LENGTH} characters.`];
}

/** 4 random lower-case letters and digits, for internal emails and app names. */
function randomSuffix(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(4)), (n) => chars[n % chars.length]).join('');
}

/** A new login's internal email (validLogin in firestore.rules checks the same shape). */
export function newLoginEmail(username: string): string {
  return `${username}.${randomSuffix()}@staff.invalid`;
}

/**
 * Signs staff in with their username: looks up the login it points at, then signs in with
 * Firebase on `auth`. WrongLoginError for an unknown username or a wrong password.
 */
export async function signInStaff(
  { db }: Store,
  auth: Auth,
  username: string,
  password: string,
): Promise<User> {
  const snap = await getDoc(usernameRef(db, normalizeUsername(username)));
  const email = snap.get('email') as string | undefined;
  if (!email) throw new WrongLoginError();
  try {
    return (await signInWithEmailAndPassword(auth, email, password)).user;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
      throw new WrongLoginError();
    }
    throw err;
  }
}

/** Creates a Firebase email/password user and returns its UID, without signing anyone in here. */
export type CreateAuthUser = (email: string, password: string) => Promise<string>;

/**
 * Creates the user on a second Firebase app, which signs in as the new user instead of the
 * owner, then signs it out and deletes that app. The owner's own session is never touched.
 */
export const createAuthUserOnSecondApp: CreateAuthUser = async (email, password) => {
  const app = initializeApp(firebaseConfig, `account-creator-${randomSuffix()}`);
  try {
    const auth = initializeAuth(app, { persistence: inMemoryPersistence });
    if (useEmulator) connectAuthEmulator(auth, AUTH_EMULATOR_URL, { disableWarnings: true });
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    await signOut(auth);
    return user.uid;
  } finally {
    await deleteApp(app);
  }
};

/**
 * Owner only: a new barber login for `barberId`. Throws UsernameTakenError if the username is
 * used already (by any login, on or off). Returns the new login's UID.
 */
export async function createLogin(
  { db }: Store,
  login: { username: string; password: string; barberId: string },
  createAuthUser: CreateAuthUser = createAuthUserOnSecondApp,
): Promise<string> {
  const username = normalizeUsername(login.username);
  if ((await getDoc(usernameRef(db, username))).exists()) throw new UsernameTakenError();
  const email = newLoginEmail(username);
  // If the writes below fail, this Auth user has no staff doc, so no access at all; the random
  // email means trying again doesn't collide with it.
  const uid = await createAuthUser(email, login.password);
  const batch = writeBatch(db);
  batch.set(staffRef(db, uid), {
    username,
    barberId: login.barberId,
    role: 'barber',
    active: true,
    createdAt: serverTimestamp(),
  });
  batch.set(usernameRef(db, username), { uid, email });
  await batch.commit();
  return uid;
}

/**
 * Owner only, for a forgotten password: a new login with the same username for the same barber,
 * with `password`, and the old login turned off, in one write. Returns the new login's UID.
 */
export async function newLogin(
  { db }: Store,
  login: { username: string; password: string },
  createAuthUser: CreateAuthUser = createAuthUserOnSecondApp,
): Promise<string> {
  const username = normalizeUsername(login.username);
  const oldUid = (await getDoc(usernameRef(db, username))).get('uid') as string | undefined;
  if (!oldUid) throw new WrongLoginError();
  const old = (await getDoc(staffRef(db, oldUid))).data() as StaffDoc | undefined;
  if (!old) throw new WrongLoginError();
  if (old.role === 'owner') throw new OwnAccountError();

  const email = newLoginEmail(username);
  const uid = await createAuthUser(email, login.password);
  const batch = writeBatch(db);
  batch.update(staffRef(db, oldUid), { active: false });
  batch.set(staffRef(db, uid), {
    username,
    barberId: old.barberId,
    role: 'barber',
    active: true,
    createdAt: serverTimestamp(),
  });
  batch.set(usernameRef(db, username), { uid, email });
  await batch.commit();
  return uid;
}

/** Owner only: turns a barber login off or back on. */
export async function setLoginActive({ db }: Store, uid: string, active: boolean): Promise<void> {
  await updateDoc(staffRef(db, uid), { active });
}

/**
 * Owner only: deactivates a barber (customers no longer see or get him) and turns his logins off,
 * in one write. His upcoming bookings stay, for the owner to move or cancel. OwnAccountError for
 * the owner's own barber.
 */
export async function deactivateBarber(store: Store, barberId: string): Promise<void> {
  const { db } = store;
  const me = (await getDoc(staffRef(db, store.auth.currentUser?.uid ?? '-'))).data() as StaffDoc | undefined;
  if (me?.barberId === barberId) throw new OwnAccountError();
  const logins = await getDocs(query(collection(db, 'staff'), where('barberId', '==', barberId)));
  const batch = writeBatch(db);
  batch.update(barberRef(db, barberId), { active: false, updatedAt: serverTimestamp() });
  for (const login of logins.docs) {
    if (login.get('active') === true) batch.update(login.ref, { active: false });
  }
  await batch.commit();
}

function toStaffMember(uid: string, data: StaffDoc): StaffMember {
  return { uid, username: data.username, barberId: data.barberId, role: data.role, active: data.active };
}

/** Listens to the signed-in user's own staff doc: null for a login that isn't staff. */
export function subscribeMyStaff(
  { db }: Store,
  uid: string,
  onChange: (staff: StaffMember | null) => void,
  onError: (error: Error) => void,
): () => void {
  return onSnapshot(
    staffRef(db, uid),
    (snap) => onChange(snap.exists() ? toStaffMember(uid, snap.data() as StaffDoc) : null),
    onError,
  );
}

/** Owner only: listens to every login, on or off, by username. */
export function subscribeStaff(
  { db }: Store,
  onChange: (staff: StaffMember[]) => void,
  onError: (error: Error) => void,
): () => void {
  return onSnapshot(
    collection(db, 'staff'),
    (snapshot) =>
      onChange(
        snapshot.docs
          .map((d) => toStaffMember(d.id, d.data() as StaffDoc))
          .sort((a, b) => a.username.localeCompare(b.username)),
      ),
    onError,
  );
}

/**
 * The signed-in staff member changes their own password. Firebase wants a recent sign-in for
 * that, so it checks the current password first: WrongLoginError if it's wrong.
 */
export async function changeMyPassword(user: User, current: string, next: string): Promise<void> {
  if (!user.email) throw new WrongLoginError();
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
  } catch (err) {
    const code = (err as { code?: string }).code;
    // Which one Firebase sends depends on the project's email enumeration protection setting.
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') throw new WrongLoginError();
    throw err;
  }
  await updatePassword(user, next);
}
