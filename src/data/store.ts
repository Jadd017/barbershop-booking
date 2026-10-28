import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

/**
 * What the multi-barber data layer (shop.ts, days.ts, bookings.ts, accounts.ts) runs against:
 * a Firestore and whoever is signed in. The app passes its own (`store` in ./firebase.ts); tests
 * pass one per person, so several customers can book at the same moment.
 */
export interface Store {
  db: Firestore;
  /** Only currentUser is read, so tests can pass a stand-in. */
  auth: Pick<Auth, 'currentUser'>;
}
