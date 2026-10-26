import { LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { useBranding } from '../../hooks/useShop';
import { BarberPole } from '../ui';
import type { StaffSession } from './session';

interface Props {
  session: StaffSession;
  /** The small line above the title, e.g. the date. */
  overline?: string;
  title: string;
  /** Spans a wide screen, for the owner's barbers side by side. */
  wide?: boolean;
  children?: ReactNode;
}

/** The dark header of the staff pages: the shop's logo and name, who is signed in, the page. */
export function AdminHeader({ session, overline, title, wide = false, children }: Props) {
  const logo = useBranding()?.logo ?? null;
  return (
    <header className="bg-charcoal text-cream">
      <BarberPole />
      <div className={`mx-auto max-w-xl px-4 pb-5 pt-3 ${wide ? 'lg:max-w-none lg:px-8' : ''}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {logo && <img src={logo} alt="" className="h-9 w-9 shrink-0 rounded-lg object-contain" />}
            <p className="caps min-w-0 truncate text-xs font-medium tracking-[0.25em] text-brass-light">
              {session.shop.shopName}
              <span className="text-line"> · </span>
              {session.barber.name}
            </p>
          </div>
          <button
            type="button"
            onClick={session.onLogout}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 px-1 text-sm font-semibold text-line hover:text-cream"
          >
            <LogOut aria-hidden size={16} />
            Log out
          </button>
        </div>
        {overline && <p className="mt-2 text-sm text-line">{overline}</p>}
        <h1 className="caps text-4xl font-semibold tracking-[0.1em]">{title}</h1>
        {children}
      </div>
    </header>
  );
}
