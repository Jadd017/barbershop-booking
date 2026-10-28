import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { currentLanguage, setLanguage } from '../i18n';

/**
 * عربي / English: switches to the other language (remembered on this device). Its label is
 * written in the language it switches to, so either reader finds it.
 */
export function LanguageToggle({ onDark = true }: { onDark?: boolean }) {
  const { t } = useTranslation();
  const other = currentLanguage() === 'ar' ? 'en' : 'ar';
  return (
    <button
      type="button"
      onClick={() => setLanguage(other)}
      lang={other}
      aria-label={t('language.switchLabel')}
      className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 px-1 text-sm font-semibold ${
        onDark ? 'text-line hover:text-cream' : 'text-ink hover:text-muted-strong'
      }`}
    >
      <Languages aria-hidden size={16} className={onDark ? 'text-brass-light' : 'text-muted-strong'} />
      {t('language.switchTo')}
    </button>
  );
}

/** The toggle alone at the top of a page with no header (messages, confirmation, no access). */
export function LanguageBar() {
  return (
    <div className="mx-auto flex max-w-xl justify-end px-4 pt-2">
      <LanguageToggle onDark={false} />
    </div>
  );
}
