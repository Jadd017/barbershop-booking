import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import type { Store } from './store';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const missing = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);
if (missing.length > 0) {
  throw new Error(
    `Missing Firebase config: ${missing.join(', ')}. Copy .env.example to .env.local and fill it in.`,
  );
}

// .env.emulator: everything goes to the local emulators (`npm run emu`). Only "demo-" projects,
// which Firebase never connects to a real project, so this can't touch a live shop's data.
export const useEmulator = import.meta.env.VITE_USE_EMULATOR === 'true';
if (useEmulator !== firebaseConfig.projectId.startsWith('demo-')) {
  throw new Error(
    `Project "${firebaseConfig.projectId}" with VITE_USE_EMULATOR=${useEmulator}: the emulator needs a demo- project, and a demo- project needs the emulator.`,
  );
}

/** Where `npm run emu` serves Auth (ports from firebase.json). */
export const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';

const app = initializeApp(firebaseConfig);

// App Check proves requests come from this site (via reCAPTCHA), not a script using the API key.
// Must start before Firestore is used. See docs/DEVELOPMENT.md, "App Check".
// The emulators don't check App Check tokens, so it stays off there.
const recaptchaKey = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_KEY;
if (useEmulator) {
  console.info('Using the Firebase emulators (project %s).', firebaseConfig.projectId);
} else if (recaptchaKey) {
  if (import.meta.env.DEV) {
    // reCAPTCHA refuses localhost, so `npm run dev` uses a debug token instead: the one in
    // .env.local if set, otherwise the SDK makes one and logs it ("AppCheck debug token: ...").
    // Either way it must be registered in the Firebase console. Never in production builds.
    (self as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true;
  }
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(recaptchaKey),
    isTokenAutoRefreshEnabled: true,
  });
} else {
  console.warn('App Check is off: VITE_RECAPTCHA_ENTERPRISE_KEY is not set.');
}

export const db = getFirestore(app);
export const auth = getAuth(app);

if (useEmulator) {
  // Ports from firebase.json.
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectAuthEmulator(auth, AUTH_EMULATOR_URL);
}

/** The app's own Firestore and signed-in user, for the multi-barber data layer (./store.ts). */
export const store: Store = { db, auth };
