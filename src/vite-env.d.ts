interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  /** reCAPTCHA Enterprise site key for App Check (public). Unset: App Check is off. */
  readonly VITE_RECAPTCHA_ENTERPRISE_KEY?: string;
  /** App Check debug token for `npm run dev` only. Secret: .env.local, never committed. */
  readonly VITE_APPCHECK_DEBUG_TOKEN?: string;
  readonly DEV: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
