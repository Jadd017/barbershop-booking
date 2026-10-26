import { ChevronDown, ChevronRight, ChevronUp } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { subscribeStaff } from '../../../data/accounts';
import { store } from '../../../data/firebase';
import { saveBarber } from '../../../data/shop';
import { initials } from '../../../lib/initials';
import { reorderBarbers } from '../../../lib/team';
import type { Barber, StaffMember } from '../../../types';
import { Notice } from '../../ui';
import { AdminHeader } from '../AdminHeader';
import { AdminNav } from '../AdminNav';
import type { StaffSession } from '../session';
import { AddBarberForm } from './AddBarberForm';

/**
 * The owner's team: every barber in display order (the order customers see them in, and the
 * tie-break for "Any barber"), each with his login, a link to his page, and up/down to reorder.
 * Inactive barbers are listed apart. A new barber is added with his login at the bottom.
 */
export function BarbersPage({ session }: { session: StaffSession }) {
  const { barbers, shop } = session;
  const [logins, setLogins] = useState<StaffMember[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeStaff(store, setLogins, (err) => console.error(err)), []);

  const active = barbers.filter((b) => b.active);
  const inactive = barbers.filter((b) => !b.active);

  async function move(barber: Barber, step: -1 | 1) {
    setError(null);
    setBusy(true);
    try {
      for (const changed of reorderBarbers(active, barber.id, step)) await saveBarber(store, changed);
    } catch (err) {
      console.error(err);
      setError("Couldn't change the order. Check your connection and try again.");
    }
    setBusy(false);
  }

  const loginOf = (barber: Barber) => {
    const mine = logins?.filter((l) => l.barberId === barber.id) ?? [];
    return mine.find((l) => l.active) ?? mine[0];
  };

  return (
    <div className="min-h-screen pb-28">
      <AdminHeader session={session} title="Barbers" />

      <main className="mx-auto max-w-xl px-4 pt-6">
        <p className="mb-3 text-sm text-muted-strong">
          Customers see barbers in this order. "Any barber" gives a booking to whoever has the
          fewest that day, then the first in this list.
        </p>
        {error && (
          <Notice tone="error" className="mb-3">
            {error}
          </Notice>
        )}
        <ul className="grid gap-2">
          {active.map((b, i) => (
            <BarberRow
              key={b.id}
              barber={b}
              login={loginOf(b)}
              loading={logins === null}
              isOwner={b.id === session.barber.id}
              controls={
                <div className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    aria-label={`Move ${b.name} up`}
                    disabled={busy || i === 0}
                    onClick={() => move(b, -1)}
                    className="flex h-9 w-11 items-center justify-center rounded-lg text-ink hover:bg-cream disabled:opacity-30"
                  >
                    <ChevronUp aria-hidden size={20} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${b.name} down`}
                    disabled={busy || i === active.length - 1}
                    onClick={() => move(b, 1)}
                    className="flex h-9 w-11 items-center justify-center rounded-lg text-ink hover:bg-cream disabled:opacity-30"
                  >
                    <ChevronDown aria-hidden size={20} />
                  </button>
                </div>
              }
            />
          ))}
        </ul>

        {inactive.length > 0 && (
          <>
            <h2 className="caps mb-2 mt-8 text-sm font-semibold">Inactive</h2>
            <p className="mb-3 text-sm text-muted-strong">
              Hidden from customers. Open one to move or cancel his upcoming bookings, or bring him back.
            </p>
            <ul className="grid gap-2">
              {inactive.map((b) => (
                <BarberRow key={b.id} barber={b} login={loginOf(b)} loading={logins === null} isOwner={false} />
              ))}
            </ul>
          </>
        )}

        <AddBarberForm shop={shop} barbers={barbers} />
      </main>

      <AdminNav active="barbers" />
    </div>
  );
}

function BarberRow({
  barber,
  login,
  loading,
  isOwner,
  controls,
}: {
  barber: Barber;
  login: StaffMember | undefined;
  loading: boolean;
  isOwner: boolean;
  controls?: ReactNode;
}) {
  return (
    <li className={`flex items-center gap-1 rounded-2xl border border-line bg-card pr-1 ${barber.active ? '' : 'opacity-70'}`}>
      <Link
        to={`/admin/barbers/${barber.id}`}
        className="flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-2 hover:bg-cream/50"
      >
        <span
          aria-hidden
          className="caps flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-charcoal font-semibold text-brass-light"
        >
          {initials(barber.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">
            {barber.name}
            {isOwner && <span className="text-sm font-medium text-muted-strong"> · owner</span>}
          </span>
          <span className="block truncate text-sm text-muted-strong">
            {loading
              ? '…'
              : login
                ? `Login: ${login.username}${login.active ? '' : ' (off)'}`
                : 'No login yet'}
          </span>
        </span>
        <ChevronRight aria-hidden size={18} className="shrink-0 text-muted" />
      </Link>
      {controls}
    </li>
  );
}
