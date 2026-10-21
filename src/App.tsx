import { useEffect, useMemo, useState } from 'react';
import { DayPicker } from './components/DayPicker';
import { ServicePicker } from './components/ServicePicker';
import { TimeGrid } from './components/TimeGrid';
import { DAYS_TO_SHOW } from './config';
import { getBookings, getSettings } from './data/api';
import { getStartTimes } from './lib/slots';
import { formatDayLong, upcomingDateKeys } from './lib/time';
import type { Booking, DateKey, Settings, TimeString } from './types';

export default function App() {
  const days = useMemo(() => upcomingDateKeys(DAYS_TO_SHOW), []);

  const [settings, setSettings] = useState<Settings | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [day, setDay] = useState<DateKey>(days[0]);
  const [time, setTime] = useState<TimeString | null>(null);
  // Bookings are tagged with the day they belong to, so stale data is never shown.
  const [bookings, setBookings] = useState<{ day: DateKey; items: Booking[] } | null>(null);

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getBookings(day).then((items) => {
      if (!cancelled) setBookings({ day, items });
    });
    return () => {
      cancelled = true;
    };
  }, [day]);

  const service = settings?.services.find((s) => s.id === serviceId) ?? null;
  const dayBookings = bookings?.day === day ? bookings.items : null;

  const startTimes = useMemo(() => {
    if (!settings || !service || !dayBookings) return null;
    return getStartTimes(day, service.durationMinutes, settings, dayBookings);
  }, [settings, service, day, dayBookings]);

  function selectService(id: string) {
    setServiceId(id);
    setTime(null);
  }

  function selectDay(d: DateKey) {
    setDay(d);
    setTime(null);
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
            {startTimes ? (
              <TimeGrid options={startTimes} selected={time} onSelect={setTime} />
            ) : (
              <p className="text-sm text-neutral-500">Loading times…</p>
            )}
          </section>
        </>
      )}

      {service && time && (
        <div className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-4 px-4 py-4">
            <div className="text-sm">
              <p className="font-semibold">
                {service.name} · {service.durationMinutes} min
              </p>
              <p className="text-neutral-600">
                {formatDayLong(day)} at {time}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                // Booking submission comes in phase 2.
              }}
              className="shrink-0 rounded-xl bg-neutral-900 px-5 py-3 font-semibold text-white hover:bg-neutral-700"
            >
              Confirm
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
