import { ArrowRight, Check, MessageCircle, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { moveBooking } from '../../data/bookings';
import { subscribeDaysOn } from '../../data/days';
import { AlreadyCancelledError, NotBookableError, NotCancellableError, SlotTakenError } from '../../data/errors';
import { store } from '../../data/firebase';
import { useBookingServiceName } from '../../hooks/useServiceNames';
import { initials } from '../../lib/initials';
import { moveOptions } from '../../lib/team';
import { formatDayLong, minutesToTime, timeToMinutes } from '../../lib/time';
import { movedMessage, whatsappLink } from '../../lib/whatsapp';
import type { Barber, BarberDay, ShopSettings, ShopStaffBooking } from '../../types';
import { buttonBrass, buttonOutline, Notice } from '../ui';

interface Props {
  shop: ShopSettings;
  barbers: Barber[];
  booking: ShopStaffBooking;
  onClose: () => void;
}

/**
 * The owner moves a booking to another barber, same day and time. Only barbers free for the whole
 * booking can be picked (live: their day docs are listened to). moveBooking does it in one
 * transaction, and the rules refuse it if the new barber's time was booked meanwhile, so it can
 * never double-book. Afterwards: a WhatsApp button to tell the customer.
 */
export function MoveSheet({ shop, barbers, booking, onClose }: Props) {
  const { t } = useTranslation();
  const serviceName = useBookingServiceName();
  const [days, setDays] = useState<Map<string, BarberDay> | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [chosen, setChosen] = useState<Barber | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moved, setMoved] = useState<ShopStaffBooking | null>(null);

  useEffect(
    () =>
      subscribeDaysOn(store, booking.date, setDays, (err) => {
        console.error(err);
        setLoadError(true);
      }),
    [booking.date],
  );

  const options = days ? moveOptions(shop, booking, barbers, days) : null;
  // Drops the choice if that barber gets booked or blocked meanwhile.
  const pick = chosen && options?.some((o) => o.barber.id === chosen.id && !o.reason) ? chosen : null;
  const end = minutesToTime(timeToMinutes(booking.startTime) + booking.durationMinutes);

  async function move() {
    if (!pick) return;
    setError(null);
    setBusy(true);
    try {
      setMoved(await moveBooking(store, booking.id, pick.id));
    } catch (err) {
      setError(
        err instanceof SlotTakenError
          ? t('move.justBooked', { name: pick.name })
          : err instanceof NotBookableError
            ? t('move.inactive', { name: pick.name })
            : err instanceof AlreadyCancelledError || err instanceof NotCancellableError
              ? t('move.changed')
              : t('move.failed'),
      );
      if (!(err instanceof SlotTakenError || err instanceof NotBookableError)) console.error(err);
      setChosen(null);
    }
    setBusy(false);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="move-title"
      className="fixed inset-0 z-40 overflow-y-auto bg-cream"
    >
      <header className="sticky top-0 z-10 bg-charcoal text-cream">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
          <h2 id="move-title" className="caps text-2xl font-semibold tracking-[0.1em]">
            {t('move.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex min-h-11 items-center gap-1.5 px-1 text-sm font-semibold text-line hover:text-cream"
          >
            <X aria-hidden size={18} />
            {moved ? t('common.done') : t('common.close')}
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-xl px-4 pb-32 pt-5">
        <div className="mb-6 rounded-2xl border border-line bg-card p-4">
          <p className="caps text-sm font-semibold">{formatDayLong(booking.date)}</p>
          <p className="caps text-2xl font-semibold tabular-nums">
            <bdi dir="ltr">
              {booking.startTime}
              <span className="text-base font-normal text-muted">–{end}</span>
            </bdi>
          </p>
          <p className="text-lg font-semibold">{booking.name}</p>
          <p className="text-sm text-muted">
            {serviceName(booking)} · {t('common.minutes', { minutes: booking.durationMinutes })} · {t('move.nowWith')}{' '}
            <span className="font-semibold text-ink">{(moved ?? booking).barberName}</span>
          </p>
        </div>

        {moved ? (
          <div className="grid gap-3">
            <Notice tone="success">
              <span className="flex items-center gap-2 font-semibold">
                <Check aria-hidden size={18} />
                {t('move.movedTo', { name: moved.barberName })}
              </span>
            </Notice>
            {moved.phone ? (
              <a
                href={whatsappLink(moved.phone, movedMessage(moved, shop.shopName))}
                target="_blank"
                rel="noopener noreferrer"
                className={`${buttonBrass} caps min-h-14 text-base`}
              >
                <MessageCircle aria-hidden size={20} />
                {t('move.whatsappName', { name: moved.name })}
              </a>
            ) : (
              <p className="text-sm text-muted-strong">{t('move.noPhone')}</p>
            )}
            <button type="button" onClick={onClose} className={buttonOutline}>
              {t('common.done')}
            </button>
          </div>
        ) : (
          <>
            <h3 className="caps mb-1 text-sm font-semibold">{t('move.moveTo')}</h3>
            <p className="mb-3 text-sm text-muted-strong">
              {t('move.onlyFree', { minutes: booking.durationMinutes })}
            </p>
            {loadError ? (
              <Notice tone="error">{t('move.daysError')}</Notice>
            ) : !options ? (
              <p className="text-sm text-muted-strong">{t('common.loading')}</p>
            ) : options.length === 0 ? (
              <Notice tone="warning">{t('move.noOther')}</Notice>
            ) : (
              <ul className="grid gap-2">
                {options.map(({ barber, reason }) => {
                  const current = pick?.id === barber.id;
                  return (
                    <li key={barber.id}>
                      <button
                        type="button"
                        disabled={reason !== null || busy}
                        aria-pressed={current}
                        onClick={() => setChosen(barber)}
                        className={`flex min-h-16 w-full items-center gap-3 rounded-2xl border px-3 py-2 text-start transition disabled:cursor-not-allowed disabled:opacity-50 ${
                          current ? 'border-charcoal bg-charcoal text-cream' : 'border-line bg-card text-ink hover:border-muted'
                        }`}
                      >
                        <span
                          aria-hidden
                          className={`caps flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-semibold ${
                            current ? 'bg-brass text-charcoal' : 'bg-cream'
                          }`}
                        >
                          {initials(barber.name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold">{barber.name}</span>
                          <span className={`block text-sm ${current ? 'text-line' : 'text-muted-strong'}`}>
                            {reason ?? t('move.free')}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {error && (
              <Notice tone="error" className="mt-4">
                {error}
              </Notice>
            )}
          </>
        )}
      </div>

      {!moved && (
        <div className="fixed inset-x-0 bottom-0 border-t border-line bg-cream/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="mx-auto max-w-xl px-4 py-3">
            <button
              type="button"
              onClick={move}
              disabled={busy || !pick}
              className={`${buttonBrass} caps min-h-14 w-full text-base`}
            >
              {busy ? (
                t('move.moving')
              ) : pick ? (
                <>
                  {t('move.moveToName', { name: pick.name })}
                  <ArrowRight aria-hidden size={20} className="rtl:-scale-x-100" />
                </>
              ) : (
                t('move.pickBarber')
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
