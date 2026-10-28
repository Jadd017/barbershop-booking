import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { MAX_BARBER_NAME_LENGTH, MIN_BARBER_NAME_LENGTH } from '../../../config';
import {
  createLogin,
  isUsernameFree,
  MIN_PASSWORD_LENGTH,
  normalizeUsername,
  passwordErrors,
  usernameErrors,
} from '../../../data/accounts';
import { BarberExistsError, UsernameTakenError } from '../../../data/errors';
import { store } from '../../../data/firebase';
import { addBarber } from '../../../data/shop';
import { hoursFromShop } from '../../../lib/barberDoc';
import { barberIdFor, usernameFor } from '../../../lib/team';
import type { Barber, ShopSettings } from '../../../types';
import { buttonDark, inputBase, Notice } from '../../ui';
import { cardClass, Section } from '../settings/fields';

/**
 * Adds a barber and his login in one go: his name, the username he'll log in with and a first
 * password the owner gives him (he changes it in his settings). The login is created on a second,
 * throw-away Firebase app, so the owner stays logged in. A new barber works the shop's opening
 * hours until they're changed on his page.
 */
export function AddBarberForm({ shop, barbers }: { shop: ShopSettings; barbers: Barber[] }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  // Suggested from the name until the owner types his own.
  const [username, setUsername] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<{ barber: Barber; username: string; loginFailed: boolean } | null>(null);

  const login = normalizeUsername(username ?? usernameFor(name));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setAdded(null);
    const trimmed = name.trim();
    const problem =
      trimmed.length < MIN_BARBER_NAME_LENGTH || trimmed.length > MAX_BARBER_NAME_LENGTH
        ? t('schedule.barberNameLength', { min: MIN_BARBER_NAME_LENGTH, max: MAX_BARBER_NAME_LENGTH })
        : (usernameErrors(login)[0] ?? passwordErrors(password)[0] ?? null);
    if (problem) return setError(problem);

    setBusy(true);
    try {
      if (!(await isUsernameFree(store, login))) throw new UsernameTakenError();
      const barber: Barber = {
        id: barberIdFor(trimmed, barbers.map((b) => b.id)),
        name: trimmed,
        active: true,
        order: Math.max(-1, ...barbers.map((b) => b.order)) + 1,
        weeklyHours: hoursFromShop(shop.openingHours),
        daysOff: [],
      };
      await addBarber(store, barber);
      let loginFailed = false;
      try {
        await createLogin(store, { username: login, password, barberId: barber.id });
      } catch (err) {
        console.error(err);
        loginFailed = true;
      }
      setAdded({ barber, username: login, loginFailed });
      setName('');
      setUsername(null);
      setPassword('');
    } catch (err) {
      setError(
        err instanceof UsernameTakenError
          ? t('addBarber.usernameTaken', { username: login })
          : err instanceof BarberExistsError
            ? t('addBarber.justAdded')
            : t('addBarber.failed'),
      );
      if (!(err instanceof UsernameTakenError)) console.error(err);
    }
    setBusy(false);
  }

  return (
    <div className="mt-8">
      <Section
        title={t('addBarber.title')}
        description={t('addBarber.description')}
      >
        {added && (
          <Notice tone={added.loginFailed ? 'warning' : 'success'} className="mb-3">
            {added.loginFailed ? (
              <>
                {t('addBarber.loginFailed', { name: added.barber.name })}{' '}
                <Link to={`/admin/barbers/${added.barber.id}`} className="font-semibold underline">
                  {t('addBarber.openPage')}
                </Link>{' '}
                {t('addBarber.tryAgain')}
              </>
            ) : (
              <>
                {t('addBarber.added', { name: added.barber.name })}{' '}
                <strong dir="ltr">{added.username}</strong> {t('addBarber.addedEnd')}{' '}
                <Link to={`/admin/barbers/${added.barber.id}`} className="font-semibold underline">
                  {t('addBarber.setHours')}
                </Link>
              </>
            )}
          </Notice>
        )}
        <form onSubmit={handleSubmit} noValidate className={cardClass}>
          <label className="mb-3 block">
            <span className="mb-1 block text-sm font-medium">{t('common.name')}</span>
            <input
              type="text"
              autoComplete="off"
              maxLength={MAX_BARBER_NAME_LENGTH}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              className={`${inputBase} w-full`}
            />
          </label>
          <label className="mb-3 block">
            <span className="mb-1 block text-sm font-medium">
              {t('addBarber.username')} <span className="font-normal text-muted">{t('addBarber.usernameHint')}</span>
            </span>
            <input
              type="text"
              dir="ltr"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={20}
              value={username ?? usernameFor(name)}
              onChange={(e) => setUsername(e.target.value)}
              disabled={busy}
              className={`${inputBase} w-full`}
            />
          </label>
          <label className="mb-4 block">
            <span className="mb-1 block text-sm font-medium">
              {t('addBarber.firstPassword')}{' '}
              <span className="font-normal text-muted">{t('addBarber.passwordHint', { min: MIN_PASSWORD_LENGTH })}</span>
            </span>
            <input
              type="text"
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              className={`${inputBase} w-full`}
            />
            <span className="mt-1 block text-sm text-muted">
              {t('addBarber.passwordShown')}
            </span>
          </label>
          {error && (
            <Notice tone="error" className="mb-3">
              {error}
            </Notice>
          )}
          <button type="submit" disabled={busy} className={`${buttonDark} w-full`}>
            {busy ? t('addBarber.adding') : t('addBarber.add')}
          </button>
        </form>
      </Section>
    </div>
  );
}
