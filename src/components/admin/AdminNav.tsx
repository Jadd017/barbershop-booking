import { CalendarDays, House, Settings, UserPlus, type LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router';

/** What /admin shows, kept in the history entry's state so the back button works. */
export interface AdminNavState {
  mode?: 'today' | 'calendar';
  /** Opens the add-booking sheet on top. */
  walkIn?: boolean;
}

export type AdminTab = 'today' | 'calendar' | 'settings';

/** Today, Calendar, Walk-in and Settings, fixed at the bottom of Eddy's pages. */
export function AdminNav({ active }: { active: AdminTab }) {
  const navigate = useNavigate();
  const mode = active === 'settings' ? 'today' : active;

  const items: { label: string; Icon: LucideIcon; tab?: AdminTab; go: () => void }[] = [
    {
      label: 'Today',
      Icon: House,
      tab: 'today',
      go: () => navigate('/admin', { state: { mode: 'today' } satisfies AdminNavState }),
    },
    {
      label: 'Calendar',
      Icon: CalendarDays,
      tab: 'calendar',
      go: () => navigate('/admin', { state: { mode: 'calendar' } satisfies AdminNavState }),
    },
    {
      label: 'Walk-in',
      Icon: UserPlus,
      go: () => navigate('/admin', { state: { mode, walkIn: true } satisfies AdminNavState }),
    },
    { label: 'Settings', Icon: Settings, tab: 'settings', go: () => navigate('/admin/settings') },
  ];

  return (
    <nav
      aria-label="Admin"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-brass/40 bg-charcoal pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-4">
        {items.map(({ label, Icon, tab, go }) => {
          const current = tab === active;
          return (
            <li key={label}>
              <button
                type="button"
                onClick={go}
                aria-current={current ? 'page' : undefined}
                className={`caps flex min-h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                  current ? 'text-brass-light' : 'text-line hover:text-cream'
                }`}
              >
                <Icon aria-hidden size={22} strokeWidth={current ? 2.25 : 1.75} />
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
