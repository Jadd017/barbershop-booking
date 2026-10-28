/**
 * English and Arabic. Every string people read is in locales/en.json and locales/ar.json; what
 * the owner types (shop, barber and service names, prices, the address) is shown as typed.
 *
 * English unless the visitor picked Arabic on this device (remembered in localStorage). Arabic
 * turns the page right-to-left and loads the Cairo font. Dates and times follow the language,
 * always with 0–9 digits.
 *
 * Initialized on import, synchronously, so lib/ functions can call `i18n.t` (and unit tests get
 * the English strings) without React.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from '../locales/ar.json';
import en from '../locales/en.json';

export type Language = 'en' | 'ar';

const STORAGE_KEY = 'language';

function storedLanguage(): Language {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'ar' ? 'ar' : 'en';
  } catch {
    // Storage can be unavailable (private mode, blocked site data, unit tests): English.
    return 'en';
  }
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ar: { translation: ar } },
  lng: storedLanguage(),
  fallbackLng: 'en',
  supportedLngs: ['en', 'ar'],
  initAsync: false,
  // React escapes what it renders.
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function currentLanguage(): Language {
  return i18n.language === 'ar' ? 'ar' : 'en';
}

/** The locale dates are formatted in: Lebanese Arabic month names, but 0–9 digits. */
export function dateLocale(): string {
  return currentLanguage() === 'ar' ? 'ar-LB-u-nu-latn' : 'en-US';
}

/**
 * "10:00–20:00". In Arabic it's wrapped in a left-to-right isolate (U+2066 … U+2069): in
 * right-to-left text the browser would otherwise show the end time first ("20:00–10:00"). The
 * Arabic strings wrap their own {{start}}–{{end}} the same way.
 */
export function timeRange(start: string, end: string): string {
  const range = `${start}–${end}`;
  return currentLanguage() === 'ar' ? `⁦${range}⁩` : range;
}

const CAIRO_URL = 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700&display=swap';

/** Adds the Cairo stylesheet once, the first time Arabic is shown. */
function loadCairo() {
  if (typeof document === 'undefined' || document.getElementById('font-cairo')) return;
  const link = document.createElement('link');
  link.id = 'font-cairo';
  link.rel = 'stylesheet';
  link.href = CAIRO_URL;
  document.head.appendChild(link);
}

/** <html lang dir>: everything right-to-left in Arabic (index.css and the rtl: variants follow it). */
function applyToDocument(language: Language) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  if (language === 'ar') loadCairo();
}

applyToDocument(currentLanguage());
i18n.on('languageChanged', () => applyToDocument(currentLanguage()));

/** Switches the language and remembers it on this device. */
export function setLanguage(language: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Not remembered, but it still switches for this visit.
  }
  void i18n.changeLanguage(language);
}

export default i18n;
