import { Check, MessageCircle, Phone, Undo2, UserX, X } from 'lucide-react';
import { useState } from 'react';
import { adminCancelBooking, setBookingStatus } from '../../data/api';
import { whatsappLink } from '../../lib/whatsapp';
import type { AdminBooking } from '../../types';
import { buttonDanger, buttonDark, buttonOutline, linkButton, Notice } from '../ui';

interface Props {
  booking: AdminBooking;
  /** Offers only Cancel (no Done / No-show), for bookings that clash with the settings. */
  cancelOnly?: boolean;
}

/** Done / No-show, Call / WhatsApp / Cancel, or Undo, for one booking. */
export function BookingActions({ booking, cancelOnly = false }: Props) {
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The real-time listener updates the list, so actions only need to report failures.
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

  const booked = booking.status === 'booked';

  return (
    <div>
      {booked && !cancelOnly && !confirmingCancel && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => setBookingStatus(booking.id, 'done'))}
            className={`${buttonDark} caps min-h-14 text-base`}
          >
            <Check aria-hidden size={20} className="text-brass-light" />
            Done
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => setBookingStatus(booking.id, 'no-show'))}
            className={`${buttonOutline} caps min-h-14 text-base`}
          >
            <UserX aria-hidden size={20} />
            No-show
          </button>
        </div>
      )}

      {!confirmingCancel && (booking.phone || booked) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4">
          {booking.phone && (
            <>
              <a href={`tel:${booking.phone}`} className={`${linkButton} text-pole-blue`}>
                <Phone aria-hidden size={16} />
                Call
              </a>
              <a
                href={whatsappLink(booking.phone)}
                target="_blank"
                rel="noopener noreferrer"
                className={`${linkButton} text-ink`}
              >
                <MessageCircle aria-hidden size={16} className="text-whatsapp" />
                WhatsApp
              </a>
            </>
          )}
          {booked && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmingCancel(true)}
              className={`${linkButton} ml-auto text-pole-red`}
            >
              <X aria-hidden size={16} />
              Cancel
            </button>
          )}
        </div>
      )}

      {confirmingCancel && (
        <div className="rounded-xl border border-pole-red/30 bg-pole-red/5 p-3">
          <p className="mb-3 text-sm font-semibold text-pole-red">
            Cancel this booking? The time becomes free for others.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmingCancel(false)}
              className={buttonOutline}
            >
              Keep it
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => adminCancelBooking(booking.id))}
              className={buttonDanger}
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
          className={`${linkButton} text-muted`}
        >
          <Undo2 aria-hidden size={16} />
          Undo {booking.status === 'done' ? 'Done' : 'No-show'}
        </button>
      )}

      {error && (
        <Notice tone="error" className="mt-3">
          {error}
        </Notice>
      )}
    </div>
  );
}
