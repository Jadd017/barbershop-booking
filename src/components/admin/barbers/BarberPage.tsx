import { ChevronLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { deactivateBarber, reactivateBarber, subscribeStaff } from '../../../data/accounts';
import { subscribeUpcomingBookings } from '../../../data/bookings';
import { store } from '../../../data/firebase';
import { toDateKey } from '../../../lib/time';
import type { ShopStaffBooking, StaffMember } from '../../../types';
import { buttonDanger, buttonDangerOutline, buttonOutline, Notice, PageMessage } from '../../ui';
import { AdminHeader } from '../AdminHeader';
import { AdminNav } from '../AdminNav';
import { BookingCard } from '../BookingCard';
import type { StaffSession } from '../session';
import { BlockedTimes } from '../settings/BlockedTimes';
import { cardClass, Section } from '../settings/fields';
import { ScheduleEditor } from '../settings/ScheduleEditor';
import { BarberDetails } from './BarberDetails';
import { LoginEditor } from './LoginEditor';

/**
 * The owner manages one barber: his name, hours and breaks, days off, blocked times and login
 * ("New login" for a forgotten password), and deactivating him. A deactivated barber's upcoming
 * bookings are listed here, each with Move (to a barber free then) or Cancel.
 */
export function BarberPage({ session, barberId }: { session: StaffSession; barberId: string }) {
  const { shop, barbers } = session;
  const barber = barbers.find((b) => b.id === barberId);
  const [today] = useState(() => toDateKey(new Date()));
  const [logins, setLogins] = useState<StaffMember[] | null>(null);
  const [upcoming, setUpcoming] = useState<ShopStaffBooking[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeStaff(store, setLogins, (err) => console.error(err)), []);
  useEffect(
    () =>
      subscribeUpcomingBookings(store, barberId, today, setUpcoming, (err) => {
        console.error(err);
        setUpcoming([]);
      }),
    [barberId, today],
  );

  if (!barber) {
    return (
      <PageMessage>
        No barber "{barberId}".{' '}
        <Link to="/admin/barbers" className="underline">
          Back to barbers
        </Link>
      </PageMessage>
    );
  }

  const self = barber.id === session.barber.id;
  const mine = logins?.filter((l) => l.barberId === barber.id) ?? null;
  const booked = upcoming?.filter((b) => b.status === 'booked') ?? [];

  async function setActive(active: boolean) {
    setError(null);
    setBusy(true);
    try {
      if (active) await reactivateBarber(store, barberId);
      else await deactivateBarber(store, barberId);
      setConfirming(false);
    } catch (err) {
      console.error(err);
      setError("Couldn't save. Check your connection and try again.");
    }
    setBusy(false);
  }

  return (
    <div className="min-h-screen pb-64">
      <AdminHeader session={session} title={barber.name}>
        <Link
          to="/admin/barbers"
          className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brass-light hover:underline"
        >
          <ChevronLeft aria-hidden size={16} />
          All barbers
        </Link>
      </AdminHeader>

      <main className="mx-auto max-w-xl px-4 pt-6">
        {!barber.active && (
          <div className="mb-8 rounded-2xl border border-brass/50 bg-brass/10 p-4">
            <h2 className="caps font-semibold">{barber.name} is inactive</h2>
            <p className="mb-3 text-sm">
              Customers can't see or book him, and his login is off.{' '}
              {booked.length > 0
                ? 'Move each of his upcoming bookings to another barber, or cancel it.'
                : 'He has no upcoming bookings.'}
            </p>
            {booked.length > 0 && (
              <ul className="mb-4 grid gap-3">
                {booked.map((b) => (
                  <BookingCard key={b.id} booking={b} showDate cancelOnly />
                ))}
              </ul>
            )}
            <button type="button" onClick={() => setActive(true)} disabled={busy} className={`${buttonOutline} w-full`}>
              {busy ? 'Saving…' : `Bring ${barber.name} back`}
            </button>
          </div>
        )}

        <BarberDetails barber={barber} />
        <ScheduleEditor shop={shop} barber={barber} self={self} />
        <BlockedTimes today={today} shop={shop} barber={barber} self={self} />

        {self ? (
          <Section title="Login">
            <p className={`${cardClass} text-sm`}>
              This is you. Change your password in{' '}
              <Link to="/admin/settings" className="font-semibold underline">
                Settings → Me
              </Link>
              .
            </p>
          </Section>
        ) : (
          <LoginEditor barber={barber} logins={mine} />
        )}

        {!self && barber.active && (
          <Section title="Deactivate">
            <div className={cardClass}>
              <p className="mb-3 text-sm">
                For a barber who left: customers no longer see or book him, and his login stops
                working at once. His bookings stay; you'll get the list to move or cancel them.
                You can bring him back later.
              </p>
              {confirming ? (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={buttonOutline}>
                    Keep him
                  </button>
                  <button type="button" onClick={() => setActive(false)} disabled={busy} className={buttonDanger}>
                    {busy ? 'Saving…' : 'Yes, deactivate'}
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirming(true)} className={`${buttonDangerOutline} w-full`}>
                  Deactivate {barber.name}
                </button>
              )}
            </div>
          </Section>
        )}

        {error && (
          <Notice tone="error" className="mb-6">
            {error}
          </Notice>
        )}
      </main>

      <AdminNav active="barbers" />
    </div>
  );
}
