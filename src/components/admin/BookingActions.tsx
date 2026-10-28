import { ArrowRightLeft, Check, MessageCircle, Phone, Undo2, UserX, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { setBookingStatus, staffCancelBooking } from '../../data/bookings';
import { AlreadyCancelledError, NotCancellableError } from '../../data/errors';
import { store } from '../../data/firebase';
import { whatsappLink } from '../../lib/whatsapp';
import type { ShopStaffBooking } from '../../types';
import { buttonDanger, buttonDark, buttonOutline, linkButton, Notice } from '../ui';
import { useOwner } from './session';

interface Props {
  booking: ShopStaffBooking;
  /** Offers only Cancel (no Done / No-show), for bookings that clash with the settings. */
  cancelOnly?: boolean;
}

/** Done / No-show, Call / WhatsApp / Cancel (and Move, for the owner), or Undo, for one booking. */
export function BookingActions({ booking, cancelOnly = false }: Props) {
  const { t } = useTranslation();
  const owner = useOwner();
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
      if (err instanceof AlreadyCancelledError || err instanceof NotCancellableError) {
        setError(t('actions.alreadyChanged'));
      } else {
        console.error(err);
        setError(t('common.couldntSave'));
      }
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
            onClick={() => run(() => setBookingStatus(store, booking.id, 'done'))}
            className={`${buttonDark} caps min-h-14 text-base`}
          >
            <Check aria-hidden size={20} className="text-brass-light" />
            {t('actions.done')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => setBookingStatus(store, booking.id, 'no-show'))}
            className={`${buttonOutline} caps min-h-14 text-base`}
          >
            <UserX aria-hidden size={20} />
            {t('actions.noShow')}
          </button>
        </div>
      )}

      {!confirmingCancel && (booking.phone || booked) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4">
          {booking.phone && (
            <>
              <a href={`tel:${booking.phone}`} className={`${linkButton} text-pole-blue`}>
                <Phone aria-hidden size={16} />
                {t('actions.call')}
              </a>
              <a
                href={whatsappLink(booking.phone)}
                target="_blank"
                rel="noopener noreferrer"
                className={`${linkButton} text-ink`}
              >
                <MessageCircle aria-hidden size={16} className="text-whatsapp" />
                {t('actions.whatsapp')}
              </a>
            </>
          )}
          {booked && owner && (
            <button
              type="button"
              disabled={busy}
              onClick={() => owner.startMove(booking)}
              className={`${linkButton} text-ink`}
            >
              <ArrowRightLeft aria-hidden size={16} />
              {t('actions.move')}
            </button>
          )}
          {booked && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmingCancel(true)}
              className={`${linkButton} ms-auto text-pole-red`}
            >
              <X aria-hidden size={16} />
              {t('actions.cancel')}
            </button>
          )}
        </div>
      )}

      {confirmingCancel && (
        <div className="rounded-xl border border-pole-red/30 bg-pole-red/5 p-3">
          <p className="mb-3 text-sm font-semibold text-pole-red">
            {t('actions.confirmCancel')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmingCancel(false)}
              className={buttonOutline}
            >
              {t('common.keepIt')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => staffCancelBooking(store, booking.id))}
              className={buttonDanger}
            >
              {busy ? t('common.cancelling') : t('common.yesCancel')}
            </button>
          </div>
        </div>
      )}

      {(booking.status === 'done' || booking.status === 'no-show') && (
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => setBookingStatus(store, booking.id, 'booked'))}
          className={`${linkButton} text-muted`}
        >
          <Undo2 aria-hidden size={16} className="rtl:-scale-x-100" />
          {booking.status === 'done' ? t('actions.undoDone') : t('actions.undoNoShow')}
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
