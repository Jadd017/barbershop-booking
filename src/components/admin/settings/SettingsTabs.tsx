import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

/** The owner's two settings pages: the shop's, and his own as a barber. */
export function SettingsTabs({ active }: { active: 'shop' | 'me' }) {
  const { t } = useTranslation();
  const tab = (to: string, label: string, current: boolean) => (
    <Link
      to={to}
      replace
      aria-current={current ? 'page' : undefined}
      className={`caps flex min-h-11 flex-1 items-center justify-center rounded-lg text-sm font-semibold ${
        current ? 'bg-brass text-charcoal' : 'text-line hover:text-cream'
      }`}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label={t('settings.tabsLabel')} className="mt-4 flex gap-1 rounded-xl border border-cream/15 bg-cream/5 p-1">
      {tab('/admin/shop', t('settings.tabShop'), active === 'shop')}
      {tab('/admin/settings', t('settings.tabMe'), active === 'me')}
    </nav>
  );
}
