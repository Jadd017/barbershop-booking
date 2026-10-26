import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { BarberPage } from '../components/admin/barbers/BarberPage';
import { BarbersPage } from '../components/admin/barbers/BarbersPage';
import { Dashboard } from '../components/admin/Dashboard';
import { LoginForm } from '../components/admin/LoginForm';
import { OwnerTools } from '../components/admin/OwnerTools';
import type { StaffSession } from '../components/admin/session';
import { MySettingsPage } from '../components/admin/settings/MySettingsPage';
import { ShopSettingsPage } from '../components/admin/shop/ShopSettingsPage';
import { BarberPole, buttonDark, buttonOutline, PageMessage } from '../components/ui';
import { subscribeMyStaff } from '../data/accounts';
import { auth, store } from '../data/firebase';
import { ensureShop } from '../data/shop';
import { useShop } from '../hooks/useShop';
import type { StaffMember } from '../types';

/** What /admin… shows. The last three are the owner's only. */
export type StaffView = 'bookings' | 'settings' | 'barbers' | 'barber' | 'shop';

const OWNER_VIEWS: StaffView[] = ['barbers', 'barber', 'shop'];

/** Staff sign in with a username and password (email/password underneath); customers with Google. */
function isPasswordUser(user: User): boolean {
  return user.providerData.some((p) => p.providerId === 'password');
}

/**
 * /admin: the login form, then the signed-in barber's own dashboard (Today, Calendar, Walk-in)
 * or his settings; for the owner also every barber's day, the barbers pages and the shop's
 * settings. Who a login is comes from its staff/{uid} doc, live, so a login the owner turns off is
 * shut out straight away. A barber who opens an owner page gets "for the owner only" (the rules
 * would refuse its writes anyway).
 */
export function StaffPage({ view }: { view: StaffView }) {
  const { barberId: viewedBarberId } = useParams();
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

  const me = staffUid && staff?.uid === staffUid ? staff.value : undefined;
  const isOwner = me?.role === 'owner' && me.active;

  // A new shop: settings/shop and settings/branding are created the first time the owner signs in.
  useEffect(() => {
    if (isOwner && shop === null) {
      ensureShop(store, import.meta.env.VITE_SHOP_NAME?.trim() || 'Barbershop', null).catch(console.error);
    }
  }, [isOwner, shop]);

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
  if (!shop && isOwner) return <PageMessage>Setting up the shop…</PageMessage>;
  const barber = barbers.find((b) => b.id === me.barberId);
  if (!shop || !barber) {
    return (
      <NoAccess onLogout={logout}>
        {shop ? 'Your barber profile is missing.' : "The shop isn't set up yet."} Ask the owner.
      </NoAccess>
    );
  }

  const session: StaffSession = { user, staff: me, shop, barber, barbers, isOwner, onLogout: logout };

  if (OWNER_VIEWS.includes(view) && !isOwner) return <OwnerOnly />;

  const page =
    view === 'settings' ? (
      <MySettingsPage session={session} />
    ) : view === 'barbers' ? (
      <BarbersPage session={session} />
    ) : view === 'barber' ? (
      <BarberPage session={session} barberId={viewedBarberId ?? ''} />
    ) : view === 'shop' ? (
      <ShopSettingsPage session={session} />
    ) : (
      <Dashboard session={session} />
    );
  return isOwner ? (
    <OwnerTools shop={shop} barbers={barbers}>
      {page}
    </OwnerTools>
  ) : (
    page
  );
}

/** What a barber sees on the owner's pages. */
function OwnerOnly() {
  return (
    <div className="min-h-screen">
      <BarberPole />
      <div className="mx-auto max-w-sm px-4 pt-16 text-center">
        <h1 className="caps mb-2 text-2xl font-semibold">Owner only</h1>
        <p className="mb-6 text-sm text-muted-strong">This page is for the shop's owner.</p>
        <Link to="/admin" className={buttonDark}>
          Back to my day
        </Link>
      </div>
    </div>
  );
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
