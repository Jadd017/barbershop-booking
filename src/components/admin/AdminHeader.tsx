import { LogOut } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  /** The small line above the title, e.g. the date. */
  overline?: string;
  title: string;
  onLogout: () => void;
  children?: ReactNode;
}

/** The charcoal header of Eddy's pages. */
export function AdminHeader({ overline, title, onLogout, children }: Props) {
  return (
    <header className="bg-charcoal text-cream">
      <div className="mx-auto max-w-xl px-4 pb-5 pt-4">
        <div className="flex items-center justify-between">
          <p className="caps text-xs font-medium tracking-[0.3em] text-brass-light">Barbershop admin</p>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex min-h-11 items-center gap-1.5 px-1 text-sm font-semibold text-line hover:text-cream"
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
