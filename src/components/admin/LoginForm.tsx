import { FirebaseError } from 'firebase/app';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { useState, type FormEvent } from 'react';
import { auth } from '../../data/firebase';
import { BarberPole, buttonDark, inputBase, linkButton, Notice } from '../ui';

function loginErrorMessage(err: unknown): string {
  const code = err instanceof FirebaseError ? err.code : '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/invalid-email':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Wrong email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes or reset your password.';
    case 'auth/network-request-failed':
      return 'No connection. Check your internet and try again.';
    default:
      console.error(err);
      return 'Something went wrong. Please try again.';
  }
}

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      // On success, AdminPage's auth listener swaps this form for the dashboard.
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setError(loginErrorMessage(err));
      setBusy(false);
    }
  }

  async function handleForgotPassword() {
    setError(null);
    setNotice(null);
    if (!email.trim()) {
      setError('Enter your email above first, then tap "Forgot password".');
      return;
    }
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setNotice('If that email has an account, a password reset link is on its way.');
    } catch (err) {
      setError(
        err instanceof FirebaseError && err.code === 'auth/invalid-email'
          ? 'That email address looks wrong.'
          : loginErrorMessage(err),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="bg-charcoal text-cream">
        <BarberPole />
        <div className="mx-auto max-w-sm px-4 pb-6 pt-6">
          <p className="caps text-4xl font-semibold tracking-[0.12em]">Barbershop</p>
          <p className="caps mt-1 text-sm font-medium tracking-[0.35em] text-brass">Admin</p>
        </div>
      </header>

      <main className="mx-auto max-w-sm px-4 pt-8">
        <form onSubmit={handleLogin} noValidate className="rounded-2xl border border-line bg-card p-5">
          <h1 className="caps mb-5 text-xl font-semibold">Log in</h1>
          <label className="mb-4 block">
            <span className="caps mb-1 block text-xs font-semibold">Email</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
          {notice && (
            <Notice tone="success" className="mb-4">
              {notice}
            </Notice>
          )}

          <button type="submit" disabled={busy} className={`${buttonDark} caps mb-2 w-full text-base`}>
            {busy ? 'Please wait…' : 'Log in'}
          </button>
          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={busy}
            className={`${linkButton} w-full justify-center text-muted underline`}
          >
            Forgot password?
          </button>
        </form>
      </main>
    </div>
  );
}
