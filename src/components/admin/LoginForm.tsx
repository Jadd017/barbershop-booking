import { FirebaseError } from 'firebase/app';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { useState, type FormEvent } from 'react';
import { auth } from '../../data/firebase';

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
    <div className="mx-auto max-w-sm px-4 pt-16">
      <h1 className="mb-6 text-2xl font-bold">Admin login</h1>
      <form onSubmit={handleLogin} noValidate>
        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-medium">Email</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-900"
          />
        </label>
        <label className="mb-6 block">
          <span className="mb-1 block text-sm font-medium">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-900"
          />
        </label>

        {error && (
          <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {notice && (
          <p className="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mb-4 w-full rounded-xl bg-neutral-900 px-5 py-3 font-semibold text-white hover:bg-neutral-700 disabled:opacity-60"
        >
          {busy ? 'Please wait…' : 'Log in'}
        </button>
        <button
          type="button"
          onClick={handleForgotPassword}
          disabled={busy}
          className="w-full text-sm font-medium text-neutral-600 underline"
        >
          Forgot password?
        </button>
      </form>
    </div>
  );
}
