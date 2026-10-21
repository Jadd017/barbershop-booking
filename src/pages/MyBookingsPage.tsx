import type { User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { AccountLine } from '../components/AccountLine';
import {
  AlreadyCancelledError,
  cancelMyBooking,
  NotCancellableError,
  subscribeMyBookings,
  TimePassedError,
} from '../data/api';
import {
  finishRedirectSignIn,
  isInAppBrowser,
  signInErrorMessage,
  signInWithGoogle,
  signOutCustomer,
} from '../data/auth';
import { useCustomer } from '../hooks/useCustomer';
import { clearLastBooking, loadLastBooking } from '../lib/lastBooking';
import { isPast } from '../lib/slots';
import { formatDayLong } from '../lib/time';
import type { BookingStatus, CustomerBooking } from '../types';

const STATUS_LABELS: Record<BookingStatus, string> = {
  booked: 'Booked',
  cancelled: 'Cancelled',
  done: 'Done',
  'no-show': 'Missed',
};

const GENERIC_ERROR = 'Something went wrong. Check your connection and try again.';

/** Still ahead and "booked", so it can be cancelled. */
function isUpcoming(b: CustomerBooking): boolean {
  return b.status === 'booked' && !isPast(b.date, b.startTime);
}

export function MyBookingsPage() {
  const customer = useCustomer();
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  useEffect(() => {
    finishRedirectSignIn().catch((err) => setSignInError(signInErrorMessage(err)));
  }, []);

  async function signIn() {
    setSignInError(null);
    setSigningIn(true);
    try {
      // The page reloads signed in after a redirect, so there's nothing else to keep.
      if ((await signInWithGoogle()) === 'redirecting') return;
    } catch (err) {
      setSignInError(signInErrorMessage(err));
    }
    setSigningIn(false);
  }

  return (
    <div className="mx-auto min-h-screen max-w-xl px-4 pb-16 pt-8">
      <Link to="/" className="mb-6 inline-block text-sm font-medium underline">
        ← Back to booking
      </Link>
      <h1 className="mb-2 text-2xl font-bold">My bookings</h1>

      {customer === undefined ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : customer ? (
        <>
          <div className="mb-6">
            <AccountLine customer={customer} onSignOut={() => signOutCustomer().catch(console.error)} />
          </div>
          <BookingList customer={customer} />
        </>
      ) : (
        <>
          <p className="mb-6 text-sm text-neutral-600">
            Sign in with the Google account you booked with to see and cancel your bookings.
          </p>
          {(signInError || isInAppBrowser()) && (
            <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {signInError ??
                'Google sign-in may not work inside this app. If it fails, open this page in Chrome or Safari.'}
            </p>
          )}
          <button
            type="button"
            onClick={signIn}
            disabled={signingIn}
            className="w-full rounded-xl bg-neutral-900 px-5 py-3 font-semibold text-white hover:bg-neutral-700 disabled:opacity-60"
          >
            {signingIn ? 'Signing in…' : 'Sign in with Google'}
          </button>
        </>
      )}
    </div>
  );
}

function BookingList({ customer }: { customer: User }) {
  // Tagged with whose they are, so another account's list is never shown after switching.
  const [bookings, setBookings] = useState<{ uid: string; items: CustomerBooking[] } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [justCancelled, setJustCancelled] = useState(false);
  const { uid } = customer;

  useEffect(() => {
    return subscribeMyBookings(
      uid,
      (items) => {
        setBookings({ uid, items });
        setLoadError(false);
      },
      (err) => {
        console.error(err);
        setLoadError(true);
      },
    );
  }, [uid]);

  if (loadError) {
    return (
      <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
        Couldn't load your bookings. Check your connection and refresh.
      </p>
    );
  }

  const items = bookings?.uid === uid ? bookings.items : null;
  if (!items) return <p className="text-sm text-neutral-500">Loading…</p>;

  const upcoming = items.filter(isUpcoming);
  // Most recent first.
  const earlier = items.filter((b) => !isUpcoming(b)).reverse();

  return (
    <>
      {justCancelled && (
        <p className="mb-6 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
          Your booking has been cancelled and the time is free again.
        </p>
      )}

      <h2 className="mb-3 font-semibold">Upcoming</h2>
      {upcoming.length === 0 ? (
        <p className="mb-8 rounded-2xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
          No upcoming bookings.{' '}
          <Link to="/" className="font-medium text-neutral-900 underline">
            Book now
          </Link>
        </p>
      ) : (
        <ul className="mb-8 grid gap-3">
          {upcoming.map((b) => (
            <BookingItem key={b.bookingCode} booking={b} onCancelled={() => setJustCancelled(true)} />
          ))}
        </ul>
      )}

      {earlier.length > 0 && (
        <>
          <h2 className="mb-3 font-semibold">Past and cancelled</h2>
          <ul className="grid gap-3">
            {earlier.map((b) => (
              <BookingItem key={b.bookingCode} booking={b} onCancelled={() => setJustCancelled(true)} />
            ))}
          </ul>
        </>
      )}
    </>
  );
}

interface ItemProps {
  booking: CustomerBooking;
  onCancelled: () => void;
}

function BookingItem({ booking, onCancelled }: ItemProps) {
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upcoming = isUpcoming(booking);
  const cancelled = booking.status === 'cancelled';

  // The live listener moves the booking to "Past and cancelled", so success needs no update here.
  async function handleCancel() {
    setError(null);
    setCancelling(true);
    try {
      await cancelMyBooking(booking.bookingCode);
      // Don't bring back the confirmation screen for a booking that no longer exists.
      if (loadLastBooking()?.booking.bookingCode === booking.bookingCode) clearLastBooking();
      onCancelled();
    } catch (err) {
      if (err instanceof AlreadyCancelledError) {
        // Already what they wanted; the listener will show it.
      } else if (err instanceof TimePassedError || err instanceof NotCancellableError) {
        setError("This appointment's time has passed, so it can't be cancelled.");
      } else {
        console.error(err);
        setError(GENERIC_ERROR);
      }
    } finally {
      setCancelling(false);
      setConfirmingCancel(false);
    }
  }

  return (
    <li className={`rounded-2xl border border-neutral-200 p-5 ${upcoming ? '' : 'opacity-70'}`}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{formatDayLong(booking.date)}</p>
          <p className="text-sm text-neutral-600">
            <span className="tabular-nums">{booking.startTime}</span> · {booking.serviceName} ·{' '}
            {booking.durationMinutes} min
          </p>
        </div>
        <span
          className={`shrink-0 text-sm font-semibold ${cancelled ? 'text-red-600' : 'text-green-700'}`}
        >
          {STATUS_LABELS[booking.status]}
        </span>
      </div>
      <p className="text-sm text-neutral-500">
        Code <span className="font-mono font-semibold tracking-wider">{booking.bookingCode}</span>
      </p>

      {upcoming &&
        (confirmingCancel ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="mb-4 text-sm font-medium text-red-800">
              Are you sure you want to cancel this booking?
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmingCancel(false)}
                disabled={cancelling}
                className="flex-1 rounded-xl border border-neutral-300 bg-white px-4 py-3 font-semibold hover:border-neutral-500"
              >
                Keep it
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={cancelling}
                className="flex-1 rounded-xl bg-red-600 px-4 py-3 font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {cancelling ? 'Cancelling…' : 'Yes, cancel'}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingCancel(true)}
            className="mt-4 w-full rounded-xl border border-red-300 px-5 py-3 font-semibold text-red-700 hover:bg-red-50"
          >
            Cancel booking
          </button>
        ))}

      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </li>
  );
}
