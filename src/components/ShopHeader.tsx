import type { User } from 'firebase/auth';
import { CalendarDays, LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { hoursOn } from '../lib/schedule';
import type { DateKey, Settings } from '../types';
import { BarberPole } from './ui';

interface Props {
  barberName: string;
  /** Shows "Open today …" / "Closed today" when given. */
  settings?: Settings;
  today?: DateKey;
  /** The right-hand pill; defaults to "My bookings". */
  action?: ReactNode;
  customer?: User | null;
  onSignOut?: () => void;
}

/** The charcoal header of the customer pages: "EDDY'S BARBERSHOP", today's hours, account. */
export function ShopHeader({ barberName, settings, today, action, customer, onSignOut }: Props) {
  const hours = settings && today ? hoursOn(settings, today) : undefined;
  return (
    <header className="bg-charcoal text-cream">
      <BarberPole />
      <div className="mx-auto max-w-xl px-4 pb-5 pt-4">
        <div className="flex items-start justify-between gap-3">
          <Link to="/" className="leading-none">
            <span className="caps block text-4xl font-semibold tracking-[0.12em]">
              {barberName}'s
            </span>
            <span className="caps mt-1 block text-sm font-medium tracking-[0.35em] text-brass">
              Barbershop
            </span>
          </Link>
          {action ?? (
            <Link
              to="/my-bookings"
              className="caps inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-brass/60 px-4 text-xs font-medium text-cream hover:bg-cream/10"
            >
              <CalendarDays aria-hidden size={16} className="text-brass-light" />
              My bookings
            </Link>
          )}
        </div>

        {hours !== undefined && (
          <p className="mt-4 flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className={`h-2.5 w-2.5 rounded-full ${hours ? 'bg-whatsapp' : 'bg-muted'}`}
            />
            {hours ? `Open today ${hours.start}–${hours.end}` : 'Closed today'}
          </p>
        )}

        {customer && onSignOut && (
          <p className="mt-2 flex flex-wrap items-center gap-x-3 text-sm text-line">
            <span className="min-w-0 break-all">Signed in as {customer.email}</span>
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex min-h-11 items-center gap-1 font-semibold text-brass-light underline-offset-4 hover:underline"
            >
              <LogOut aria-hidden size={14} />
              Sign out
            </button>
          </p>
        )}
      </div>
    </header>
  );
}
