import { X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { MAX_NAME_LENGTH } from '../../config';
import { createBooking, SlotTakenError, TimePassedError } from '../../data/api';
import { useStartTimes } from '../../hooks/useStartTimes';
import { normalizeLebanesePhone } from '../../lib/phone';
import { toDateKey } from '../../lib/time';
import type { DateKey, Settings, TimeString } from '../../types';
import { ServicePicker } from '../ServicePicker';
import { TimeGrid } from '../TimeGrid';
import { buttonBrass, inputBase, Notice, StepLabel } from '../ui';

interface Props {
  settings: Settings;
  initialDate: DateKey;
  onClose: () => void;
  /** Called with the day the booking was added to, so the dashboard can show it. */
  onAdded: (date: DateKey) => void;
}

/**
 * Walk-ins and phone bookings. Uses the same live availability and the same
 * createBooking transaction as customers, so it can't double-book either.
 */
export function AddBookingSheet({ settings, initialDate, onClose, onAdded }: Props) {
  const [today] = useState(() => toDateKey(new Date()));
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [day, setDay] = useState<DateKey>(initialDate < today ? today : initialDate);
  const [time, setTime] = useState<TimeString | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const service = settings.services.find((s) => s.id === serviceId) ?? null;
  const { startTimes, error: slotsError } = useStartTimes(day, service, settings);
  // Drops the selection if someone else books it meanwhile.
  const selectedTime = startTimes?.some((o) => o.time === time && o.available) ? time : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const normalizedPhone = phone.trim() ? normalizeLebanesePhone(phone) : null;
    if (!service || !selectedTime) return setError('Pick a service and a free time.');
    if (trimmedName.length < 2) return setError('Enter the customer name.');
    if (phone.trim() && !normalizedPhone) {
      return setError('That phone number looks wrong. Leave it empty if you don\'t have one.');
    }

    setSaving(true);
    try {
      await createBooking({
        name: trimmedName,
        phone: normalizedPhone,
        service,
        date: day,
        startTime: selectedTime,
      });
      onAdded(day);
    } catch (err) {
      if (err instanceof SlotTakenError) {
        setError('Sorry, this time was just taken, please pick another.');
      } else if (err instanceof TimePassedError) {
        setError('This time has already passed, please pick another.');
      } else {
        console.error(err);
        setError("Couldn't save. Check your connection and try again.");
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
              Walk-in
            </h2>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="inline-flex min-h-11 items-center gap-1.5 px-1 text-sm font-semibold text-line hover:text-cream"
            >
              <X aria-hidden size={18} />
              Close
            </button>
          </div>
        </header>

        <div className="mx-auto max-w-xl px-4 pb-32 pt-5">
          <section className="mb-6">
            <StepLabel step={1}>Service</StepLabel>
            <ServicePicker
              services={settings.services}
              selectedId={serviceId}
              onSelect={(id) => {
                setServiceId(id);
                setTime(null);
              }}
            />
          </section>

          <section className="mb-6">
            <StepLabel step={2}>Day</StepLabel>
            <input
              type="date"
              aria-label="Day"
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
              <StepLabel step={3}>Time</StepLabel>
              {slotsError ? (
                <Notice tone="error">Couldn't load times. Check your connection.</Notice>
              ) : startTimes ? (
                <TimeGrid options={startTimes} selected={selectedTime} onSelect={setTime} />
              ) : (
                <p className="text-sm text-muted-strong">Loading times…</p>
              )}
            </section>
          )}

          <label className="mb-4 block">
            <span className="caps mb-1 block text-xs font-semibold">Name</span>
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
              Phone <span className="font-normal normal-case tracking-normal text-muted-strong">(optional)</span>
            </span>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="+961 70 123 456"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={saving}
              className={`${inputBase} w-full tabular-nums`}
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
              {saving ? 'Saving…' : selectedTime ? `Add booking at ${selectedTime}` : 'Pick a time'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
