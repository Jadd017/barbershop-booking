import { useState, type FormEvent } from 'react';
import { createBooking, SlotTakenError, TimePassedError } from '../../data/api';
import { useStartTimes } from '../../hooks/useStartTimes';
import { normalizeLebanesePhone } from '../../lib/phone';
import { toDateKey } from '../../lib/time';
import type { DateKey, Settings, TimeString } from '../../types';
import { ServicePicker } from '../ServicePicker';
import { TimeGrid } from '../TimeGrid';

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
    <div className="fixed inset-0 z-20 overflow-y-auto bg-white">
      <form onSubmit={handleSubmit} noValidate className="mx-auto max-w-xl px-4 pb-32 pt-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold">Add booking</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 underline"
          >
            Close
          </button>
        </div>

        <section className="mb-6">
          <h3 className="mb-2 font-semibold">Service</h3>
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
          <h3 className="mb-2 font-semibold">Day</h3>
          <input
            type="date"
            min={today}
            value={day}
            onChange={(e) => {
              if (e.target.value) {
                setDay(e.target.value);
                setTime(null);
              }
            }}
            className="w-full rounded-xl border border-neutral-300 px-4 py-3"
          />
        </section>

        {service && (
          <section className="mb-6">
            <h3 className="mb-2 font-semibold">Time</h3>
            {slotsError ? (
              <p className="text-sm text-red-600">Couldn't load times. Check your connection.</p>
            ) : startTimes ? (
              <TimeGrid options={startTimes} selected={selectedTime} onSelect={setTime} />
            ) : (
              <p className="text-sm text-neutral-500">Loading times…</p>
            )}
          </section>
        )}

        <label className="mb-4 block">
          <span className="mb-1 block font-semibold">Name</span>
          <input
            type="text"
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
            className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-900"
          />
        </label>

        <label className="mb-6 block">
          <span className="mb-1 block font-semibold">
            Phone <span className="font-normal text-neutral-500">(optional)</span>
          </span>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="+961 70 123 456"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={saving}
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
          disabled={saving || !selectedTime}
          className="w-full rounded-xl bg-neutral-900 px-5 py-4 font-semibold text-white hover:bg-neutral-700 disabled:opacity-40"
        >
          {saving ? 'Saving…' : selectedTime ? `Add booking at ${selectedTime}` : 'Pick a time'}
        </button>
      </form>
    </div>
  );
}
