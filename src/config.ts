/** Size of one time slot on the booking grid, in minutes. */
export const SLOT_MINUTES = 15;

/** Eddy's WhatsApp number, in international format. */
export const BARBER_WHATSAPP = '+96176139388';

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

/** Longest booking window Eddy can set, in days (enforced by firestore.rules). */
export const MAX_BOOKING_WINDOW_DAYS = 60;
