import type { User } from 'firebase/auth';
import { ArrowLeft, Clock, Scissors, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ShopHeader } from '../components/ShopHeader';
import {
  buttonDanger,
  buttonDangerOutline,
  buttonDark,
  buttonOutline,
  Notice,
  SectionLabel,
  StatusChip,
} from '../components/ui';
import { cancelMyBooking, subscribeMyBookings } from '../data/bookings';
import { AlreadyCancelledError, NotCancellableError, TimePassedError } from '../data/errors';
import { store } from '../data/firebase';
import {
  finishRedirectSignIn,
  isInAppBrowser,
  signInErrorMessage,
  signInWithGoogle,
  signOutCustomer,
} from '../data/auth';
import { useCustomer } from '../hooks/useCustomer';
import { useShop } from '../hooks/useShop';
import { clearLastBooking, loadLastBooking } from '../lib/lastBooking';
import { isPast } from '../lib/slots';
import { formatDayLong, minutesToTime, timeToMinutes } from '../lib/time';
import type { BookingStatus, ShopCustomerBooking } from '../types';

/** Customers see "Missed" rather than the barber's "No-show". */
const STATUS_LABELS: Partial<Record<BookingStatus, string>> = { 'no-show': 'Missed' };

const GENERIC_ERROR = 'Something went wrong. Check your connection and try again.';

/** Still ahead and "booked", so it can be cancelled. */
function isUpcoming(b: ShopCustomerBooking): boolean {
  return b.status === 'booked' && !isPast(b.date, b.startTime);
}

export function MyBookingsPage() {
  const customer = useCustomer();
  const { shop } = useShop();
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
    <div className="min-h-screen pb-16">
      <ShopHeader
        shopName={shop?.shopName ?? ''}
        customer={customer}
        onSignOut={() => signOutCustomer().catch(console.error)}
        action={
          <Link
            to="/"
            className="caps inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-brass/60 px-4 text-xs font-medium text-cream hover:bg-cream/10"
          >
            <ArrowLeft aria-hidden size={16} className="text-brass-light" />
            Book
          </Link>
        }
      />

      <main className="mx-auto max-w-xl px-4 pt-6">
        <h1 className="caps mb-5 text-2xl font-semibold">My bookings</h1>

        {customer === undefined ? (
          <p className="text-sm text-muted-strong">Loading…</p>
        ) : customer ? (
          <BookingList customer={customer} />
        ) : (
          <div className="rounded-2xl border border-line bg-card p-5">
            <p className="mb-5">
              Sign in with the Google account you booked with to see and cancel your bookings.
            </p>
            {(signInError || isInAppBrowser()) && (
              <Notice tone="error" className="mb-4">
                {signInError ??
                  'Google sign-in may not work inside this app. If it fails, open this page in Chrome or Safari.'}
              </Notice>
            )}
            <button type="button" onClick={signIn} disabled={signingIn} className={`${buttonDark} w-full`}>
              {signingIn ? 'Signing in…' : 'Sign in with Google'}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function BookingList({ customer }: { customer: User }) {
  // Tagged with whose they are, so another account's list is never shown after switching.
  const [bookings, setBookings] = useState<{ uid: string; items: ShopCustomerBooking[] } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [justCancelled, setJustCancelled] = useState(false);
  const { uid } = customer;

  useEffect(() => {
    return subscribeMyBookings(
      store,
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
    return <Notice tone="error">Couldn't load your bookings. Check your connection and refresh.</Notice>;
  }

  const items = bookings?.uid === uid ? bookings.items : null;
  if (!items) return <p className="text-sm text-muted-strong">Loading…</p>;

  const upcoming = items.filter(isUpcoming);
  // Most recent first.
  const earlier = items.filter((b) => !isUpcoming(b)).reverse();

  return (
    <>
      {justCancelled && (
        <Notice tone="success" className="mb-6">
          Your booking has been cancelled and the time is free again.
        </Notice>
      )}

      <SectionLabel>Upcoming</SectionLabel>
      {upcoming.length === 0 ? (
        <p className="mb-8 rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted-strong">
          No upcoming bookings.{' '}
          <Link to="/" className="font-semibold text-ink underline">
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
          <SectionLabel>Past and cancelled</SectionLabel>
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
  booking: ShopCustomerBooking;
  onCancelled: () => void;
}

function BookingItem({ booking, onCancelled }: ItemProps) {
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upcoming = isUpcoming(booking);
  const end = minutesToTime(timeToMinutes(booking.startTime) + booking.durationMinutes);

  // The live listener moves the booking to "Past and cancelled", so success needs no update here.
  async function handleCancel() {
    setError(null);
    setCancelling(true);
    try {
      await cancelMyBooking(store, booking.bookingCode);
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
    <li className={`rounded-2xl border border-line bg-card p-5 ${upcoming ? 'shadow-sm' : 'opacity-75'}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="caps text-lg font-semibold">{formatDayLong(booking.date)}</p>
          <p className="flex items-center gap-1.5 text-sm">
            <Clock aria-hidden size={14} className="text-muted" />
            <span className="tabular-nums">
              {booking.startTime}–{end}
            </span>
          </p>
          <p className="flex items-center gap-1.5 text-sm">
            <Scissors aria-hidden size={14} className="text-muted" />
            {booking.serviceName} · {booking.durationMinutes} min
          </p>
          <p className="flex items-center gap-1.5 text-sm">
            <UserRound aria-hidden size={14} className="text-muted" />
            With {booking.barberName}
          </p>
        </div>
        <StatusChip status={booking.status} label={STATUS_LABELS[booking.status]} />
      </div>
      <p className="border-t border-dashed border-line pt-3 text-sm text-muted">
        Code <span className="caps font-semibold tracking-[0.2em] text-ink">{booking.bookingCode}</span>
      </p>

      {upcoming &&
        (confirmingCancel ? (
          <div className="mt-4 rounded-xl border border-pole-red/30 bg-pole-red/5 p-4">
            <p className="mb-4 text-sm font-semibold text-pole-red">
              Are you sure you want to cancel this booking?
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmingCancel(false)}
                disabled={cancelling}
                className={`${buttonOutline} flex-1`}
              >
                Keep it
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={cancelling}
                className={`${buttonDanger} flex-1`}
              >
                {cancelling ? 'Cancelling…' : 'Yes, cancel'}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingCancel(true)}
            className={`${buttonDangerOutline} mt-4 w-full`}
          >
            Cancel booking
          </button>
        ))}

      {error && (
        <Notice tone="error" className="mt-4">
          {error}
        </Notice>
      )}
    </li>
  );
}
