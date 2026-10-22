import { useState } from 'react';
import { adminCancelBooking, setBookingStatus } from '../../data/api';
import { formatLebanesePhone } from '../../lib/phone';
import { formatDayLong, minutesToTime, timeToMinutes } from '../../lib/time';
import { whatsappLink } from '../../lib/whatsapp';
import type { AdminBooking, BookingStatus } from '../../types';

const STATUS_STYLES: Record<BookingStatus, { label: string; className: string }> = {
  booked: { label: 'Booked', className: 'bg-blue-100 text-blue-800' },
  done: { label: 'Done', className: 'bg-green-100 text-green-800' },
  'no-show': { label: 'No-show', className: 'bg-amber-100 text-amber-900' },
  cancelled: { label: 'Cancelled', className: 'bg-neutral-200 text-neutral-600' },
};

interface Props {
  booking: AdminBooking;
  /** Shows the booking's date, for lists that span several days. */
  showDate?: boolean;
  /** Offers only Cancel (no Done / No-show), for bookings that clash with the settings. */
  cancelOnly?: boolean;
}

export function BookingCard({ booking, showDate = false, cancelOnly = false }: Props) {
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const end = minutesToTime(timeToMinutes(booking.startTime) + booking.durationMinutes);
  const status = STATUS_STYLES[booking.status];

  // The real-time listener updates the card, so actions only need to report failures.
  async function run(action: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      console.error(err);
      setError("Couldn't save. Check your connection and try again.");
    } finally {
      setBusy(false);
      setConfirmingCancel(false);
    }
  }

  return (
    <li
      className={`rounded-2xl border border-neutral-200 bg-white p-4 ${
        booking.status === 'cancelled' ? 'opacity-60' : ''
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          {showDate && <p className="text-sm font-semibold">{formatDayLong(booking.date)}</p>}
          <p className="text-xl font-bold tabular-nums">
            {booking.startTime}
            <span className="text-base font-normal text-neutral-500">–{end}</span>
          </p>
          <p className="text-sm text-neutral-600">
            {booking.serviceName} · {booking.durationMinutes} min
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status.className}`}>
          {status.label}
        </span>
      </div>

      <p className="text-lg font-semibold">{booking.name}</p>
      {booking.phone ? (
        <div className="mb-1 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="tabular-nums text-neutral-700">{formatLebanesePhone(booking.phone)}</span>
          <a href={`tel:${booking.phone}`} className="font-semibold text-blue-700 underline">
            Call
          </a>
          <a
            href={whatsappLink(booking.phone)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-green-700 underline"
          >
            WhatsApp
          </a>
        </div>
      ) : (
        <p className="mb-1 text-sm text-neutral-500">No phone</p>
      )}
      {booking.customerEmail && (
        <p className="mb-1 break-all text-sm text-neutral-600">{booking.customerEmail}</p>
      )}
      <p className="text-sm text-neutral-500">
        Code <span className="font-mono font-semibold tracking-wider">{booking.bookingCode}</span>
      </p>

      {booking.status === 'booked' && !confirmingCancel && (
        <div className={`mt-4 grid gap-2 ${cancelOnly ? 'grid-cols-1' : 'grid-cols-3'}`}>
          {!cancelOnly && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => setBookingStatus(booking.id, 'done'))}
                className="rounded-xl bg-green-600 px-3 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                Done
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => setBookingStatus(booking.id, 'no-show'))}
                className="rounded-xl bg-amber-500 px-3 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                No-show
              </button>
            </>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmingCancel(true)}
            className="rounded-xl border border-red-300 px-3 py-3 text-sm font-semibold text-red-700 disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      )}

      {confirmingCancel && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="mb-3 text-sm font-medium text-red-800">
            Cancel this booking? The time becomes free for others.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmingCancel(false)}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-3 text-sm font-semibold"
            >
              Keep it
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => adminCancelBooking(booking.id))}
              className="rounded-xl bg-red-600 px-3 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? 'Cancelling…' : 'Yes, cancel'}
            </button>
          </div>
        </div>
      )}

      {(booking.status === 'done' || booking.status === 'no-show') && (
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => setBookingStatus(booking.id, 'booked'))}
          className="mt-3 text-sm font-medium text-neutral-600 underline"
        >
          Undo
        </button>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </li>
  );
}
