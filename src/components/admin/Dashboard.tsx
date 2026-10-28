import { ChevronDown, ChevronLeft, ChevronRight, Coffee, Lock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import i18n from '../../i18n';
import { subscribeBookingsOn } from '../../data/bookings';
import { subscribeDay, subscribeDaysOn } from '../../data/days';
import { store } from '../../data/firebase';
import { useNow } from '../../hooks/useNow';
import { useBookingServiceName } from '../../hooks/useServiceNames';
import { barberHoursOn } from '../../lib/barberSchedule';
import { initials } from '../../lib/initials';
import { blockedRanges, notWorkingReason } from '../../lib/staffDay';
import { dayCounts, totalCounts, type DayCounts } from '../../lib/team';
import { addDays, formatDayLong, minutesToTime, timeToMinutes, toDateKey } from '../../lib/time';
import type { Barber, BarberDay, DateKey, ShopSettings, ShopStaffBooking } from '../../types';
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
  if (!h) return i18n.t('dashboard.waitMinutes', { m });
  return m ? i18n.t('dashboard.waitHoursMinutes', { h, m }) : i18n.t('dashboard.waitHours', { h });
}

/**
 * A day at the shop. A barber sees only his own bookings, breaks and blocked time. The owner sees
 * every barber: the whole shop's numbers on top, then on a phone one barber at a time (a switcher
 * with each one's numbers), and on a wide screen all of them side by side.
 * "Today" shows who's up next and the rest of the day; "Calendar" shows any day. Which one, and
 * whether the walk-in sheet is open, lives in the history state (AdminNav).
 */
