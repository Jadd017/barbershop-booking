import type { User } from 'firebase/auth';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { changeMyPassword, passwordErrors } from '../../../data/accounts';
import { WrongLoginError } from '../../../data/errors';
import { buttonDark, inputBase, Notice } from '../../ui';
import { cardClass, Section } from './fields';

/** The signed-in staff member changes their own password: current one first, the new one twice. */
export function PasswordEditor({ user, username }: { user: User; username: string }) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    const problem = !current
      ? t('password.enterCurrent')
      : (passwordErrors(next)[0] ??
        (next !== again
          ? t('password.noMatch')
          : next === current
            ? t('password.same')
            : null));
    if (problem) return setMessage({ error: true, text: problem });

    setBusy(true);
    try {
      await changeMyPassword(user, current, next);
      setCurrent('');
      setNext('');
      setAgain('');
      setMessage({ error: false, text: t('password.changed') });
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      setMessage({
        error: true,
        text:
          err instanceof WrongLoginError
            ? t('password.wrongCurrent')
            : code === 'auth/too-many-requests'
              ? t('common.tooManyAttempts')
              : code === 'auth/network-request-failed'
                ? t('common.noConnection')
                : t('password.failed'),
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
        dir="ltr"
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => set(e.target.value)}
        disabled={busy}
        className={`${inputBase} w-full`}
      />
    </label>
  );

  return (
    <Section title={t('password.title')} description={t('password.loginAs', { username })}>
      <form onSubmit={handleSubmit} noValidate className={cardClass}>
        {/* Lets password managers pair the new password with the username. */}
        <input type="text" autoComplete="username" value={username} readOnly hidden />
        {field(t('password.current'), current, setCurrent, 'current-password')}
        {field(t('password.new'), next, setNext, 'new-password')}
        {field(t('password.again'), again, setAgain, 'new-password')}
        {message && (
          <Notice tone={message.error ? 'error' : 'success'} className="mb-3">
            {message.text}
          </Notice>
        )}
        <button type="submit" disabled={busy} className={`${buttonDark} w-full`}>
          {busy ? t('password.changing') : t('password.change')}
        </button>
      </form>
    </Section>
  );
}
