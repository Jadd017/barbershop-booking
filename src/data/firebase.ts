import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
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

const app = initializeApp(firebaseConfig);

// App Check proves requests come from this site (via reCAPTCHA), not a script using the API key.
// Must start before Firestore is used. See README, "App Check".
const recaptchaKey = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_KEY;
if (recaptchaKey) {
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
