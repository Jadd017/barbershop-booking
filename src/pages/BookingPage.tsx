import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AccountLine } from '../components/AccountLine';
import { BookingForm } from '../components/BookingForm';
import { Confirmation } from '../components/Confirmation';
import { DayPicker } from '../components/DayPicker';
import { ServicePicker } from '../components/ServicePicker';
import { TimeGrid } from '../components/TimeGrid';
import {
  finishRedirectSignIn,
  isInAppBrowser,
  signInErrorMessage,
  signInWithGoogle,
  signOutCustomer,
} from '../data/auth';
import { useCustomer } from '../hooks/useCustomer';
import { useSettings } from '../hooks/useSettings';
import { useStartTimes } from '../hooks/useStartTimes';
import { clearLastBooking, loadLastBooking, saveLastBooking, type LastBooking } from '../lib/lastBooking';
import { clearPendingBooking, loadPendingBooking, savePendingBooking } from '../lib/pendingBooking';
import { bookableDays, weeklyHoursSummary } from '../lib/schedule';
import { formatDayLong, toDateKey } from '../lib/time';
import { bookingWhatsappLink } from '../lib/whatsapp';
import type { ConfirmedBooking, DateKey, TimeString } from '../types';

export function BookingPage() {
  const customer = useCustomer();
  // Live, so changes Eddy makes (hours, services, days off) show up straight away.
  const { settings, error: settingsError } = useSettings();
  const [today] = useState(() => toDateKey(new Date()));
  const days = useMemo(() => (settings ? bookableDays(settings) : []), [settings]);

  // The choice made before a redirect sign-in, which reloaded the page.
  const [pending] = useState(loadPendingBooking);
  const [serviceId, setServiceId] = useState<string | null>(pending?.serviceId ?? null);
  const [chosenDay, setDay] = useState<DateKey | null>(pending?.day ?? null);
  const [time, setTime] = useState<TimeString | null>(pending?.time ?? null);
  const [formOpen, setFormOpen] = useState(false);
  // True until the restored choice is checked, then the form reopens if it's still free.
  const [resuming, setResuming] = useState(pending !== null);
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  // Restored on load so returning from WhatsApp brings the confirmation back.
  const [confirmed, setConfirmed] = useState<LastBooking | null>(loadLastBooking);

  useEffect(() => {
    finishRedirectSignIn().catch((err) => setSignInError(signInErrorMessage(err)));
    // Already restored above; acting on it again on a later reload would be a surprise.
    clearPendingBooking();
  }, []);

  // Falls back to the first open day if the chosen one is no longer offered (e.g. Eddy closed it).
  const day = chosenDay && days.includes(chosenDay) ? chosenDay : (days[0] ?? today);
  const service = settings?.services.find((s) => s.id === serviceId) ?? null;
  const { startTimes, error: slotsError } = useStartTimes(day, service, settings ?? null);

  // If someone else books the selected time (or it passes), drop the selection.
  const selectedTime = startTimes?.some((o) => o.time === time && o.available) ? time : null;

  // Back from a redirect sign-in: once we know who's signed in and which times are free,
  // go straight to the form (or leave the choice on screen if sign-in didn't happen).
  if (resuming && customer !== undefined && settings && (!service || startTimes)) {
    setResuming(false);
    if (customer && selectedTime) setFormOpen(true);
  }

  function selectService(id: string) {
    setServiceId(id);
    setTime(null);
  }

  function selectDay(d: DateKey) {
    setDay(d);
    setTime(null);
  }

  async function handleConfirm() {
    if (customer) {
      setFormOpen(true);
      return;
    }
    if (!service || !selectedTime) return;
    setSignInError(null);
    // Saved first in case sign-in falls back to a redirect, which reloads the page.
    savePendingBooking({ serviceId: service.id, day, time: selectedTime });
    setSigningIn(true);
    try {
      // Called before any other await, so the popup still counts as opened by the tap.
      if ((await signInWithGoogle()) === 'redirecting') return;
      clearPendingBooking();
      setFormOpen(true);
    } catch (err) {
      clearPendingBooking();
      setSignInError(signInErrorMessage(err));
    }
    setSigningIn(false);
  }

  function signOut() {
    setFormOpen(false);
    signOutCustomer().catch(console.error);
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

  if (settingsError) {
    return (
      <p className="p-6 text-center text-red-600">
        Couldn't load the booking page. Check your connection and refresh.
      </p>
    );
  }

  if (settings === undefined) {
    return <p className="p-6 text-center text-neutral-500">Loading…</p>;
  }

  if (settings === null) {
    return <p className="p-6 text-center text-neutral-500">Online booking opens soon.</p>;
  }

  return (
    <div className="mx-auto min-h-screen max-w-xl px-4 pb-40 pt-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">Book with {settings.barberName}</h1>
        <ul className="text-sm text-neutral-500">
          {weeklyHoursSummary(settings).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <Link to="/my-bookings" className="mt-2 inline-block text-sm font-medium underline">
          My bookings
        </Link>
        {customer && (
          <div className="mt-1">
            <AccountLine customer={customer} onSignOut={signOut} />
          </div>
        )}
      </header>

      <section className="mb-8">
        <h2 className="mb-3 font-semibold">1. Choose a service</h2>
        <ServicePicker services={settings.services} selectedId={serviceId} onSelect={selectService} />
      </section>

      {service && (
        <>
          <section className="mb-8">
            <h2 className="mb-3 font-semibold">2. Choose a day</h2>
            {days.length > 0 ? (
              <DayPicker days={days} today={today} selected={day} onSelect={selectDay} />
            ) : (
              <p className="text-sm text-neutral-500">No days open for booking right now.</p>
            )}
          </section>

          {days.length > 0 && (
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
          )}
        </>
      )}

      {service && selectedTime && !formOpen && (
        <div className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-white/95 backdrop-blur">
          {(signInError || (!customer && isInAppBrowser())) && (
            <p role="alert" className="mx-auto max-w-xl px-4 pt-3 text-sm text-red-700">
              {signInError ??
                "Google sign-in may not work inside this app. If it fails, open this page in Chrome or Safari."}
            </p>
          )}
          <div className="mx-auto flex max-w-xl items-center justify-between gap-4 px-4 py-4">
            <div className="text-sm">
              <p className="font-semibold">
                {service.name} · {service.durationMinutes} min
              </p>
              <p className="text-neutral-600">
                {formatDayLong(day)} at {selectedTime}
              </p>
            </div>
            <div className="shrink-0 text-center">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={signingIn || customer === undefined}
                className="rounded-xl bg-neutral-900 px-5 py-3 font-semibold text-white hover:bg-neutral-700 disabled:opacity-60"
              >
                {signingIn ? 'Signing in…' : 'Confirm'}
              </button>
              {customer === null && (
                <p className="mt-1 text-xs text-neutral-500">Sign in with Google next</p>
              )}
            </div>
          </div>
        </div>
      )}

      {service && time && formOpen && customer && (
        <BookingForm
          customer={customer}
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
