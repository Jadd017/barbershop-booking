import { useState, type FormEvent } from 'react';
import { signInStaff } from '../../data/accounts';
import { WrongLoginError } from '../../data/errors';
import { auth, store } from '../../data/firebase';
import { useBranding, useShop } from '../../hooks/useShop';
import { BarberPole, buttonDark, inputBase, Notice } from '../ui';

function loginErrorMessage(err: unknown): string {
  if (err instanceof WrongLoginError) return 'Wrong username or password.';
  switch ((err as { code?: string } | null)?.code) {
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes and try again.';
    case 'auth/network-request-failed':
    case 'unavailable':
      return 'No connection. Check your internet and try again.';
    default:
      console.error(err);
      return 'Something went wrong. Please try again.';
  }
}

/** Staff log in with the username and password the owner gave them. */
export function LoginForm() {
  const { shop } = useShop();
  const logo = useBranding()?.logo ?? null;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) return setError('Enter your username and password.');
    setBusy(true);
    try {
      // On success, StaffPage's auth listener swaps this form for the dashboard.
      await signInStaff(store, auth, username, password);
    } catch (err) {
      setError(loginErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="bg-charcoal text-cream">
        <BarberPole />
        <div className="mx-auto flex max-w-sm items-center gap-3 px-4 pb-6 pt-6">
          {logo && <img src={logo} alt="" className="h-14 w-14 shrink-0 rounded-xl object-contain" />}
          <div className="min-w-0">
            <p className="caps break-words text-3xl font-semibold tracking-[0.1em]">{shop?.shopName ?? ''}</p>
            <p className="caps mt-1 text-sm font-medium tracking-[0.35em] text-brass">Staff</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-sm px-4 pt-8">
        <form onSubmit={handleLogin} noValidate className="rounded-2xl border border-line bg-card p-5">
          <h1 className="caps mb-5 text-xl font-semibold">Log in</h1>
          <label className="mb-4 block">
            <span className="caps mb-1 block text-xs font-semibold">Username</span>
            <input
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={busy}
              className={`${inputBase} w-full`}
            />
          </label>
          <label className="mb-6 block">
            <span className="caps mb-1 block text-xs font-semibold">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              className={`${inputBase} w-full`}
            />
          </label>

          {error && (
            <Notice tone="error" className="mb-4">
              {error}
            </Notice>
          )}

          <button type="submit" disabled={busy} className={`${buttonDark} caps w-full text-base`}>
            {busy ? 'Please wait…' : 'Log in'}
          </button>
          <p className="mt-4 text-center text-sm text-muted-strong">
            Forgot your password? Ask the owner for a new login.
          </p>
        </form>
      </main>
    </div>
  );
}
