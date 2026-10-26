import { useState, type FormEvent } from 'react';
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
        ? `The name must be ${MIN_BARBER_NAME_LENGTH} to ${MAX_BARBER_NAME_LENGTH} characters.`
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
          ? `The username "${login}" is taken. Pick another.`
          : err instanceof BarberExistsError
            ? 'A barber with that name was just added. Check the list.'
            : "Couldn't add the barber. Check your connection and try again.",
      );
      if (!(err instanceof UsernameTakenError)) console.error(err);
    }
    setBusy(false);
  }

  return (
    <div className="mt-8">
      <Section
        title="Add a barber"
        description="He starts with the shop's opening hours; set his own on his page afterwards."
      >
        {added && (
          <Notice tone={added.loginFailed ? 'warning' : 'success'} className="mb-3">
            {added.loginFailed ? (
              <>
                {added.barber.name} was added, but his login couldn't be created.{' '}
                <Link to={`/admin/barbers/${added.barber.id}`} className="font-semibold underline">
                  Open his page
                </Link>{' '}
                to try again.
              </>
            ) : (
              <>
                {added.barber.name} was added. He logs in with the username{' '}
                <strong>{added.username}</strong> and the password you set, and can change it in his
                settings.{' '}
                <Link to={`/admin/barbers/${added.barber.id}`} className="font-semibold underline">
                  Set his hours
                </Link>
              </>
            )}
          </Notice>
        )}
        <form onSubmit={handleSubmit} noValidate className={cardClass}>
          <label className="mb-3 block">
            <span className="mb-1 block text-sm font-medium">Name</span>
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
              Username <span className="font-normal text-muted">(3–20 letters and digits)</span>
            </span>
            <input
              type="text"
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
              First password <span className="font-normal text-muted">(at least {MIN_PASSWORD_LENGTH} characters)</span>
            </span>
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              className={`${inputBase} w-full`}
            />
            <span className="mt-1 block text-sm text-muted">
              Shown so you can give it to him. He should change it after his first login.
            </span>
          </label>
          {error && (
            <Notice tone="error" className="mb-3">
              {error}
            </Notice>
          )}
          <button type="submit" disabled={busy} className={`${buttonDark} w-full`}>
            {busy ? 'Adding…' : 'Add barber'}
          </button>
        </form>
      </Section>
    </div>
  );
}
