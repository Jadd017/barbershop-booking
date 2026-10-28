import { X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_NAME_LENGTH } from '../../config';
import { createWalkIn } from '../../data/bookings';
import { SlotTakenError } from '../../data/errors';
import { store } from '../../data/firebase';
import { useBarberTimes } from '../../hooks/useBarberTimes';
import { isPast } from '../../lib/slots';
import { notWorkingReason } from '../../lib/staffDay';
import { normalizeLebanesePhone } from '../../lib/phone';
import { toDateKey } from '../../lib/time';
import type { Barber, DateKey, ShopSettings, TimeString } from '../../types';
import { BarberChips } from './BarberChips';
import { ServicePicker } from '../ServicePicker';
import { TimeGrid } from '../TimeGrid';
import { buttonBrass, inputBase, Notice, StepLabel } from '../ui';

interface Props {
  shop: ShopSettings;
  /**
   * Who the walk-in can be for: a barber's own self only, or for the owner every active barber
   * (he picks one; there's no "Any barber" here).
   */
  barbers: Barber[];
  initialBarberId: string;
  initialDate: DateKey;
  onClose: () => void;
  /** Called with the day and barber the booking was added to, so the dashboard can show it. */
  onAdded: (date: DateKey, barberId: string) => void;
}

/**
 * Walk-ins and phone bookings: a barber adds them for himself, the owner for any barber. Offers
 * the times that barber is free (his hours, without breaks, blocked or booked time), live.
 * createWalkIn claims the slots in one transaction with his day, and the rules refuse a slot
 * that's already booked, so it can't double-book even if someone books the same time at that
 * moment.
 */
export function AddBookingSheet({ shop, barbers, initialBarberId, initialDate, onClose, onAdded }: Props) {
  const { t } = useTranslation();
  const [today] = useState(() => toDateKey(new Date()));
  const [barberId, setBarberId] = useState(initialBarberId);
  const barber = barbers.find((b) => b.id === barberId) ?? barbers[0];
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [day, setDay] = useState<DateKey>(initialDate < today ? today : initialDate);
  const [time, setTime] = useState<TimeString | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const service = shop.services.find((s) => s.id === serviceId) ?? null;
  const { startTimes, error: slotsError } = useBarberTimes(day, service, shop, [barber], barber.id);
  const self = barbers.length === 1;
  const offReason = notWorkingReason(shop, barber, day, self);
  // Drops the selection if someone else books it meanwhile.
  const selectedTime = startTimes?.some((o) => o.time === time && o.available) ? time : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const normalizedPhone = phone.trim() ? normalizeLebanesePhone(phone) : null;
    if (!service || !selectedTime) return setError(t('walkIn.pickServiceTime'));
    if (isPast(day, selectedTime)) {
      setTime(null);
      return setError(t('walkIn.passed'));
    }
    if (trimmedName.length < 2) return setError(t('walkIn.enterName'));
    if (phone.trim() && !normalizedPhone) {
      return setError(t('walkIn.phoneWrong'));
    }

    setSaving(true);
    try {
      await createWalkIn(store, {
        name: trimmedName,
        phone: normalizedPhone,
        service,
        date: day,
        startTime: selectedTime,
        barberId: barber.id,
      });
      onAdded(day, barber.id);
    } catch (err) {
      if (err instanceof SlotTakenError) {
        setError(t('walkIn.taken'));
      } else {
        console.error(err);
        setError(t('common.couldntSave'));
      }
      setTime(null);
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="walk-in-title"
      className="fixed inset-0 z-30 overflow-y-auto bg-cream"
    >
      <form onSubmit={handleSubmit} noValidate>
        <header className="sticky top-0 z-10 bg-charcoal text-cream">
          <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
            <h2 id="walk-in-title" className="caps text-2xl font-semibold tracking-[0.1em]">
              {t('walkIn.title')}
              {self ? '' : ` · ${barber.name}`}
            </h2>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="inline-flex min-h-11 items-center gap-1.5 px-1 text-sm font-semibold text-line hover:text-cream"
            >
              <X aria-hidden size={18} />
              {t('common.close')}
            </button>
          </div>
        </header>

        <div className="mx-auto max-w-xl px-4 pb-32 pt-5">
          {!self && (
            <section className="mb-6">
              <StepLabel step={1}>{t('common.barber')}</StepLabel>
              <BarberChips
                barbers={barbers}
                selected={barber.id}
                onSelect={(id) => {
                  setBarberId(id);
                  setTime(null);
                }}
              />
            </section>
          )}
          <section className="mb-6">
            <StepLabel step={self ? 1 : 2}>{t('common.service')}</StepLabel>
            <ServicePicker
              services={shop.services}
              selectedId={serviceId}
              onSelect={(id) => {
                setServiceId(id);
                setTime(null);
              }}
            />
          </section>

          <section className="mb-6">
            <StepLabel step={self ? 2 : 3}>{t('common.day')}</StepLabel>
            <input
              type="date"
              aria-label={t('common.day')}
              min={today}
              value={day}
              onChange={(e) => {
                if (e.target.value) {
                  setDay(e.target.value);
                  setTime(null);
                }
              }}
              className={`${inputBase} w-full`}
            />
          </section>

          {service && (
            <section className="mb-6">
              <StepLabel step={self ? 3 : 4}>{t('common.time')}</StepLabel>
              {slotsError ? (
                <Notice tone="error">{t('walkIn.timesError')}</Notice>
              ) : offReason ? (
                <Notice tone="warning">{t('walkIn.pickAnotherDay', { reason: offReason })}</Notice>
              ) : startTimes ? (
                <TimeGrid options={startTimes} selected={selectedTime} onSelect={setTime} />
              ) : (
                <p className="text-sm text-muted-strong">{t('booking.loadingTimes')}</p>
              )}
            </section>
          )}

          <label className="mb-4 block">
            <span className="caps mb-1 block text-xs font-semibold">{t('common.name')}</span>
            <input
              type="text"
              autoComplete="off"
              maxLength={MAX_NAME_LENGTH}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              className={`${inputBase} w-full`}
            />
          </label>

          <label className="mb-6 block">
            <span className="caps mb-1 block text-xs font-semibold">
              {t('common.phone')}{' '}
              <span className="font-normal normal-case tracking-normal text-muted-strong">{t('common.optional')}</span>
            </span>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="off"
              dir="ltr"
              placeholder={t('common.phonePlaceholder')}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={saving}
              className={`${inputBase} w-full text-start tabular-nums rtl:text-end`}
            />
          </label>

          {error && (
            <Notice tone="error" className="mb-4">
              {error}
            </Notice>
          )}
        </div>

        <div className="fixed inset-x-0 bottom-0 border-t border-line bg-cream/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="mx-auto max-w-xl px-4 py-3">
            <button
              type="submit"
              disabled={saving || !selectedTime}
              className={`${buttonBrass} caps min-h-14 w-full text-base`}
            >
              {saving ? t('common.saving') : selectedTime ? t('walkIn.addAt', { time: selectedTime }) : t('walkIn.pickTime')}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
