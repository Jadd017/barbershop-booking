import { ArrowRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { BookingForm } from '../components/BookingForm';
import { Confirmation } from '../components/Confirmation';
import { DayPicker } from '../components/DayPicker';
import { ServicePicker } from '../components/ServicePicker';
import { ShopHeader } from '../components/ShopHeader';
import { TimeGrid } from '../components/TimeGrid';
import { buttonBrass, Notice, PageMessage, StepLabel } from '../components/ui';
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
import { weeklyHoursSummary, windowDays } from '../lib/schedule';
import { formatPrice } from '../lib/shop';
import { fromDateKey, minutesToTime, timeToMinutes, toDateKey } from '../lib/time';
import { bookingWhatsappLink } from '../lib/whatsapp';
import type { ConfirmedBooking, DateKey, TimeString } from '../types';

export function BookingPage() {
  const customer = useCustomer();
  // Live, so changes Eddy makes (hours, services, days off) show up straight away.
  const { settings, error: settingsError } = useSettings();
  const [today] = useState(() => toDateKey(new Date()));
  // Closed days are shown too, but only open ones (bookableDays) can be picked.
  const allDays = useMemo(() => (settings ? windowDays(settings) : []), [settings]);
  const days = useMemo(() => allDays.filter((d) => d.open).map((d) => d.date), [allDays]);

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
        mapsUrl={settings?.mapsUrl ?? ''}
        shopAddress={settings?.shopAddress ?? ''}
        onDone={bookAnother}
      />
    );
  }

  if (settingsError) {
    return (
      <PageMessage error>Couldn't load the booking page. Check your connection and refresh.</PageMessage>
    );
  }

  if (settings === undefined) return <PageMessage>Loading…</PageMessage>;

  if (settings === null) return <PageMessage>Online booking opens soon.</PageMessage>;

  const end = selectedTime && service
    ? minutesToTime(timeToMinutes(selectedTime) + service.durationMinutes)
    : null;

  return (
    <div className="min-h-screen pb-44">
      <ShopHeader
        barberName={settings.barberName}
        settings={settings}
        today={today}
        customer={customer}
        onSignOut={signOut}
      />

      <main className="mx-auto max-w-xl px-4 pt-6">
        <section className="mb-8">
          <StepLabel step={1}>Service</StepLabel>
          <ServicePicker services={settings.services} selectedId={serviceId} onSelect={selectService} />
        </section>

        {service && (
          <>
            <section className="mb-8">
              <StepLabel step={2}>Day</StepLabel>
              {days.length > 0 ? (
                <DayPicker days={allDays} today={today} selected={day} onSelect={selectDay} />
              ) : (
                <p className="text-sm text-muted-strong">No days open for booking right now.</p>
              )}
            </section>

            {days.length > 0 && (
              <section className="mb-8">
                <StepLabel step={3}>Time</StepLabel>
                {slotsError ? (
                  <Notice tone="error">
                    Couldn't load available times. Check your connection and refresh.
                  </Notice>
                ) : startTimes ? (
                  <TimeGrid options={startTimes} selected={selectedTime} onSelect={setTime} />
                ) : (
                  <p className="text-sm text-muted-strong">Loading times…</p>
                )}
              </section>
            )}
          </>
        )}

        <section className="border-t border-line pt-5 text-sm text-muted-strong">
          <h2 className="caps mb-1 text-xs font-semibold text-ink">Opening hours</h2>
          <ul>
            {weeklyHoursSummary(settings).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {settings.shopAddress && <p className="mt-2">{settings.shopAddress}</p>}
        </section>
      </main>

      {service && selectedTime && end && !formOpen && (
        <div className="fixed inset-x-0 bottom-0 z-10 bg-charcoal pb-[env(safe-area-inset-bottom)] text-cream shadow-[0_-4px_16px_rgba(0,0,0,0.25)]">
          {(signInError || (!customer && isInAppBrowser())) && (
            <p role="alert" className="mx-auto max-w-xl px-4 pt-3 text-sm text-brass-light">
              {signInError ??
                "Google sign-in may not work inside this app. If it fails, open this page in Chrome or Safari."}
            </p>
          )}
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 text-sm">
              <p className="truncate font-semibold">
                {service.name}
                {service.price !== undefined && (
                  <span className="text-brass-light"> · {formatPrice(service.price)}</span>
                )}
              </p>
              <p className="text-line">
                {fromDateKey(day).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}{' '}
                · <span className="tabular-nums">{selectedTime}–{end}</span>
              </p>
              {customer === null && (
                <p className="text-xs text-line">You'll sign in with Google next</p>
              )}
            </div>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={signingIn || customer === undefined}
              className={`${buttonBrass} caps shrink-0 px-5 text-base`}
            >
              {signingIn ? 'Signing in…' : 'Book now'}
              {!signingIn && <ArrowRight aria-hidden size={18} />}
            </button>
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
