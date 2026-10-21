import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { Dashboard } from '../components/admin/Dashboard';
import { LoginForm } from '../components/admin/LoginForm';
import { ADMIN_UID } from '../config';
import { auth } from '../data/firebase';

export function AdminPage() {
  // undefined = still checking whether someone is signed in.
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  const logout = () => signOut(auth);

  if (user === undefined) {
    return <p className="p-6 text-center text-neutral-500">Loading…</p>;
  }

  if (!user) return <LoginForm />;

  if (user.uid !== ADMIN_UID) {
    return (
      <div className="mx-auto max-w-sm px-4 pt-16 text-center">
        <h1 className="mb-2 text-2xl font-bold">Not authorized</h1>
        <p className="mb-6 text-sm text-neutral-600">
          {user.email} doesn't have access to this page.
        </p>
        <button
          type="button"
          onClick={logout}
          className="rounded-xl border border-neutral-300 px-5 py-3 font-semibold hover:border-neutral-500"
        >
          Log out
        </button>
      </div>
    );
  }

  return <Dashboard onLogout={logout} />;
}
