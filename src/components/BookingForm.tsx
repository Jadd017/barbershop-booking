import type { User } from 'firebase/auth';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MAX_ACTIVE_BOOKINGS_PER_ACCOUNT,
  MAX_ACTIVE_BOOKINGS_PER_PHONE,
  MAX_NAME_LENGTH,
} from '../config';
import { createBooking, getCustomerProfile } from '../data/bookings';
import {
  NotBookableError,
  SignInRequiredError,
  SlotTakenError,
  TimePassedError,
  TooManyBookingsError,
} from '../data/errors';
import { store } from '../data/firebase';
import { formatLebanesePhone, normalizeLebanesePhone } from '../lib/phone';
import { formatPrice, localServiceName } from '../lib/shop';
import { formatDayLong } from '../lib/time';
import type { Barber, DateKey, Service, ShopConfirmedBooking, TimeString } from '../types';
import { buttonBrass, buttonOutline, inputBase, Notice } from './ui';

interface Props {
  /** The signed-in Google customer the booking is for. */
  customer: User;
  service: Service;
  /** The chosen barber, or null for "Any barber". */
  barber: Barber | null;
  date: DateKey;
  startTime: TimeString;
  onBooked: (booking: ShopConfirmedBooking) => void;
  onCancel: () => void;
}

export function BookingForm({ customer, service, barber, date, startTime, onBooked, onCancel }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // True once the chosen time can't be booked anymore, so only "go back" makes sense.
  const [slotLost, setSlotLost] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Pre-fill from their last booking (or the Google name the first time), without
  // overwriting anything they started typing meanwhile.
  const { uid, displayName } = customer;
  useEffect(() => {
    let active = true;
    getCustomerProfile(store, uid)
      .then((profile) => {
        if (!active) return;
        const fallbackName = (displayName ?? '').slice(0, MAX_NAME_LENGTH).trim();
        setName((current) => current || (profile?.name ?? fallbackName));
        if (profile) setPhone((current) => current || formatLebanesePhone(profile.phone));
      })
      .catch(console.error);
    return () => {
      active = false;
    };
  }, [uid, displayName]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const trimmedName = name.trim();
    const normalizedPhone = normalizeLebanesePhone(phone);
    setNameError(trimmedName.length >= 2 ? null : t('form.nameError'));
    setPhoneError(normalizedPhone ? null : t('form.phoneError'));
    if (trimmedName.length < 2 || !normalizedPhone) return;

    setSubmitting(true);
    try {
      const booking = await createBooking(store, {
        name: trimmedName,
        phone: normalizedPhone,
        service,
        date,
        startTime,
        barberId: barber?.id ?? null,
      });
      onBooked(booking);
    } catch (err) {
      if (err instanceof SlotTakenError) {
        setSlotLost(true);
        setSubmitError(
          barber ? t('form.takenWithBarber', { name: barber.name }) : t('form.takenAny'),
        );
      } else if (err instanceof TimePassedError) {
        setSlotLost(true);
        setSubmitError(t('form.passed'));
      } else if (err instanceof NotBookableError) {
        setSlotLost(true);
        setSubmitError(t('form.notAvailable'));
      } else if (err instanceof TooManyBookingsError) {
        setSubmitError(
          err.limitedBy === 'account'
            ? t('form.tooManyAccount', { max: MAX_ACTIVE_BOOKINGS_PER_ACCOUNT })
            : t('form.tooManyPhone', { max: MAX_ACTIVE_BOOKINGS_PER_PHONE }),
        );
      } else if (err instanceof SignInRequiredError) {
        setSubmitError(t('form.signedOut'));
      } else {
        console.error(err);
        setSubmitError(t('common.somethingWrong'));
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-charcoal/60 sm:items-center">
      <form
        onSubmit={handleSubmit}
        noValidate
        aria-labelledby="details-title"
        className="max-h-full w-full max-w-xl overflow-y-auto rounded-t-3xl bg-cream p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:rounded-3xl"
      >
        <h2 id="details-title" className="caps text-xl font-semibold">
          {t('form.title')}
        </h2>
        <p className="mt-1 text-sm text-ink">
          {localServiceName(service)}
          {service.price !== undefined && ` · ${formatPrice(service.price)}`} ·{' '}
          {t('form.summary', { day: formatDayLong(date), time: startTime })}
        </p>
        <p className="text-sm text-ink">
          {barber ? t('booking.withBarber', { name: barber.name }) : t('form.withAnyFree')}
        </p>
        <p className="mb-5 break-all text-sm text-muted-strong">{t('form.bookingAs', { email: customer.email })}</p>

        <label className="mb-4 block">
          <span className="caps mb-1 block text-xs font-semibold">{t('common.name')}</span>
          <input
            type="text"
            autoComplete="name"
            maxLength={MAX_NAME_LENGTH}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting || slotLost}
            className={`${inputBase} w-full`}
          />
          {nameError && <span className="mt-1 block text-sm text-pole-red">{nameError}</span>}
        </label>

        <label className="mb-6 block">
          <span className="caps mb-1 block text-xs font-semibold">{t('common.phone')}</span>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            placeholder={t('common.phonePlaceholder')}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={submitting || slotLost}
            className={`${inputBase} w-full text-start tabular-nums rtl:text-end`}
          />
          {phoneError && <span className="mt-1 block text-sm text-pole-red">{phoneError}</span>}
        </label>

        {submitError && (
          <Notice tone="error" className="mb-4">
            {submitError}
          </Notice>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className={`${buttonOutline} flex-1`}
          >
            {slotLost ? t('form.pickAnother') : t('common.back')}
          </button>
          {!slotLost && (
            <button type="submit" disabled={submitting} className={`${buttonBrass} caps flex-1`}>
              {submitting ? t('form.booking') : t('form.book')}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
