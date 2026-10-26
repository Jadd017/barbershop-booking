import type { User } from 'firebase/auth';
import { useState, type FormEvent } from 'react';
import { changeMyPassword, passwordErrors } from '../../../data/accounts';
import { WrongLoginError } from '../../../data/errors';
import { buttonDark, inputBase, Notice } from '../../ui';
import { cardClass, Section } from './fields';

/** The signed-in staff member changes their own password: current one first, the new one twice. */
export function PasswordEditor({ user, username }: { user: User; username: string }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    const problem = !current
      ? 'Enter your current password.'
      : (passwordErrors(next)[0] ??
        (next !== again
          ? "The new passwords don't match."
          : next === current
            ? 'The new password is the same as the current one.'
            : null));
    if (problem) return setMessage({ error: true, text: problem });

    setBusy(true);
    try {
      await changeMyPassword(user, current, next);
      setCurrent('');
      setNext('');
      setAgain('');
      setMessage({ error: false, text: 'Password changed. Use the new one next time you log in.' });
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      setMessage({
        error: true,
        text:
          err instanceof WrongLoginError
            ? 'Your current password is wrong.'
            : code === 'auth/too-many-requests'
              ? 'Too many attempts. Wait a few minutes and try again.'
              : code === 'auth/network-request-failed'
                ? 'No connection. Check your internet and try again.'
                : "Couldn't change the password. Please try again.",
      });
      if (!(err instanceof WrongLoginError)) console.error(err);
    }
    setBusy(false);
  }

  const field = (label: string, value: string, set: (v: string) => void, autoComplete: string) => (
    <label className="mb-3 block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input
        type="password"
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => set(e.target.value)}
        disabled={busy}
        className={`${inputBase} w-full`}
      />
    </label>
  );

  return (
    <Section title="Password" description={`You log in as "${username}".`}>
      <form onSubmit={handleSubmit} noValidate className={cardClass}>
        {/* Lets password managers pair the new password with the username. */}
        <input type="text" autoComplete="username" value={username} readOnly hidden />
        {field('Current password', current, setCurrent, 'current-password')}
        {field('New password (at least 8 characters)', next, setNext, 'new-password')}
        {field('New password again', again, setAgain, 'new-password')}
        {message && (
          <Notice tone={message.error ? 'error' : 'success'} className="mb-3">
            {message.text}
          </Notice>
        )}
        <button type="submit" disabled={busy} className={`${buttonDark} w-full`}>
          {busy ? 'Changing…' : 'Change password'}
        </button>
      </form>
    </Section>
  );
}
