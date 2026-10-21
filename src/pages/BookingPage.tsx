import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { BookingForm } from '../components/BookingForm';
import { Confirmation } from '../components/Confirmation';
import { DayPicker } from '../components/DayPicker';
import { ServicePicker } from '../components/ServicePicker';
import { TimeGrid } from '../components/TimeGrid';
import { DAYS_TO_SHOW } from '../config';
import { getSettings } from '../data/api';
import { useStartTimes } from '../hooks/useStartTimes';
import { clearLastBooking, loadLastBooking, saveLastBooking, type LastBooking } from '../lib/lastBooking';
import { formatDayLong, upcomingDateKeys } from '../lib/time';
import { bookingWhatsappLink } from '../lib/whatsapp';
import type { ConfirmedBooking, DateKey, Settings, TimeString } from '../types';

export function BookingPage() {
  const days = useMemo(() => upcomingDateKeys(DAYS_TO_SHOW), []);

  const [settings, setSettings] = useState<Settings | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [day, setDay] = useState<DateKey>(days[0]);
  const [time, setTime] = useState<TimeString | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  // Restored on load so returning from WhatsApp brings the confirmation back.
  const [confirmed, setConfirmed] = useState<LastBooking | null>(loadLastBooking);

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  const service = settings?.services.find((s) => s.id === serviceId) ?? null;
  const { startTimes, error: slotsError } = useStartTimes(day, service, settings);

  // If someone else books the selected time (or it passes), drop the selection.
  const selectedTime = startTimes?.some((o) => o.time === time && o.available) ? time : null;

  function selectService(id: string) {
    setServiceId(id);
    setTime(null);
  }

  function selectDay(d: DateKey) {
    setDay(d);
    setTime(null);
  }

  function handleBooked(booking: ConfirmedBooking) {
    const barberName = settings?.barberName ?? '';
    // Save first: the redirect below leaves the page, and it may be reloaded on return.
    saveLastBooking({ booking, barberName });
    setFormOpen(false);
    setConfirmed({ booking, barberName });
    // Same-tab navigation isn't stopped by popup blockers and hands off to the app on mobile.
    window.location.assign(bookingWhatsappLink(booking, barberName));
  }

  function bookAnother() {
    clearLastBooking();
    setConfirmed(null);
    setServiceId(null);
    setTime(null);
  }

  if (confirmed) {
    return (
      <Confirmation
        booking={confirmed.booking}
        barberName={confirmed.barberName}
        onDone={bookAnother}
      />
    );
  }

  if (!settings) {
    return <p className="p-6 text-center text-neutral-500">Loading…</p>;
  }

  return (
    <div className="mx-auto min-h-screen max-w-xl px-4 pb-40 pt-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">Book with {settings.barberName}</h1>
        <p className="text-sm text-neutral-500">
          Open {settings.workingHours.start}–{settings.workingHours.end} · Break{' '}
          {settings.breakTime.start}–{settings.breakTime.end}
        </p>
        <Link to="/manage" className="mt-2 inline-block text-sm font-medium underline">
          Manage or cancel a booking
        </Link>
      </header>

      <section className="mb-8">
        <h2 className="mb-3 font-semibold">1. Choose a service</h2>
        <ServicePicker services={settings.services} selectedId={serviceId} onSelect={selectService} />
      </section>

      {service && (
        <>
          <section className="mb-8">
            <h2 className="mb-3 font-semibold">2. Choose a day</h2>
            <DayPicker days={days} selected={day} onSelect={selectDay} />
          </section>

          <section>
            <h2 className="mb-3 font-semibold">3. Choose a time</h2>
            {slotsError ? (
              <p className="text-sm text-red-600">
                Couldn't load available times. Check your connection and refresh.
              </p>
            ) : startTimes ? (
              <TimeGrid options={startTimes} selected={selectedTime} onSelect={setTime} />
            ) : (
              <p className="text-sm text-neutral-500">Loading times…</p>
            )}
          </section>
        </>
      )}

      {service && selectedTime && !formOpen && (
        <div className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-4 px-4 py-4">
            <div className="text-sm">
              <p className="font-semibold">
                {service.name} · {service.durationMinutes} min
              </p>
              <p className="text-neutral-600">
                {formatDayLong(day)} at {selectedTime}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="shrink-0 rounded-xl bg-neutral-900 px-5 py-3 font-semibold text-white hover:bg-neutral-700"
            >
              Confirm
            </button>
          </div>
        </div>
      )}

      {service && time && formOpen && (
        <BookingForm
          service={service}
          date={day}
          startTime={time}
          onBooked={handleBooked}
          onCancel={() => setFormOpen(false)}
        />
      )}
    </div>
  );
}
