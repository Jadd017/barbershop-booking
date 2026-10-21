import { useState, type FormEvent } from 'react';
import { createBooking, SlotTakenError, TimePassedError } from '../data/api';
import { normalizeLebanesePhone } from '../lib/phone';
import { formatDayLong } from '../lib/time';
import type { ConfirmedBooking, DateKey, Service, TimeString } from '../types';

interface Props {
  service: Service;
  date: DateKey;
  startTime: TimeString;
  onBooked: (booking: ConfirmedBooking) => void;
  onCancel: () => void;
}

export function BookingForm({ service, date, startTime, onBooked, onCancel }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // True once the chosen time can't be booked anymore, so only "go back" makes sense.
  const [slotLost, setSlotLost] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const trimmedName = name.trim();
    const normalizedPhone = normalizeLebanesePhone(phone);
    setNameError(trimmedName.length >= 2 ? null : 'Please enter your name.');
    setPhoneError(
      normalizedPhone ? null : 'Enter a Lebanese mobile number, e.g. +961 70 123 456 or 03 123 456.',
    );
    if (trimmedName.length < 2 || !normalizedPhone) return;

    setSubmitting(true);
    try {
      const booking = await createBooking({
        name: trimmedName,
        phone: normalizedPhone,
        service,
        date,
        startTime,
      });
      onBooked(booking);
    } catch (err) {
      if (err instanceof SlotTakenError) {
        setSlotLost(true);
        setSubmitError('Sorry, this time was just taken, please pick another.');
      } else if (err instanceof TimePassedError) {
        setSlotLost(true);
        setSubmitError('Sorry, this time has already passed, please pick another.');
      } else {
        console.error(err);
        setSubmitError('Something went wrong. Check your connection and try again.');
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-10 flex items-end justify-center bg-black/40 sm:items-center">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="w-full max-w-xl rounded-t-2xl bg-white p-6 sm:rounded-2xl"
      >
        <h2 className="text-lg font-bold">Your details</h2>
        <p className="mb-5 text-sm text-neutral-600">
          {service.name} · {formatDayLong(date)} at {startTime}
        </p>

        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-medium">Name</span>
          <input
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting || slotLost}
            className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-900"
          />
          {nameError && <span className="mt-1 block text-sm text-red-600">{nameError}</span>}
        </label>

        <label className="mb-6 block">
          <span className="mb-1 block text-sm font-medium">Phone</span>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+961 70 123 456"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={submitting || slotLost}
            className="w-full rounded-xl border border-neutral-300 px-4 py-3 tabular-nums outline-none focus:border-neutral-900"
          />
          {phoneError && <span className="mt-1 block text-sm text-red-600">{phoneError}</span>}
        </label>

        {submitError && (
          <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {submitError}
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 rounded-xl border border-neutral-300 px-5 py-3 font-semibold hover:border-neutral-500"
          >
            {slotLost ? 'Pick another time' : 'Back'}
          </button>
          {!slotLost && (
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-xl bg-neutral-900 px-5 py-3 font-semibold text-white hover:bg-neutral-700 disabled:opacity-60"
            >
              {submitting ? 'Booking…' : 'Book'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
