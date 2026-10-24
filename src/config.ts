/** Size of one time slot on the booking grid, in minutes. */
export const SLOT_MINUTES = 15;

/** Firebase Auth UID of the only user allowed into /admin (Eddy). */
export const ADMIN_UID = 'HHBoRoG4jphMLu2OjKpYTGJTKd42';

/** The shop's time zone. Booking times are local to it, whatever the customer's device says. */
export const SHOP_TIME_ZONE = 'Asia/Beirut';

/** Most upcoming bookings one phone number can hold (enforced by firestore.rules). */
export const MAX_ACTIVE_BOOKINGS_PER_PHONE = 2;

/** Most upcoming bookings one Google account can hold (enforced by firestore.rules). */
export const MAX_ACTIVE_BOOKINGS_PER_ACCOUNT = 2;

/** Longest name a booking can have (enforced by firestore.rules). */
export const MAX_NAME_LENGTH = 50;

/** Most breaks one weekday can have (enforced by firestore.rules). */
export const MAX_BREAKS_PER_DAY = 2;

/** Longest service, in minutes. firestore.rules checks at most this many slots per booking. */
export const MAX_SERVICE_MINUTES = 60;

/** Most special booking periods (firestore.rules checks only this many). */
export const MAX_SPECIAL_PERIODS = 4;

/**
 * Longest special period, in days (start and end included). Keeps settings/shop's periodDays map
 * small: firestore.rules accepts at most MAX_SPECIAL_PERIODS × this many days.
 */
export const MAX_SPECIAL_PERIOD_DAYS = 90;

/** Longest booking window Eddy can set, in days (enforced by firestore.rules). */
export const MAX_BOOKING_WINDOW_DAYS = 60;

/** Highest price Eddy can set for a service, in dollars. */
export const MAX_PRICE = 1000;

/** Longest shop address (enforced by firestore.rules). */
export const MAX_ADDRESS_LENGTH = 200;

/** Longest Google Maps link (enforced by firestore.rules). */
export const MAX_MAPS_URL_LENGTH = 500;

/** Shop name length (enforced by firestore.rules). */
export const MIN_SHOP_NAME_LENGTH = 2;
export const MAX_SHOP_NAME_LENGTH = 40;

/** Barber name length (enforced by firestore.rules). */
export const MIN_BARBER_NAME_LENGTH = 2;
export const MAX_BARBER_NAME_LENGTH = 30;

/** Longest side of the shop's logo after it's resized in the browser, in pixels. */
export const MAX_LOGO_SIDE = 512;

/** Largest logo image after compression, in bytes. */
export const MAX_LOGO_BYTES = 100_000;

/**
 * Longest logo data: URL firestore.rules accepts: MAX_LOGO_BYTES in base64 (4 characters per 3
 * bytes) plus the "data:image/webp;base64," prefix, rounded up.
 */
export const MAX_LOGO_DATA_URL_LENGTH = 140_000;
