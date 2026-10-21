import { formatDayLong } from '../lib/time';
import type { ConfirmedBooking } from '../types';

interface Props {
  booking: ConfirmedBooking;
  onDone: () => void;
}

export function Confirmation({ booking, onDone }: Props) {
  return (
    <div className="mx-auto min-h-screen max-w-xl px-4 pt-12 text-center">
      <p className="mb-2 text-4xl">✓</p>
      <h1 className="mb-6 text-2xl font-bold">You're booked!</h1>

      <dl className="mb-8 rounded-2xl border border-neutral-200 p-5 text-left">
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
      </dl>

      <p className="mb-2 text-sm text-neutral-500">Your booking code</p>
      <p className="mb-3 font-mono text-4xl font-bold tracking-[0.3em] select-all">
        {booking.bookingCode}
      </p>
      <p className="mb-10 text-sm text-neutral-600">
        Save this code (take a screenshot). You'll need it to manage your booking.
      </p>

      <button
        type="button"
        onClick={onDone}
        className="rounded-xl border border-neutral-300 px-5 py-3 font-semibold hover:border-neutral-500"
      >
        Book another
      </button>
    </div>
  );
}
