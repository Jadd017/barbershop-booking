import { CalendarDays, Check, Copy, MapPin, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { timeRange } from '../i18n';
import { bookingServiceName, formatPrice, isSafeLink } from '../lib/shop';
import { formatDayLong, minutesToTime, timeToMinutes } from '../lib/time';
import { bookingWhatsappLink } from '../lib/whatsapp';
import type { ShopConfirmedBooking } from '../types';
import { LanguageBar } from './LanguageToggle';
import { BarberPole, buttonOutline, linkButton } from './ui';

interface Props {
  booking: ShopConfirmedBooking;
  shopName: string;
  /** The shop's WhatsApp number the booking is sent to; empty until the owner sets one. */
  whatsapp: string;
  /** From the settings; "Get directions" only shows for a safe https link. */
  mapsUrl: string;
  shopAddress: string;
  onDone: () => void;
}

export function Confirmation({ booking, shopName, whatsapp, mapsUrl, shopAddress, onDone }: Props) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const end = minutesToTime(timeToMinutes(booking.startTime) + booking.durationMinutes);
  const canCopy = typeof navigator !== 'undefined' && !!navigator.clipboard;

  function copyCode() {
    navigator.clipboard
      .writeText(booking.bookingCode)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(console.error);
  }

  const rows: [string, string][] = [
    [t('confirmation.barber'), booking.barberName],
    [
      t('confirmation.service'),
      `${bookingServiceName(booking, [])} · ${t('common.minutes', { minutes: booking.durationMinutes })}`,
    ],
    ...(booking.price !== undefined
      ? [[t('confirmation.price'), formatPrice(booking.price)] as [string, string]]
      : []),
    [t('confirmation.day'), formatDayLong(booking.date)],
    [t('confirmation.time'), timeRange(booking.startTime, end)],
  ];

  return (
    <div className="min-h-screen">
      <BarberPole />
      <LanguageBar />
      <main className="mx-auto max-w-md px-4 pb-16 pt-4 text-center">
        <div
          aria-hidden
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-charcoal text-brass-light"
        >
          <Check size={32} strokeWidth={2.5} />
        </div>
        <h1 className="caps mb-2 text-3xl font-semibold">
          {whatsapp ? t('confirmation.almostDone') : t('confirmation.booked')}
        </h1>
        <p role="alert" className="mb-6 text-ink">
          {booking.anyBarber && t('confirmation.bookedWith', { name: booking.barberName })}
          {whatsapp
            ? t('confirmation.sendToComplete', { shop: shopName })
            : t('confirmation.seeYou', { shop: shopName })}
        </p>

        {/* The ticket: details, a perforated line, then the code. */}
        <div className="relative mb-6 rounded-2xl border border-line bg-card text-start shadow-sm">
          <dl className="px-5 pb-4 pt-5">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 py-1.5">
                <dt className="caps text-xs font-medium text-muted">{label}</dt>
                <dd className="text-end font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <div aria-hidden className="relative">
            <div className="mx-5 border-t-2 border-dashed border-line" />
            <span className="absolute -left-3 -top-3 h-6 w-6 rounded-full border border-line bg-cream [clip-path:inset(0_0_0_50%)]" />
            <span className="absolute -right-3 -top-3 h-6 w-6 rounded-full border border-line bg-cream [clip-path:inset(0_50%_0_0)]" />
          </div>
          <div className="px-5 pb-5 pt-4 text-center">
            <p className="caps mb-1 text-xs font-medium text-muted">{t('confirmation.bookingCode')}</p>
            <div className="flex items-center justify-center gap-2">
              <p lang="en" dir="ltr" className="caps select-all text-4xl font-semibold tracking-[0.3em] tabular-nums">
                {booking.bookingCode}
              </p>
              {canCopy && (
                <button
                  type="button"
                  onClick={copyCode}
                  aria-label={copied ? t('confirmation.copied') : t('confirmation.copyCode')}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line text-ink hover:border-muted"
                >
                  {copied ? <Check aria-hidden size={18} /> : <Copy aria-hidden size={18} />}
                </button>
              )}
            </div>
            <p aria-live="polite" className="mt-1 h-5 text-sm text-muted">
              {copied ? t('confirmation.copied') : ''}
            </p>
          </div>
        </div>

        {whatsapp && (
          <>
            {/* Same tab, no target="_blank": the most reliable way to hand off to the app on mobile. */}
            <a
              href={bookingWhatsappLink(booking, shopName, whatsapp)}
              className="caps mb-2 flex min-h-16 items-center justify-center gap-3 rounded-2xl bg-whatsapp px-6 text-2xl font-semibold text-white shadow-md hover:brightness-110"
            >
              <MessageCircle aria-hidden size={24} />
              {t('confirmation.sendWhatsapp')}
            </a>
            <p className="mb-8 text-sm text-muted-strong">{t('confirmation.whatsappDidntOpen')}</p>
          </>
        )}

        <div className="flex flex-col items-center gap-3">
          <Link to="/my-bookings" className={`${buttonOutline} w-full`}>
            <CalendarDays aria-hidden size={18} />
            {t('header.myBookings')}
          </Link>
          {isSafeLink(mapsUrl) && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${buttonOutline} w-full`}
            >
              <MapPin aria-hidden size={18} />
              {t('confirmation.directions')}
            </a>
          )}
          {shopAddress && <p className="text-sm text-muted-strong">{shopAddress}</p>}
          <button type="button" onClick={onDone} className={`${linkButton} text-muted-strong underline`}>
            {t('confirmation.bookAnother')}
          </button>
        </div>
        <p className="mt-6 text-sm text-muted-strong">{t('confirmation.seeOrCancel')}</p>
      </main>
    </div>
  );
}
