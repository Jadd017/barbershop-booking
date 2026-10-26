import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { Dashboard } from '../components/admin/Dashboard';
import { LoginForm } from '../components/admin/LoginForm';
import { MySettingsPage } from '../components/admin/settings/MySettingsPage';
import { BarberPole, buttonOutline, PageMessage } from '../components/ui';
import { subscribeMyStaff } from '../data/accounts';
import { auth, store } from '../data/firebase';
import { useShop } from '../hooks/useShop';
import type { StaffMember } from '../types';

/** Staff sign in with a username and password (email/password underneath); customers with Google. */
function isPasswordUser(user: User): boolean {
  return user.providerData.some((p) => p.providerId === 'password');
}

/**
 * /admin: the login form, then the signed-in barber's own dashboard (Today, Calendar, Walk-in)
 * or his settings. Who a login is comes from its staff/{uid} doc, live, so a login the owner turns
 * off is shut out straight away (the rules already refuse it everything).
 */
export function StaffPage({ view }: { view: 'bookings' | 'settings' }) {
  // undefined = still checking whether someone is signed in.
  const [user, setUser] = useState<User | null | undefined>(undefined);
  // Tagged with the login it belongs to, so a previous login's doc is never used.
  const [staff, setStaff] = useState<{ uid: string; value: StaffMember | null } | null>(null);
  const [staffError, setStaffError] = useState(false);
  const { shop, barbers, error: shopError } = useShop();

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  const staffUid = user && isPasswordUser(user) ? user.uid : null;
  useEffect(() => {
    if (!staffUid) return;
    return subscribeMyStaff(
      store,
      staffUid,
      (value) => {
        setStaff({ uid: staffUid, value });
        setStaffError(false);
      },
      (err) => {
        console.error(err);
        setStaffError(true);
      },
    );
  }, [staffUid]);

  const logout = () => signOut(auth);

  if (user === undefined) return <PageMessage>Loading…</PageMessage>;
  if (!user) return <LoginForm />;
  if (!staffUid) {
    return (
      <NoAccess onLogout={logout}>
        {user.email ?? 'This account'} is a customer account. Staff log in with their username.
      </NoAccess>
    );
  }
  if (staffError || shopError) {
    return <PageMessage error>Couldn't load your account. Check your connection and refresh.</PageMessage>;
  }

  const me = staff?.uid === staffUid ? staff.value : undefined;
  if (me === undefined || shop === undefined || barbers === undefined) {
    return <PageMessage>Loading…</PageMessage>;
  }
  if (me === null) return <NoAccess onLogout={logout}>This login doesn't have access.</NoAccess>;
  if (!me.active) {
    return (
      <NoAccess onLogout={logout}>
        This login has been turned off. Ask the owner for a new one.
      </NoAccess>
    );
  }
  const barber = barbers.find((b) => b.id === me.barberId);
  if (!shop || !barber) {
    return (
      <NoAccess onLogout={logout}>
        {shop ? 'Your barber profile is missing.' : "The shop isn't set up yet."} Ask the owner.
      </NoAccess>
    );
  }

  const session = { user, staff: me, shop, barber, onLogout: logout };
  return view === 'settings' ? <MySettingsPage session={session} /> : <Dashboard session={session} />;
}

function NoAccess({ children, onLogout }: { children: string | string[]; onLogout: () => void }) {
  return (
    <div className="min-h-screen">
      <BarberPole />
      <div className="mx-auto max-w-sm px-4 pt-16 text-center">
        <h1 className="caps mb-2 text-2xl font-semibold">No access</h1>
        <p className="mb-6 break-words text-sm text-muted-strong">{children}</p>
        <button type="button" onClick={onLogout} className={buttonOutline}>
          Log out
        </button>
      </div>
    </div>
  );
}