export function Dashboard({ session }: { session: StaffSession }) {
  const { t } = useTranslation();
  const { shop, barber: me, barbers, isOwner } = session;
  const location = useLocation();
  const navigate = useNavigate();
  const nav = (location.state ?? {}) as AdminNavState;
  const mode = nav.mode ?? 'today';

  const now = useNow();
  const today = toDateKey(now);
  const [calendarDate, setCalendarDate] = useState<DateKey>(today);
  const date = mode === 'today' ? today : calendarDate;
  // The owner's barber on a phone.
  const [selectedId, setSelectedId] = useState(me.id);

  // Tagged with what they were loaded for, so a previous day's (or login's) data is never shown.
  const scope = `${date}|${isOwner ? '*' : me.id}`;
  const [bookings, setBookings] = useState<{ scope: string; items: ShopStaffBooking[] } | null>(null);
  const [days, setDays] = useState<{ scope: string; days: Map<string, BarberDay> } | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const scope = `${date}|${isOwner ? '*' : me.id}`;
    return subscribeBookingsOn(
      store,
      isOwner ? null : me.id,
      date,
      (items) => {
        setBookings({ scope, items });
        setLoadError(false);
      },
      (err) => {
        console.error(err);
        setLoadError(true);
      },
    );
  }, [isOwner, me.id, date]);

  useEffect(() => {
    const scope = `${date}|${isOwner ? '*' : me.id}`;
    const onError = (err: Error) => console.error(err);
    return isOwner
      ? subscribeDaysOn(store, date, (value) => setDays({ scope, days: value }), onError)
      : subscribeDay(store, me.id, date, (d) => setDays({ scope, days: new Map([[me.id, d]]) }), onError);
  }, [isOwner, me.id, date]);

  const items = bookings?.scope === scope ? bookings.items : null;
  const dayDocs = days?.scope === scope ? days.days : null;

  // The owner sees every active barber, and an inactive one only on a day he still has bookings.
  const shown = isOwner
    ? barbers.filter((b) => b.active || items?.some((x) => x.barberId === b.id && x.status !== 'cancelled'))
    : [me];
  const selected = shown.find((b) => b.id === selectedId) ?? shown[0];
  const counts = new Map(
    shown.map((b) => [b.id, items && dayDocs ? dayCounts(shop, b, date, items, dayDocs.get(b.id), now) : null]),
  );
  const loaded = [...counts.values()].filter((c): c is DayCounts => c !== null);
  const header = loaded.length === shown.length ? totalCounts(loaded) : null;
  const myHours = barberHoursOn(shop, me, date);

  // Minutes since midnight that count as "now" on `date` (past days are all over).
  const nowMinutes = date === today ? now.getHours() * 60 + now.getMinutes() : date < today ? 24 * 60 : -1;

  function closeWalkIn(nextMode = mode) {
    navigate('/admin', { replace: true, state: { mode: nextMode } satisfies AdminNavState });
  }

  const column = (barber: Barber, heading: boolean) => (
    <BarberColumn
      key={barber.id}
      shop={shop}
      barber={barber}
      self={barber.id === me.id}
      heading={heading}
      date={date}
      mode={mode}
      nowMinutes={nowMinutes}
      bookings={(items ?? []).filter((b) => b.barberId === barber.id)}
      day={dayDocs?.get(barber.id)}
      counts={counts.get(barber.id) ?? null}
    />
  );

  return (
    <div className="min-h-screen pb-28">
      <AdminHeader
        session={session}
        overline={formatDayLong(date)}
        title={mode === 'today' ? t('dashboard.today') : t('dashboard.calendar')}
        wide={isOwner}
      >
        {isOwner && (
          <p className="caps mt-3 text-xs font-medium tracking-[0.2em] text-brass-light">{t('dashboard.wholeShop')}</p>
        )}
        <dl className={`grid grid-cols-3 gap-2 lg:max-w-xl ${isOwner ? 'mt-1' : 'mt-4'}`}>
          {[
            [t('dashboard.bookings'), header?.bookings],
            [t('dashboard.done'), header?.done],
            [t('dashboard.freeSlots'), header?.freeSlots],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex flex-col-reverse rounded-xl border border-cream/15 bg-cream/5 px-3 py-2"
            >
              <dt className="caps text-[11px] font-medium text-brass-light">{label}</dt>
              <dd className="caps text-3xl font-semibold tabular-nums">{value ?? '–'}</dd>
            </div>
          ))}
        </dl>
        {!isOwner && myHours && (
          <p className="mt-3 text-sm text-line tabular-nums">
            {t('dashboard.working', { start: myHours.start, end: myHours.end })}
          </p>
        )}
      </AdminHeader>

      <main className={`mx-auto max-w-xl px-4 pt-5 ${isOwner ? 'lg:max-w-none lg:px-8' : ''}`}>
        {mode === 'calendar' && (
          <div className="mb-5 lg:max-w-xl">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCalendarDate(addDays(date, -1))}
                aria-label={t('dashboard.previousDay')}
                className={`${buttonOutline} px-3`}
              >
                <ChevronLeft aria-hidden size={20} className="rtl:-scale-x-100" />
              </button>
              <input
                type="date"
                aria-label={t('common.day')}
                value={date}
                onChange={(e) => e.target.value && setCalendarDate(e.target.value)}
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-card px-3 text-center"
              />
              <button
                type="button"
                onClick={() => setCalendarDate(addDays(date, 1))}
                aria-label={t('dashboard.nextDay')}
                className={`${buttonOutline} px-3`}
              >
                <ChevronRight aria-hidden size={20} className="rtl:-scale-x-100" />
              </button>
            </div>
            {date !== today && (
              <button
                type="button"
                onClick={() => setCalendarDate(today)}
                className={`${linkButton} text-ink underline`}
              >
                {t('dashboard.backToToday')}
              </button>
            )}
          </div>
        )}

        {loadError ? (
          <Notice tone="error">{t('dashboard.loadError')}</Notice>
        ) : !items ? (
          <p className="text-sm text-muted-strong">{t('common.loading')}</p>
        ) : !isOwner ? (
          column(me, false)
        ) : (
          <>
            {/* Phone: one barber at a time. */}
            <div className="lg:hidden">
              <div role="group" aria-label={t('dashboard.barber')} className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
                {shown.map((b) => {
                  const c = counts.get(b.id);
                  const current = b.id === selected?.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      aria-pressed={current}
                      onClick={() => setSelectedId(b.id)}
                      className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full border py-1 ps-1 pe-3 text-sm font-semibold ${
                        current ? 'border-charcoal bg-charcoal text-cream' : 'border-line bg-card text-ink'
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`caps flex h-8 w-8 items-center justify-center rounded-full text-xs ${
                          current ? 'bg-brass text-charcoal' : 'bg-cream'
                        }`}
                      >
                        {initials(b.name)}
                      </span>
                      {b.name.split(' ')[0]}
                      <span className={`tabular-nums ${current ? 'text-brass-light' : 'text-muted-strong'}`}>
                        {c ? c.bookings : '–'}
                      </span>
                    </button>
                  );
                })}
              </div>
              {selected && column(selected, true)}
            </div>

            {/* Wide screen: every barber side by side. */}
            <div className="hidden overflow-x-auto pb-4 lg:block">
              <div
                className="grid gap-4"
                style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(18rem, 1fr))` }}
              >
                {shown.map((b) => column(b, true))}
              </div>
            </div>
          </>
        )}
      </main>

      <AdminNav active={mode} />

      {nav.walkIn && (
        <AddBookingSheet
          shop={shop}
          barbers={isOwner ? barbers.filter((b) => b.active) : [me]}
          initialBarberId={isOwner && selected ? selected.id : me.id}
          initialDate={date}
          onClose={() => closeWalkIn()}
          onAdded={(addedDate, barberId) => {
            setCalendarDate(addedDate);
            setSelectedId(barberId);
            closeWalkIn(addedDate === today && mode === 'today' ? 'today' : 'calendar');
          }}
        />
      )}
    </div>
  );
}

interface ColumnProps {
  shop: ShopSettings;
  barber: Barber;
  /** The signed-in barber's own column ("your day off" rather than "Karim's day off"). */
  self: boolean;
  /** Shows his name and numbers on top (the owner's view). */
  heading: boolean;
  date: DateKey;
  mode: 'today' | 'calendar';
  nowMinutes: number;
  /** His bookings that day, every status. */
  bookings: ShopStaffBooking[];
  day: BarberDay | undefined;
  counts: DayCounts | null;
}

/** One barber's day: up next, later and earlier today (or the whole day), and cancelled ones. */
function BarberColumn({ shop, barber, self, heading, date, mode, nowMinutes, bookings, day, counts }: ColumnProps) {
  const { t } = useTranslation();
  const [showCancelled, setShowCancelled] = useState(false);
  const hours = barberHoursOn(shop, barber, date);
  const offReason = notWorkingReason(shop, barber, date, self);

  const active = bookings.filter((b) => b.status !== 'cancelled');
  const cancelled = bookings.filter((b) => b.status === 'cancelled');

  const breaksAndBlocks: Entry[] = [
    ...(hours?.breaks ?? []).map((b) => ({
      kind: 'break' as const,
      start: timeToMinutes(b.start),
      end: timeToMinutes(b.end),
    })),
    ...blockedRanges(day?.blocked ?? []).map((b) => ({
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

  return (
    <section aria-label={heading ? barber.name : undefined} className="min-w-0">
      {heading && (
        <div className="mb-4 flex items-center gap-3">
          <span
            aria-hidden
            className="caps flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-charcoal font-semibold text-brass-light"
          >
            {initials(barber.name)}
          </span>
          <div className="min-w-0">
            <h2 className="caps truncate text-lg font-semibold">
              {barber.name}
              {!barber.active && <span className="text-sm font-medium text-muted-strong">{t('dashboard.inactive')}</span>}
            </h2>
            <p className="text-sm text-muted-strong tabular-nums">
              {counts
                ? t('dashboard.counts', { bookings: counts.bookings, done: counts.done, free: counts.freeSlots })
                : t('common.loading')}
              {hours && ` · ${hours.start}–${hours.end}`}
            </p>
          </div>
        </div>
      )}

      {offReason && (
        <Notice tone="warning" className="mb-4">
          {offReason}
        </Notice>
      )}

      {mode === 'today' ? (
        <>
          {upNext && <UpNextCard booking={upNext} nowMinutes={nowMinutes} />}

          <SectionLabel className={upNext ? 'mt-6' : ''}>{t('dashboard.laterToday')}</SectionLabel>
          {later.length === 0 ? (
            <Empty>{upNext ? t('dashboard.nothingElse') : t('dashboard.noMore')}</Empty>
          ) : (
            <EntryList entries={later} />
          )}

          {earlier.length > 0 && (
            <>
              <SectionLabel className="mt-6">{t('dashboard.earlierToday')}</SectionLabel>
              <EntryList entries={earlier.map(asEntry)} />
            </>
          )}
        </>
      ) : wholeDay.length === 0 ? (
        <Empty>{t('dashboard.noBookingsDay')}</Empty>
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
            {t(showCancelled ? 'dashboard.hideCancelled' : 'dashboard.showCancelled', { count: cancelled.length })}
          </button>
          {showCancelled && <EntryList entries={cancelled.map(asEntry)} />}
        </div>
      )}
    </section>
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
  const { t } = useTranslation();
  const serviceName = useBookingServiceName();
  const wait = timeToMinutes(booking.startTime) - nowMinutes;
  return (
    <section
      aria-label={t('dashboard.upNext')}
      className="rounded-2xl border-2 border-brass bg-card p-4 shadow-md"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="caps text-sm font-semibold">
          {t('dashboard.upNext')} <span className="text-line">·</span>{' '}
          {wait > 0 ? t('dashboard.inWait', { wait: formatWait(wait) }) : t('dashboard.now')}
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
        {serviceName(booking)} · {t('common.minutes', { minutes: booking.durationMinutes })}
      </p>
      <BookingActions booking={booking} />
    </section>
  );
}

function EntryList({ entries }: { entries: Entry[] }) {
  const { t } = useTranslation();
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
            <span className="caps text-xs font-medium">
              {e.kind === 'break' ? t('dashboard.break') : t('dashboard.blocked')}
            </span>
            <span className="ms-auto tabular-nums">{t('dashboard.until', { time: minutesToTime(e.end) })}</span>
          </li>
        ),
      )}
    </ul>
  );
}

/** A compact line that opens to show the details and actions. */
function BookingRow({ booking }: { booking: ShopStaffBooking }) {
  const serviceName = useBookingServiceName();
  const [open, setOpen] = useState(false);
  return (
    <li className={booking.status === 'cancelled' ? 'opacity-60' : ''}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-start hover:bg-cream/50"
      >
        <span className="w-14 shrink-0">
          <span className="caps block font-semibold tabular-nums">{booking.startTime}</span>
          <span className="block text-xs text-muted tabular-nums">{minutesToTime(endOf(booking))}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{booking.name}</span>
          <span className="block truncate text-sm text-muted">{serviceName(booking)}</span>
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
