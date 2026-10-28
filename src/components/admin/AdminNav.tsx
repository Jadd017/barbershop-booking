import { CalendarDays, House, Settings, UserPlus, Users, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useOwner } from './session';

/** What /admin shows, kept in the history entry's state so the back button works. */
export interface AdminNavState {
  mode?: 'today' | 'calendar';
  /** Opens the add-booking sheet on top. */
  walkIn?: boolean;
}

export type AdminTab = 'today' | 'calendar' | 'barbers' | 'settings';

/**
 * Today, Calendar, Walk-in and Settings, fixed at the bottom of the staff pages; the owner also
 * has Barbers, and his Settings opens the shop's (his own are a tab away).
 */
export function AdminNav({ active }: { active: AdminTab }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const owner = useOwner() !== null;
  const mode = active === 'today' || active === 'calendar' ? active : 'today';

  const items: { label: string; Icon: LucideIcon; tab?: AdminTab; go: () => void }[] = [
    {
      label: t('nav.today'),
      Icon: House,
      tab: 'today',
      go: () => navigate('/admin', { state: { mode: 'today' } satisfies AdminNavState }),
    },
    {
      label: t('nav.calendar'),
      Icon: CalendarDays,
      tab: 'calendar',
      go: () => navigate('/admin', { state: { mode: 'calendar' } satisfies AdminNavState }),
    },
    {
      label: t('nav.walkIn'),
      Icon: UserPlus,
      go: () => navigate('/admin', { state: { mode, walkIn: true } satisfies AdminNavState }),
    },
    ...(owner
      ? [{ label: t('nav.barbers'), Icon: Users, tab: 'barbers' as const, go: () => navigate('/admin/barbers') }]
      : []),
    {
      label: t('nav.settings'),
      Icon: Settings,
      tab: 'settings',
      go: () => navigate(owner ? '/admin/shop' : '/admin/settings'),
    },
  ];

  return (
    <nav
      aria-label={t('nav.label')}
      className="fixed inset-x-0 bottom-0 z-20 border-t border-brass/40 bg-charcoal pb-[env(safe-area-inset-bottom)]"
    >
      <ul className={`mx-auto grid max-w-xl ${owner ? 'grid-cols-5' : 'grid-cols-4'}`}>
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
