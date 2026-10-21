/**
 * Customer sign-in with Google. Eddy's email/password login (components/admin/LoginForm.tsx)
 * uses the same Firebase Auth, but his account isn't a Google one, so it never counts as a
 * customer here, and a Google customer is "Not authorized" on /admin.
 */
import { FirebaseError } from 'firebase/app';
import {
  getRedirectResult,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import { clearLastBooking } from '../lib/lastBooking';
import { clearPendingBooking } from '../lib/pendingBooking';
import { auth } from './firebase';

const provider = new GoogleAuthProvider();
// Lets someone on a shared phone pick their own account instead of being signed in silently.
provider.setCustomParameters({ prompt: 'select_account' });

/** True for a customer signed in with Google, as opposed to Eddy's email/password account. */
export function isGoogleUser(user: User | null): user is User {
  return !!user?.providerData.some((p) => p.providerId === 'google.com');
}

/** Popup failures where a full-page redirect still works (blocked popups, home-screen apps). */
const REDIRECT_INSTEAD = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
]);

/**
 * Signs in with Google. Must be called straight from a tap (before any other await),
 * or mobile browsers block the popup.
 *
 * The popup works in mobile Safari and Chrome too (it opens as a new tab and comes back).
 * Where it can't open, this falls back to a full-page redirect: the page then reloads
 * signed in, so anything the customer chose must be saved first (lib/pendingBooking.ts).
 *
 * Resolves 'signed-in' when done, or 'redirecting' when the page is about to leave.
 * Rejects with a FirebaseError otherwise (see signInErrorMessage).
 */
export async function signInWithGoogle(): Promise<'signed-in' | 'redirecting'> {
  try {
    await signInWithPopup(auth, provider);
    return 'signed-in';
  } catch (err) {
    if (!(err instanceof FirebaseError) || !REDIRECT_INSTEAD.has(err.code)) throw err;
    await signInWithRedirect(auth, provider);
    return 'redirecting';
  }
}

/**
 * Call once when the page loads: rejects if a redirect sign-in just failed.
 * A successful one shows up through onAuthStateChanged like any other sign-in.
 */
export function finishRedirectSignIn(): Promise<unknown> {
  return getRedirectResult(auth);
}

/** What to tell the customer when sign-in fails, or null if they just closed the window. */
export function signInErrorMessage(err: unknown): string | null {
  const code = err instanceof FirebaseError ? err.code : '';
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled':
      return null;
    case 'auth/network-request-failed':
      return 'No connection. Check your internet and try again.';
    case 'auth/unauthorized-domain':
      console.error(err);
      return 'Google sign-in is not set up for this website yet. Please tell the shop.';
    default:
      console.error(err);
      return isInAppBrowser()
        ? "Google sign-in doesn't work inside this app. Open this page in Chrome or Safari."
        : "Couldn't sign in with Google. Please try again.";
  }
}

/**
 * Browsers built into apps (Instagram, Facebook, TikTok, Android web views…), where Google
 * refuses to sign in. Best effort: the user agent is all there is to go on.
 */
export function isInAppBrowser(): boolean {
  return /FBAN|FBAV|Instagram|Line\/|TikTok|musical_ly|Snapchat|; wv\)/i.test(navigator.userAgent);
}

/** Signs the customer out and forgets what this device remembered for them. */
export function signOutCustomer(): Promise<void> {
  clearLastBooking();
  clearPendingBooking();
  return signOut(auth);
}
