import type { User } from 'firebase/auth';
import { CalendarDays, LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useBranding } from '../hooks/useShop';
import { shopHoursOn } from '../lib/barberSchedule';
import type { DateKey, ShopSettings } from '../types';
import { LanguageToggle } from './LanguageToggle';
import { BarberPole } from './ui';

interface Props {
  /** The shop's name; empty while the settings load. */
  shopName: string;
  /** Shows "Open today …" / "Closed today" when given. */
  shop?: ShopSettings;
  today?: DateKey;
  /** The pill at the end of the top row; defaults to "My bookings". */
  action?: ReactNode;
  customer?: User | null;
  onSignOut?: () => void;
}

/** The dark header of the customer pages: the shop's logo and name, today's hours, account. */
export function ShopHeader({ shopName, shop, today, action, customer, onSignOut }: Props) {
  const { t } = useTranslation();
  const branding = useBranding();
  const logo = branding?.logo ?? null;
  const hours = shop && today ? shopHoursOn(shop, today) : undefined;
  return (
    <header className="bg-charcoal text-cream">
      <BarberPole />
      <div className="mx-auto max-w-xl px-4 pb-5 pt-1">
        <div className="flex justify-end">
          <LanguageToggle />
        </div>
        <div className="flex items-start justify-between gap-3">
          <Link to="/" className="flex min-w-0 items-center gap-3 leading-none">
            {logo && (
              // The logo is decorative next to the name, which says the same.
              <img src={logo} alt="" className="h-14 w-14 shrink-0 rounded-xl object-contain" />
            )}
            <span className="caps min-w-0 break-words text-3xl font-semibold tracking-[0.1em]">
              {shopName}
            </span>
          </Link>
          {action ?? (
            <Link
              to="/my-bookings"
              className="caps inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-brass/60 px-4 text-xs font-medium text-cream hover:bg-cream/10"
            >
              <CalendarDays aria-hidden size={16} className="text-brass-light" />
              {t('header.myBookings')}
            </Link>
          )}
        </div>

        {hours !== undefined && (
          <p className="mt-4 flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className={`h-2.5 w-2.5 rounded-full ${hours ? 'bg-whatsapp' : 'bg-muted'}`}
            />
            {hours ? t('header.openToday', { start: hours.start, end: hours.end }) : t('header.closedToday')}
          </p>
        )}

        {customer && onSignOut && (
          <p className="mt-2 flex flex-wrap items-center gap-x-3 text-sm text-line">
            <span className="min-w-0 break-all">{t('header.signedInAs', { email: customer.email })}</span>
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex min-h-11 items-center gap-1 font-semibold text-brass-light underline-offset-4 hover:underline"
            >
              <LogOut aria-hidden size={14} className="rtl:-scale-x-100" />
              {t('header.signOut')}
            </button>
          </p>
        )}
      </div>
    </header>
  );
}
