import { ChevronDown, ChevronLeft, ChevronRight, Coffee, Lock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { SLOT_MINUTES } from '../../config';
import { subscribeBookingsOn } from '../../data/bookings';
import { subscribeDay } from '../../data/days';
import { store } from '../../data/firebase';
import { useNow } from '../../hooks/useNow';
import { barberHoursOn } from '../../lib/barberSchedule';
import { barberStartTimes } from '../../lib/barberSlots';
import { blockedRanges, notWorkingReason } from '../../lib/staffDay';
import { addDays, formatDayLong, minutesToTime, timeToMinutes, toDateKey } from '../../lib/time';
import type { BarberDay, DateKey, ShopStaffBooking } from '../../types';
import { buttonOutline, linkButton, Notice, SectionLabel, StatusChip } from '../ui';
import { AddBookingSheet } from './AddBookingSheet';
import { AdminHeader } from './AdminHeader';
import { AdminNav, type AdminNavState } from './AdminNav';
import { BookingActions } from './BookingActions';
import { BookingDetails } from './BookingCard';
import type { StaffSession } from './session';

/** One line of a day's list: a booking, a break or a blocked time. */
type Entry =
  | { kind: 'booking'; start: number; booking: ShopStaffBooking }
  | { kind: 'break' | 'blocked'; start: number; end: number };

const endOf = (b: ShopStaffBooking) => timeToMinutes(b.startTime) + b.durationMinutes;

/** "25 min", "1 h", "1 h 20 min". */
function formatWait(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * The signed-in barber's day: only his own bookings, breaks and blocked time (the owner, too, sees
 * his own here). "Today" shows who's up next and the rest of the day; "Calendar" shows any day.
 * Which one, and whether the walk-in sheet is open, lives in the history state (AdminNav).
 */
export function Dashboard({ session }: { session: StaffSession }) {
  const { shop, barber } = session;
  const barberId = barber.id;
  const location = useLocation();
  const navigate = useNavigate();
  const nav = (location.state ?? {}) as AdminNavState;
  const mode = nav.mode ?? 'today';

  const now = useNow();
  const today = toDateKey(now);
  const [calendarDate, setCalendarDate] = useState<DateKey>(today);
  const date = mode === 'today' ? today : calendarDate;

  // Both tagged with their date, so a previous day's list is never shown for a new day.
  const [bookings, setBookings] = useState<{ date: DateKey; items: ShopStaffBooking[] } | null>(null);
  const [day, setDay] = useState<BarberDay | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);

  useEffect(() => {
    return subscribeBookingsOn(
      store,
      barberId,
      date,
      (items) => {
        setBookings({ date, items });
        setLoadError(false);
      },
      (err) => {
        console.error(err);
        setLoadError(true);
      },
    );
  }, [barberId, date]);

  useEffect(
    () => subscribeDay(store, barberId, date, setDay, (err) => console.error(err)),
    [barberId, date],
  );

  const items = bookings?.date === date ? bookings.items : null;
  const thisDay = day?.date === date && day.barberId === barberId ? day : null;
  const hours = barberHoursOn(shop, barber, date);
  const offReason = notWorkingReason(shop, barber, date);

  const active = items?.filter((b) => b.status !== 'cancelled') ?? [];
  const cancelled = items?.filter((b) => b.status === 'cancelled') ?? [];
  // Free 15-min slots left in his hours (not booked, blocked, in a break or past).
  const freeSlots = thisDay
    ? barberStartTimes(date, SLOT_MINUTES, shop, barber, thisDay, now).filter((o) => o.available).length
    : undefined;

  // Minutes since midnight that count as "now" on `date` (past days are all over).
  const nowMinutes = date === today ? now.getHours() * 60 + now.getMinutes() : date < today ? 24 * 60 : -1;

  const breaksAndBlocks: Entry[] = [
    ...(hours?.breaks ?? []).map((b) => ({
      kind: 'break' as const,
      start: timeToMinutes(b.start),
      end: timeToMinutes(b.end),
    })),
    ...blockedRanges(thisDay?.blocked ?? []).map((b) => ({
      kind: 'blocked' as const,
      start: timeToMinutes(b.start),
      end: timeToMinutes(b.end),
    })),
  ];
  const asEntry = (booking: ShopStaffBooking): Entry => ({
    kind: 'booking',
    start: timeToMinutes(booking.startTime),
    booking,
  });
  const byStart = (a: Entry, b: Entry) => a.start - b.start;

  // Today: the first booking not over yet is up next, the rest of the day follows.
  const pending = active.filter((b) => b.status === 'booked' && endOf(b) > nowMinutes);
  const upNext = mode === 'today' ? pending[0] : undefined;
  const later = [
    ...pending.slice(1).map(asEntry),
    ...breaksAndBlocks.filter((e) => e.kind !== 'booking' && e.end > nowMinutes),
  ].sort(byStart);
  const earlier = active.filter((b) => !pending.includes(b));
  const wholeDay = [...active.map(asEntry), ...breaksAndBlocks].sort(byStart);

  function closeWalkIn(nextMode = mode) {
    navigate('/admin', { replace: true, state: { mode: nextMode } satisfies AdminNavState });
  }

  return (
    <div className="min-h-screen pb-28">
      <AdminHeader
        session={session}
        overline={formatDayLong(date)}
        title={mode === 'today' ? 'Today' : 'Calendar'}
      >
        <dl className="mt-4 grid grid-cols-3 gap-2">
          {[
            ['Bookings', items ? active.length : '–'],
            ['Done', items ? active.filter((b) => b.status === 'done').length : '–'],
            ['Free slots', freeSlots ?? '–'],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex flex-col-reverse rounded-xl border border-cream/15 bg-cream/5 px-3 py-2"
            >
              <dt className="caps text-[11px] font-medium text-brass-light">{label}</dt>
              <dd className="caps text-3xl font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        {hours && (
          <p className="mt-3 text-sm text-line">
            Working {hours.start}–{hours.end}
          </p>
        )}
      </AdminHeader>

      <main className="mx-auto max-w-xl px-4 pt-5">
        {mode === 'calendar' && (
          <div className="mb-5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCalendarDate(addDays(date, -1))}
                aria-label="Previous day"
                className={`${buttonOutline} px-3`}
              >
                <ChevronLeft aria-hidden size={20} />
              </button>
              <input
                type="date"
                aria-label="Day"
                value={date}
                onChange={(e) => e.target.value && setCalendarDate(e.target.value)}
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-card px-3 text-center"
              />
              <button
                type="button"
                onClick={() => setCalendarDate(addDays(date, 1))}
                aria-label="Next day"
                className={`${buttonOutline} px-3`}
              >
                <ChevronRight aria-hidden size={20} />
              </button>
            </div>
            {date !== today && (
              <button
                type="button"
                onClick={() => setCalendarDate(today)}
                className={`${linkButton} text-ink underline`}
              >
                Back to today
              </button>
            )}
          </div>
        )}

        {loadError ? (
          <Notice tone="error">Couldn't load bookings. Check your connection and refresh.</Notice>
        ) : !items ? (
          <p className="text-sm text-muted-strong">Loading…</p>
        ) : (
          <>
            {offReason && (
              <Notice tone="warning" className="mb-4">
                {offReason}
              </Notice>
            )}

            {mode === 'today' ? (
              <>
                {upNext && <UpNextCard booking={upNext} nowMinutes={nowMinutes} />}

                <SectionLabel className="mt-6">Later today</SectionLabel>
                {later.length === 0 ? (
                  <Empty>{upNext ? 'Nothing else today.' : 'No more bookings today.'}</Empty>
                ) : (
                  <EntryList entries={later} />
                )}

                {earlier.length > 0 && (
                  <>
                    <SectionLabel className="mt-6">Earlier today</SectionLabel>
                    <EntryList entries={earlier.map(asEntry)} />
                  </>
                )}
              </>
            ) : wholeDay.length === 0 ? (
              <Empty>No bookings on this day.</Empty>
            ) : (
              <EntryList entries={wholeDay} />
            )}

            {cancelled.length > 0 && (
              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => setShowCancelled(!showCancelled)}
                  aria-expanded={showCancelled}
                  className={`${linkButton} text-muted-strong`}
                >
                  <ChevronDown
                    aria-hidden
                    size={16}
                    className={showCancelled ? 'rotate-180 transition' : 'transition'}
                  />
                  {showCancelled ? 'Hide' : 'Show'} cancelled ({cancelled.length})
                </button>
                {showCancelled && <EntryList entries={cancelled.map(asEntry)} />}
              </div>
            )}
          </>
        )}
      </main>

      <AdminNav active={mode} />

      {nav.walkIn && (
        <AddBookingSheet
          shop={shop}
          barber={barber}
          initialDate={date}
          onClose={() => closeWalkIn()}
          onAdded={(addedDate) => {
            setCalendarDate(addedDate);
            closeWalkIn(addedDate === today && mode === 'today' ? 'today' : 'calendar');
          }}
        />
      )}
    </div>
  );
}

