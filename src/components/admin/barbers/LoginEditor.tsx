import { useState, type FormEvent } from 'react';
import {
  createLogin,
  MIN_PASSWORD_LENGTH,
  newLogin,
  normalizeUsername,
  passwordErrors,
  usernameErrors,
} from '../../../data/accounts';
import { UsernameTakenError } from '../../../data/errors';
import { store } from '../../../data/firebase';
import { usernameFor } from '../../../lib/team';
import type { Barber, StaffMember } from '../../../types';
import { buttonDark, buttonOutline, inputBase, Notice } from '../../ui';
import { cardClass, Section } from '../settings/fields';

interface Props {
  barber: Barber;
  /** His logins, on and off; null while loading. */
  logins: StaffMember[] | null;
}

/**
 * A barber's login. Nobody can set another user's password without a server, so a forgotten
 * password gets a "New login": the same username with a new password, and the old login stops
 * working (docs/ARCHITECTURE.md, 5.3). A barber with no login (if creating it failed) gets one here.
 */
export function LoginEditor({ barber, logins }: Props) {
  const current = logins?.find((l) => l.active) ?? logins?.[0];
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const login = current ? current.username : normalizeUsername(username ?? usernameFor(barber.name));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);
    const problem = (current ? null : usernameErrors(login)[0]) ?? passwordErrors(password)[0];
    if (problem) return setError(problem);
    setBusy(true);
    try {
      if (current) await newLogin(store, { username: login, password });
      else await createLogin(store, { username: login, password, barberId: barber.id });
      setDone(
        current
          ? `New login ready. ${barber.name} logs in as "${login}" with the new password; the old one no longer works.`
          : `Login created. ${barber.name} logs in as "${login}" with that password.`,
      );
      setPassword('');
      setOpen(false);
    } catch (err) {
      setError(
        err instanceof UsernameTakenError
          ? `The username "${login}" is taken. Pick another.`
          : "Couldn't save the login. Check your connection and try again.",
      );
      if (!(err instanceof UsernameTakenError)) console.error(err);
    }
    setBusy(false);
  }

  const form = (
    <form onSubmit={handleSubmit} noValidate className="mt-3">
      {!current && (
        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-medium">Username</span>
          <input
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={20}
            value={username ?? usernameFor(barber.name)}
            onChange={(e) => setUsername(e.target.value)}
            disabled={busy}
            className={`${inputBase} w-full`}
          />
        </label>
      )}
      <label className="mb-3 block">
        <span className="mb-1 block text-sm font-medium">
          {current ? 'New password' : 'Password'}{' '}
          <span className="font-normal text-muted">(at least {MIN_PASSWORD_LENGTH} characters)</span>
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
        <span className="mt-1 block text-sm text-muted">Give it to him; he can change it in his settings.</span>
      </label>
      {error && (
        <Notice tone="error" className="mb-3">
          {error}
        </Notice>
      )}
      <div className={current ? 'grid grid-cols-2 gap-2' : ''}>
        {current && (
          <button type="button" onClick={() => setOpen(false)} disabled={busy} className={buttonOutline}>
            Back
          </button>
        )}
        <button type="submit" disabled={busy} className={`${buttonDark} w-full`}>
          {busy ? 'Saving…' : current ? 'Make new login' : 'Create login'}
        </button>
      </div>
    </form>
  );

  return (
    <Section title="Login">
      <div className={cardClass}>
        {done && (
          <Notice tone="success" className="mb-3">
            {done}
          </Notice>
        )}
        {logins === null ? (
          <p className="text-sm text-muted-strong">Loading…</p>
        ) : current ? (
          <>
            <p className="text-sm">
              Username <strong>{current.username}</strong> ·{' '}
              {current.active ? 'on' : 'off'}
            </p>
            {!barber.active ? (
              <p className="mt-2 text-sm text-muted-strong">Bring {barber.name} back first to give him a new login.</p>
            ) : open ? (
              form
            ) : (
              <>
                <p className="mt-2 text-sm text-muted-strong">
                  Forgot his password? Make a new login: same username, a new password.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(true);
                    setDone(null);
                  }}
                  className={`${buttonOutline} mt-3 w-full`}
                >
                  New login
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <p className="text-sm">{barber.name} has no login yet.</p>
            {form}
          </>
        )}
      </div>
    </Section>
  );
}
