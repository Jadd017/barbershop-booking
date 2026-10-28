import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { BarberPage } from '../components/admin/barbers/BarberPage';
import { BarbersPage } from '../components/admin/barbers/BarbersPage';
import { Dashboard } from '../components/admin/Dashboard';
import { LoginForm } from '../components/admin/LoginForm';
import { OwnerTools } from '../components/admin/OwnerTools';
import type { StaffSession } from '../components/admin/session';
import { MySettingsPage } from '../components/admin/settings/MySettingsPage';
import { ShopSettingsPage } from '../components/admin/shop/ShopSettingsPage';
import { LanguageBar } from '../components/LanguageToggle';
import { BarberPole, buttonDark, buttonOutline, PageMessage } from '../components/ui';
import { subscribeMyStaff } from '../data/accounts';
import { auth, store } from '../data/firebase';
import { ensureShop } from '../data/shop';
import { ServicesContext } from '../hooks/useServiceNames';
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
  const { t } = useTranslation();
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

  if (user === undefined) return <PageMessage>{t('common.loading')}</PageMessage>;
  if (!user) return <LoginForm />;
  if (!staffUid) {
    return (
      <NoAccess onLogout={logout}>
        {t('staff.customerAccount', { email: user.email ?? t('staff.thisAccount') })}
      </NoAccess>
    );
  }
  if (staffError || shopError) {
    return <PageMessage error>{t('staff.loadError')}</PageMessage>;
  }

  if (me === undefined || shop === undefined || barbers === undefined) {
    return <PageMessage>{t('common.loading')}</PageMessage>;
  }
  if (me === null) return <NoAccess onLogout={logout}>{t('staff.noAccessLogin')}</NoAccess>;
  if (!me.active) {
    return (
      <NoAccess onLogout={logout}>{t('staff.turnedOff')}</NoAccess>
    );
  }
  if (!shop && isOwner) return <PageMessage>{t('staff.settingUp')}</PageMessage>;
  const barber = barbers.find((b) => b.id === me.barberId);
  if (!shop || !barber) {
    return (
      <NoAccess onLogout={logout}>
        {shop ? t('staff.profileMissing') : t('staff.shopNotSetUp')}
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
  return (
    <ServicesContext.Provider value={shop.services}>
      {isOwner ? (
        <OwnerTools shop={shop} barbers={barbers}>
          {page}
        </OwnerTools>
      ) : (
        page
      )}
    </ServicesContext.Provider>
  );
}

/** What a barber sees on the owner's pages. */
function OwnerOnly() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen">
      <BarberPole />
      <LanguageBar />
      <div className="mx-auto max-w-sm px-4 pt-12 text-center">
        <h1 className="caps mb-2 text-2xl font-semibold">{t('staff.ownerOnly')}</h1>
        <p className="mb-6 text-sm text-muted-strong">{t('staff.ownerOnlyText')}</p>
        <Link to="/admin" className={buttonDark}>
          {t('staff.backToMyDay')}
        </Link>
      </div>
    </div>
  );
}

function NoAccess({ children, onLogout }: { children: string; onLogout: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen">
      <BarberPole />
      <LanguageBar />
      <div className="mx-auto max-w-sm px-4 pt-12 text-center">
        <h1 className="caps mb-2 text-2xl font-semibold">{t('staff.noAccess')}</h1>
        <p className="mb-6 break-words text-sm text-muted-strong">{children}</p>
        <button type="button" onClick={onLogout} className={buttonOutline}>
          {t('staff.logOut')}
        </button>
      </div>
    </div>
  );
}