function Empty({ children }: { children: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-line p-5 text-center text-sm text-muted-strong">
      {children}
    </p>
  );
}

/** The next customer, with big Done / No-show buttons. */
function UpNextCard({ booking, nowMinutes }: { booking: ShopStaffBooking; nowMinutes: number }) {
  const wait = timeToMinutes(booking.startTime) - nowMinutes;
  return (
    <section
      aria-label="Up next"
      className="rounded-2xl border-2 border-brass bg-card p-4 shadow-md"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="caps text-sm font-semibold">
          Up next <span className="text-line">·</span> {wait > 0 ? `In ${formatWait(wait)}` : 'Now'}
        </p>
        <StatusChip status={booking.status} />
      </div>
      <p className="caps text-4xl font-semibold tabular-nums">
        {booking.startTime}
        <span className="text-xl font-medium text-muted">
          –{minutesToTime(endOf(booking))}
        </span>
      </p>
      <p className="text-2xl font-semibold">{booking.name}</p>
      <p className="mb-4 text-muted">
        {booking.serviceName} · {booking.durationMinutes} min
      </p>
      <BookingActions booking={booking} />
    </section>
  );
}

function EntryList({ entries }: { entries: Entry[] }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
      {entries.map((e) =>
        e.kind === 'booking' ? (
          <BookingRow key={e.booking.id} booking={e.booking} />
        ) : (
          <li
            key={`${e.kind}-${e.start}`}
            className="flex min-h-12 items-center gap-3 bg-cream/60 px-4 py-2 text-sm text-muted"
          >
            <span className="w-14 shrink-0 font-semibold tabular-nums">{minutesToTime(e.start)}</span>
            {e.kind === 'break' ? (
              <Coffee aria-hidden size={16} />
            ) : (
              <Lock aria-hidden size={16} />
            )}
            <span className="caps text-xs font-medium">{e.kind === 'break' ? 'Break' : 'Blocked'}</span>
            <span className="ml-auto tabular-nums">until {minutesToTime(e.end)}</span>
          </li>
        ),
      )}
    </ul>
  );
}

/** A compact line that opens to show the details and actions. */
function BookingRow({ booking }: { booking: ShopStaffBooking }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={booking.status === 'cancelled' ? 'opacity-60' : ''}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left hover:bg-cream/50"
      >
        <span className="w-14 shrink-0">
          <span className="caps block font-semibold tabular-nums">{booking.startTime}</span>
          <span className="block text-xs text-muted tabular-nums">{minutesToTime(endOf(booking))}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{booking.name}</span>
          <span className="block truncate text-sm text-muted">{booking.serviceName}</span>
        </span>
        <StatusChip status={booking.status} />
        <ChevronDown
          aria-hidden
          size={18}
          className={`shrink-0 text-muted transition ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="border-t border-dashed border-line px-4 pb-4 pt-3">
          <BookingDetails booking={booking} />
          <div className="mt-3">
            <BookingActions booking={booking} />
          </div>
        </div>
      )}
    </li>
  );
}
