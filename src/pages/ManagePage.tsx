import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  AlreadyCancelledError,
  BookingNotFoundError,
  cancelBooking,
  findBooking,
  NotCancellableError,
  TimePassedError,
} from '../data/api';
import { normalizeBookingCode } from '../lib/bookingCode';
import { clearLastBooking, loadLastBooking } from '../lib/lastBooking';
import { normalizeLebanesePhone } from '../lib/phone';
import { isPast } from '../lib/slots';
import { formatDayLong } from '../lib/time';
import type { BookingStatus, ManagedBooking } from '../types';

const STATUS_LABELS: Record<BookingStatus, string> = {
  booked: 'Booked',
  cancelled: 'Cancelled',
  done: 'Done',
  'no-show': 'Missed',
};

/** Same message for a wrong code and a wrong phone, so nobody can tell which part was wrong. */
const NOT_FOUND_MESSAGE = "We couldn't find a booking with that code and phone number.";
const GENERIC_ERROR = 'Something went wrong. Check your connection and try again.';

export function ManagePage() {
  const [searchParams] = useSearchParams();
  const [code, setCode] = useState(searchParams.get('code') ?? '');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Set once the code and phone match; `phone` is kept normalized for cancelling.
  const [found, setFound] = useState<{ booking: ManagedBooking; phone: string } | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [justCancelled, setJustCancelled] = useState(false);

  async function handleLookup(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const normalizedCode = normalizeBookingCode(code);
    const normalizedPhone = normalizeLebanesePhone(phone);
    if (!normalizedCode || !normalizedPhone) {
      setError(NOT_FOUND_MESSAGE);
      return;
    }

    setLoading(true);
    try {
      const booking = await findBooking(normalizedCode, normalizedPhone);
      setFound({ booking, phone: normalizedPhone });
    } catch (err) {
      if (err instanceof BookingNotFoundError) {
        setError(NOT_FOUND_MESSAGE);
      } else {
        console.error(err);
        setError(GENERIC_ERROR);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    if (!found) return;
    setCancelError(null);
    setCancelling(true);
    try {
      await cancelBooking(found.booking.bookingCode, found.phone);
      // Don't bring back the confirmation screen for a booking that no longer exists.
      if (loadLastBooking()?.booking.bookingCode === found.booking.bookingCode) {
        clearLastBooking();
      }
      setFound({ ...found, booking: { ...found.booking, status: 'cancelled' } });
      setJustCancelled(true);
    } catch (err) {
      if (err instanceof AlreadyCancelledError) {
        setFound({ ...found, booking: { ...found.booking, status: 'cancelled' } });
      } else if (err instanceof TimePassedError || err instanceof NotCancellableError) {
        setCancelError("This appointment's time has passed, so it can't be cancelled.");
      } else {
        console.error(err);
        setCancelError(GENERIC_ERROR);
      }
    } finally {
      setCancelling(false);
      setConfirmingCancel(false);
    }
  }

  function lookUpAnother() {
    setFound(null);
    setCode('');
    setPhone('');
    setJustCancelled(false);
    setCancelError(null);
  }

  return (
    <div className="mx-auto min-h-screen max-w-xl px-4 pb-16 pt-8">
      <Link to="/" className="mb-6 inline-block text-sm font-medium underline">
        ← Back to booking
      </Link>
      <h1 className="mb-6 text-2xl font-bold">Manage your booking</h1>

      {found ? (
        <BookingDetails
          booking={found.booking}
          justCancelled={justCancelled}
          confirmingCancel={confirmingCancel}
          cancelling={cancelling}
          cancelError={cancelError}
          onAskCancel={() => setConfirmingCancel(true)}
          onKeep={() => setConfirmingCancel(false)}
          onConfirmCancel={handleCancel}
          onLookUpAnother={lookUpAnother}
        />
      ) : (
        <form onSubmit={handleLookup} noValidate>
          <label className="mb-4 block">
            <span className="mb-1 block text-sm font-medium">Booking code</span>
            <input
              type="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="ABC234"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={loading}
              className="w-full rounded-xl border border-neutral-300 px-4 py-3 font-mono uppercase tracking-widest outline-none focus:border-neutral-900"
            />
          </label>

          <label className="mb-6 block">
            <span className="mb-1 block text-sm font-medium">Phone used for the booking</span>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+961 70 123 456"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={loading}
              className="w-full rounded-xl border border-neutral-300 px-4 py-3 tabular-nums outline-none focus:border-neutral-900"
            />
          </label>

          {error && (
            <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-neutral-900 px-5 py-3 font-semibold text-white hover:bg-neutral-700 disabled:opacity-60"
          >
            {loading ? 'Looking up…' : 'Find my booking'}
          </button>
        </form>
      )}
    </div>
  );
}

interface DetailsProps {
  booking: ManagedBooking;
  justCancelled: boolean;
  confirmingCancel: boolean;
  cancelling: boolean;
  cancelError: string | null;
  onAskCancel: () => void;
  onKeep: () => void;
  onConfirmCancel: () => void;
  onLookUpAnother: () => void;
}

function BookingDetails({
  booking,
  justCancelled,
  confirmingCancel,
  cancelling,
  cancelError,
  onAskCancel,
  onKeep,
  onConfirmCancel,
  onLookUpAnother,
}: DetailsProps) {
  const cancelled = booking.status === 'cancelled';
  // Done and no-show bookings are over too, even if Eddy marked them early.
  const past = isPast(booking.date, booking.startTime) || booking.status !== 'booked';

  return (
    <>
      <dl className="mb-6 rounded-2xl border border-neutral-200 p-5">
        <div className="flex justify-between py-1">
          <dt className="text-neutral-500">Code</dt>
          <dd className="font-mono font-semibold tracking-widest">{booking.bookingCode}</dd>
        </div>
        <div className="flex justify-between py-1">
          <dt className="text-neutral-500">Day</dt>
          <dd className="font-medium">{formatDayLong(booking.date)}</dd>
        </div>
        <div className="flex justify-between py-1">
          <dt className="text-neutral-500">Time</dt>
          <dd className="font-medium tabular-nums">{booking.startTime}</dd>
        </div>
        <div className="flex justify-between py-1">
          <dt className="text-neutral-500">Service</dt>
          <dd className="font-medium">
            {booking.serviceName} · {booking.durationMinutes} min
          </dd>
        </div>
        <div className="flex justify-between py-1">
          <dt className="text-neutral-500">Status</dt>
          <dd className={`font-semibold ${cancelled ? 'text-red-600' : 'text-green-700'}`}>
            {STATUS_LABELS[booking.status]}
          </dd>
        </div>
      </dl>

      {justCancelled ? (
        <p className="mb-6 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
          Your booking has been cancelled and the time is free again.
        </p>
      ) : cancelled ? (
        <p className="mb-6 rounded-xl bg-neutral-100 px-4 py-3 text-sm text-neutral-700">
          This booking is already cancelled.
        </p>
      ) : past ? (
        <p className="mb-6 rounded-xl bg-neutral-100 px-4 py-3 text-sm text-neutral-700">
          This appointment's time has passed, so it can't be cancelled.
        </p>
      ) : confirmingCancel ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="mb-4 text-sm font-medium text-red-800">
            Are you sure you want to cancel this booking?
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onKeep}
              disabled={cancelling}
              className="flex-1 rounded-xl border border-neutral-300 bg-white px-4 py-3 font-semibold hover:border-neutral-500"
            >
              Keep it
            </button>
            <button
              type="button"
              onClick={onConfirmCancel}
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
          onClick={onAskCancel}
          className="mb-6 w-full rounded-xl border border-red-300 px-5 py-3 font-semibold text-red-700 hover:bg-red-50"
        >
          Cancel booking
        </button>
      )}

      {cancelError && (
        <p role="alert" className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {cancelError}
        </p>
      )}

      <button type="button" onClick={onLookUpAnother} className="text-sm font-medium underline">
        Look up another booking
      </button>
    </>
  );
}
