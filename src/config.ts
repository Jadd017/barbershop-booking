/** How many days (starting today) customers can book. */
export const DAYS_TO_SHOW = 4;

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

/** Longest name a booking can have (enforced by firestore.rules). */
export const MAX_NAME_LENGTH = 50;
