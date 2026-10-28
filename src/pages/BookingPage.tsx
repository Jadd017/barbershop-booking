import { ArrowRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarberPicker } from '../components/BarberPicker';
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
import { useBarberTimes } from '../hooks/useBarberTimes';
import { useCustomer } from '../hooks/useCustomer';
import { useShop } from '../hooks/useShop';
import { windowDaysFor } from '../lib/barberSchedule';
import { clearLastBooking, loadLastBooking, saveLastBooking, type LastBooking } from '../lib/lastBooking';
import { clearPendingBooking, loadPendingBooking, savePendingBooking } from '../lib/pendingBooking';
import { weeklyHoursSummary } from '../lib/schedule';
import { formatPrice, localServiceName } from '../lib/shop';
import { dateLocale } from '../i18n';
import { fromDateKey, minutesToTime, timeToMinutes, toDateKey } from '../lib/time';
import { bookingWhatsappLink } from '../lib/whatsapp';
import type { DateKey, ShopConfirmedBooking, TimeString } from '../types';

export function BookingPage() {
  const { t } = useTranslation();
  const customer = useCustomer();
  // Live, so changes the owner and barbers make (hours, services, days off) show up straight away.
  const { shop, barbers, error: shopError } = useShop();
  const [today] = useState(() => toDateKey(new Date()));
  const active = useMemo(() => (barbers ?? []).filter((b) => b.active), [barbers]);
  // A shop with one barber (Eddy) skips the barber step.
  const onlyBarber = active.length === 1 ? active[0] : null;

  // The choice made before a redirect sign-in, which reloaded the page.
  const [pending] = useState(loadPendingBooking);
  const [serviceId, setServiceId] = useState<string | null>(pending?.serviceId ?? null);
  // A barber's ID, null for "Any barber", undefined until chosen.
  const [barberChoice, setBarberChoice] = useState<string | null | undefined>(pending?.barberId);
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

  // The barber to book: the only one, or the chosen one while he's still active.
  const barberId: string | null | undefined = onlyBarber
    ? onlyBarber.id
    : barberChoice === null || active.some((b) => b.id === barberChoice)
      ? barberChoice
      : undefined;
  const barber = active.find((b) => b.id === barberId) ?? null;
  const service = shop?.services.find((s) => s.id === serviceId) ?? null;

  // Closed days are shown too, but only open ones can be picked. "Any barber" opens a day if
  // any barber works it.
  const allDays = useMemo(
    () =>
      shop && barberId !== undefined
        ? windowDaysFor(shop, barberId === null ? active : active.filter((b) => b.id === barberId))
        : [],
    [shop, active, barberId],
  );
  const days = allDays.filter((d) => d.open).map((d) => d.date);
  // Falls back to the first open day if the chosen one is no longer offered.
  const day = chosenDay && days.includes(chosenDay) ? chosenDay : (days[0] ?? today);
  const { startTimes, error: slotsError } = useBarberTimes(day, service, shop ?? null, active, barberId);

  // If someone else books the selected time (or it passes), drop the selection.
  const selectedTime = startTimes?.some((o) => o.time === time && o.available) ? time : null;

  // Back from a redirect sign-in: once we know who's signed in and which times are free,
  // go straight to the form (or leave the choice on screen if sign-in didn't happen).
  if (resuming && customer !== undefined && shop && barbers && (!service || barberId === undefined || startTimes)) {
    setResuming(false);
    if (customer && selectedTime) setFormOpen(true);
  }

  function selectService(id: string) {
    setServiceId(id);
    setTime(null);
  }

  function selectBarber(id: string | null) {
    setBarberChoice(id);
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
    if (!service || !selectedTime || barberId === undefined) return;
    setSignInError(null);
    // Saved first in case sign-in falls back to a redirect, which reloads the page.
    savePendingBooking({ serviceId: service.id, barberId, day, time: selectedTime });
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

  function handleBooked(booking: ShopConfirmedBooking) {
    const last = { booking, shopName: shop?.shopName ?? '', whatsapp: shop?.whatsapp ?? '' };
    // Save first: the redirect below leaves the page, and it may be reloaded on return.
    saveLastBooking(last);
    setFormOpen(false);
    setConfirmed(last);
    // Same-tab navigation isn't stopped by popup blockers and hands off to the app on mobile.
    if (last.whatsapp) window.location.assign(bookingWhatsappLink(booking, last.shopName, last.whatsapp));
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
        shopName={confirmed.shopName}
        whatsapp={confirmed.whatsapp}
        mapsUrl={shop?.mapsUrl ?? ''}
        shopAddress={shop?.shopAddress ?? ''}
        onDone={bookAnother}
      />
    );
  }

  if (shopError) {
    return (
      <PageMessage error>{t('booking.loadError')}</PageMessage>
    );
  }

  if (shop === undefined || barbers === undefined) return <PageMessage>{t('common.loading')}</PageMessage>;

  if (shop === null) return <PageMessage>{t('booking.opensSoon')}</PageMessage>;

  const end = selectedTime && service
    ? minutesToTime(timeToMinutes(selectedTime) + service.durationMinutes)
    : null;
  // Steps after the barber step move up one when it's skipped.
  const dayStep = onlyBarber ? 2 : 3;

  return (
    <div className="min-h-screen pb-44">
      <ShopHeader
        shopName={shop.shopName}
        shop={shop}
        today={today}
        customer={customer}
        onSignOut={signOut}
      />

      <main className="mx-auto max-w-xl px-4 pt-6">
        <section className="mb-8">
          <StepLabel step={1}>{t('common.service')}</StepLabel>
          <ServicePicker services={shop.services} selectedId={serviceId} onSelect={selectService} />
        </section>

        {service && active.length === 0 && (
          <p className="mb-8 text-sm text-muted-strong">{t('booking.noBarbers')}</p>
        )}

        {service && active.length > 1 && (
          <section className="mb-8">
            <StepLabel step={2}>{t('common.barber')}</StepLabel>
            <BarberPicker barbers={active} selected={barberId} onSelect={selectBarber} />
          </section>
        )}

        {service && barberId !== undefined && (
          <>
            <section className="mb-8">
              <StepLabel step={dayStep}>{t('common.day')}</StepLabel>
              {days.length > 0 ? (
                <DayPicker days={allDays} today={today} selected={day} onSelect={selectDay} />
              ) : (
                <p className="text-sm text-muted-strong">
                  {barber ? t('booking.barberNoDays', { name: barber.name }) : t('booking.noDays')}
                </p>
              )}
            </section>

            {days.length > 0 && (
              <section className="mb-8">
                <StepLabel step={dayStep + 1}>{t('common.time')}</StepLabel>
                {slotsError ? (
                  <Notice tone="error">{t('booking.timesError')}</Notice>
                ) : startTimes ? (
                  <TimeGrid options={startTimes} selected={selectedTime} onSelect={setTime} />
                ) : (
                  <p className="text-sm text-muted-strong">{t('booking.loadingTimes')}</p>
                )}
              </section>
            )}
          </>
        )}

        <section className="border-t border-line pt-5 text-sm text-muted-strong">
          <h2 className="caps mb-1 text-xs font-semibold text-ink">{t('booking.openingHours')}</h2>
          <ul>
            {weeklyHoursSummary(shop.openingHours).map((line) => (
              <li key={line} className="tabular-nums">{line}</li>
            ))}
          </ul>
          {shop.shopAddress && <p className="mt-2">{shop.shopAddress}</p>}
        </section>
      </main>

      {service && selectedTime && end && !formOpen && (
        <div className="fixed inset-x-0 bottom-0 z-10 bg-charcoal pb-[env(safe-area-inset-bottom)] text-cream shadow-[0_-4px_16px_rgba(0,0,0,0.25)]">
          {(signInError || (!customer && isInAppBrowser())) && (
            <p role="alert" className="mx-auto max-w-xl px-4 pt-3 text-sm text-brass-light">
              {signInError ?? t('signIn.inAppWarning')}
            </p>
          )}
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 text-sm">
              <p className="truncate font-semibold">
                {localServiceName(service)}
                {service.price !== undefined && (
                  <span className="text-brass-light">
                    {' · '}
                    <bdi dir="ltr">{formatPrice(service.price)}</bdi>
                  </span>
                )}
              </p>
              <p className="text-line">
                {fromDateKey(day).toLocaleDateString(dateLocale(), {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}{' '}
                · <span className="tabular-nums">{selectedTime}–{end}</span>
              </p>
              {!onlyBarber && (
                <p className="truncate text-line">
                  {barber ? t('booking.withBarber', { name: barber.name }) : t('booking.anyBarber')}
                </p>
              )}
              {customer === null && (
                <p className="text-xs text-line">{t('booking.signInNext')}</p>
              )}
            </div>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={signingIn || customer === undefined}
              className={`${buttonBrass} caps shrink-0 px-5 text-base`}
            >
              {signingIn ? t('signIn.signingIn') : t('booking.bookNow')}
              {!signingIn && <ArrowRight aria-hidden size={18} className="rtl:-scale-x-100" />}
            </button>
          </div>
        </div>
      )}

      {service && time && formOpen && customer && barberId !== undefined && (
        <BookingForm
          customer={customer}
          service={service}
          barber={barber}
          date={day}
          startTime={time}
          onBooked={handleBooked}
          onCancel={() => setFormOpen(false)}
        />
      )}
    </div>
  );
}
