import { Link } from 'react-router';
import { formatDayLong } from '../lib/time';
import { bookingWhatsappLink } from '../lib/whatsapp';
import type { ConfirmedBooking } from '../types';

interface Props {
  booking: ConfirmedBooking;
  barberName: string;
  onDone: () => void;
}

export function Confirmation({ booking, barberName, onDone }: Props) {
  return (
    <div className="mx-auto min-h-screen max-w-xl px-4 pb-16 pt-10 text-center">
      <h1 className="mb-4 text-2xl font-bold">One last step</h1>

      <p
        role="alert"
        className="mb-5 rounded-2xl border-2 border-amber-400 bg-amber-50 px-5 py-4 font-semibold text-amber-900"
      >
        Your booking is not complete until you send the WhatsApp message to {barberName}.
      </p>

      {/* Same tab, no target="_blank": the most reliable way to hand off to the app on mobile. */}
      <a
        href={bookingWhatsappLink(booking, barberName)}
        className="mb-2 block rounded-2xl bg-[#25D366] px-6 py-5 text-lg font-bold text-white shadow-sm hover:bg-[#1ebe5b]"
      >
        Send to {barberName} on WhatsApp
      </a>
      <p className="mb-10 text-sm text-neutral-500">
        If WhatsApp didn't open, tap the button above.
      </p>

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
      <p className="mb-8 text-sm text-neutral-600">
        Save this code (take a screenshot). You'll need it to manage your booking.
      </p>

      <div className="flex flex-col gap-3">
        <Link
          to={`/manage?code=${booking.bookingCode}`}
          className="rounded-xl border border-neutral-300 px-5 py-3 font-semibold hover:border-neutral-500"
        >
          Manage booking
        </Link>
        <button
          type="button"
          onClick={onDone}
          className="px-5 py-3 text-sm font-medium text-neutral-600 underline"
        >
          Book another
        </button>
      </div>
    </div>
  );
}
