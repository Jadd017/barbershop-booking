/**
 * Errors the multi-barber data layer throws, so pages can say what went wrong. The single-barber
 * api.ts has its own copies of the booking ones until the pages switch over.
 */

/** Thrown when a slot the booking (or move) needs was taken first by someone else. */
export class SlotTakenError extends Error {
  constructor() {
    super('Slot already taken');
    this.name = 'SlotTakenError';
  }
}

/** Thrown when the chosen start time has already passed. */
export class TimePassedError extends Error {
  constructor() {
    super('Time already passed');
    this.name = 'TimePassedError';
  }
}

/**
 * Thrown when the settings no longer allow the booking: the service, the window, the shop's or
 * the barber's hours, a day off, or the barber was deactivated while the customer was choosing.
 */
export class NotBookableError extends Error {
  constructor() {
    super('No longer bookable');
    this.name = 'NotBookableError';
  }
}

/** Thrown when booking as a customer without being signed in with Google. */
export class SignInRequiredError extends Error {
  constructor() {
    super('Sign in with Google to book');
    this.name = 'SignInRequiredError';
  }
}

/** Thrown when the booking doesn't exist, or isn't the signed-in customer's. */
export class BookingNotFoundError extends Error {
  constructor() {
    super('Booking not found');
    this.name = 'BookingNotFoundError';
  }
}

/** Thrown when cancelling or moving a booking that is done or marked as a no-show. */
export class NotCancellableError extends Error {
  constructor() {
    super('Booking can no longer be changed');
    this.name = 'NotCancellableError';
  }
}

/** Thrown when cancelling or moving a booking that is already cancelled. */
export class AlreadyCancelledError extends Error {
  constructor() {
    super('Booking already cancelled');
    this.name = 'AlreadyCancelledError';
  }
}

/** Thrown when the phone, or the Google account, already has the maximum upcoming bookings. */
export class TooManyBookingsError extends Error {
  readonly limitedBy: 'phone' | 'account';

  constructor(limitedBy: 'phone' | 'account') {
    super(`Too many upcoming bookings for this ${limitedBy}`);
    this.limitedBy = limitedBy;
    this.name = 'TooManyBookingsError';
  }
}

/** Thrown when adding a barber whose ID is already used. */
export class BarberExistsError extends Error {
  constructor() {
    super('A barber with this ID already exists');
    this.name = 'BarberExistsError';
  }
}

/** Thrown when creating a login with a username that's already taken. */
export class UsernameTakenError extends Error {
  constructor() {
    super('Username already taken');
    this.name = 'UsernameTakenError';
  }
}

/** Thrown when signing in with a username that doesn't exist or a wrong password. */
export class WrongLoginError extends Error {
  constructor() {
    super('Wrong username or password');
    this.name = 'WrongLoginError';
  }
}

/** Thrown when the owner tries to deactivate his own barber or login. */
export class OwnAccountError extends Error {
  constructor() {
    super("The owner can't deactivate himself");
    this.name = 'OwnAccountError';
  }
}

/** Checks the code rather than the class, which can differ if two copies of the SDK are loaded. */
export function isPermissionDenied(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === 'permission-denied';
}
