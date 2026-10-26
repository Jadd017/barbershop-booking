import { useEffect, useState } from 'react';
import { subscribeBookingsOn } from '../../../data/bookings';
import { blockTime, subscribeBlockedTimes, unblockTime } from '../../../data/days';
import { store } from '../../../data/firebase';
import { barberHoursOn, shopHoursOn } from '../../../lib/barberSchedule';
import { overlaps } from '../../../lib/schedule';
import { blockError } from '../../../lib/staffDay';
import { formatDayLong, timeToMinutes } from '../../../lib/time';
import type { Barber, BlockedTime, DateKey, ShopSettings, ShopStaffBooking } from '../../../types';
import { inputBase } from '../../ui';
import { BookingCard } from '../BookingCard';
import { cardClass, removeButtonClass, Section, smallButtonClass, TimeSelect } from './fields';

interface Props {
  today: DateKey;
  shop: ShopSettings;
  /** Whose time is blocked: the signed-in barber's own, or any barber's for the owner. */
  barber: Barber;
  /** The signed-in barber's own ("you") rather than one the owner manages. */
  self: boolean;
}

/**
 * Blocks a time range on one day of a barber's, saved straight away (not part of the hours
 * draft), so customers can't book it. Only inside the shop's hours, on a day it's open.
 * Times already booked stay with their bookings: they're listed so he can cancel them first.
 */
export function BlockedTimes({ today, shop, barber, self }: Props) {
  const barberId = barber.id;
  const [date, setDate] = useState(today);
  const [start, setStart] = useState('16:00');
  const [end, setEnd] = useState('17:00');
  const [dayBookings, setDayBookings] = useState<{ date: DateKey; items: ShopStaffBooking[] } | null>(
    null,
  );
  const [blocked, setBlocked] = useState<BlockedTime[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  useEffect(
    () =>
      subscribeBookingsOn(
        store,
        barberId,
        date,
        (items) => setDayBookings({ date, items }),
        (err) => console.error(err),
      ),
    [barberId, date],
  );

  useEffect(
    () =>
      subscribeBlockedTimes(store, barberId, today, setBlocked, (err) => {
        console.error(err);
        setMessage({ error: true, text: "Couldn't load blocked times. Check your connection." });
      }),
    [barberId, today],
  );

  const from = timeToMinutes(start);
  const to = timeToMinutes(end);
  const rangeError = blockError(shop, date, start, end);
  const clashes =
    dayBookings?.date === date && from < to
      ? dayBookings.items.filter(
          (b) =>
            b.status === 'booked' &&
            overlaps(
              from,
              to,
              timeToMinutes(b.startTime),
              timeToMinutes(b.startTime) + b.durationMinutes,
            ),
        )
      : [];
  const shopHours = shopHoursOn(shop, date);
  const myHours = barberHoursOn(shop, barber, date);

  async function block() {
    setMessage(null);
    if (rangeError) return;
    setBusy(true);
    try {
      const count = await blockTime(store, barberId, date, start, end);
      setMessage({
        error: false,
        text:
          count === 0
            ? 'Nothing to block: those times are already booked or blocked.'
            : `Blocked ${start}–${end} on ${formatDayLong(date)}.`,
      });
    } catch (err) {
      console.error(err);
      setMessage({ error: true, text: "Couldn't block. Check your connection and try again." });
    }
    setBusy(false);
  }

  async function unblock(range: BlockedTime) {
    setMessage(null);
    try {
      await unblockTime(store, barberId, range.date, range.start, range.end);
    } catch (err) {
      console.error(err);
      setMessage({ error: true, text: "Couldn't unblock. Check your connection and try again." });
    }
  }

  return (
    <Section
      title="Blocked times"
      description={`Block part of a day so customers can't book ${self ? 'you' : barber.name} then. Saved straight away.`}
    >
      {blocked && blocked.length > 0 && (
        <ul className="mb-3 grid gap-2">
          {blocked.map((range) => (
            <li
              key={`${range.date}_${range.start}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-card px-4 py-2"
            >
              <span className="text-sm font-medium">
                {formatDayLong(range.date)} ·{' '}
                <span className="tabular-nums">
                  {range.start}–{range.end}
                </span>
              </span>
              <button
                type="button"
                onClick={() => unblock(range)}
                className={removeButtonClass}
              >
                Unblock
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={cardClass}>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Day</span>
          <input
            type="date"
            min={today}
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className={`${inputBase} w-full`}
          />
        </label>
        <p className="mt-1 text-sm text-muted">
          {!shopHours
            ? 'The shop is closed that day.'
            : `Shop open ${shopHours.start}–${shopHours.end}. ${
                myHours
                  ? `${self ? 'You work' : `${barber.name} works`} ${myHours.start}–${myHours.end}.`
                  : `${self ? "You're" : `${barber.name} is`} not working that day.`
              }`}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <TimeSelect
            label="Block from"
            value={start}
            onChange={setStart}
            min={shopHours?.start}
            max={shopHours?.end}
          />
          <span className="text-muted">to</span>
          <TimeSelect
            label="Block until"
            value={end}
            onChange={setEnd}
            min={shopHours?.start}
            max={shopHours?.end}
          />
        </div>
        {rangeError && <p className="mt-2 text-sm text-pole-red">{rangeError}</p>}

        {clashes.length > 0 && (
          <div className="mt-4 rounded-xl border border-brass/50 bg-brass/10 p-3">
            <p className="mb-3 text-sm font-medium text-ink">
              {clashes.length === 1 ? 'This booking is' : `These ${clashes.length} bookings are`}{' '}
              in that time. Blocking won't cancel {clashes.length === 1 ? 'it' : 'them'}: cancel
              here if needed and let the customer know. If you block first, a booking's time opens
              up again when it's cancelled.
            </p>
            <ul className="grid gap-3">
              {clashes.map((b) => (
                <BookingCard key={b.id} booking={b} cancelOnly />
              ))}
            </ul>
          </div>
        )}

        {message && (
          <p className={`mt-3 text-sm ${message.error ? 'text-pole-red' : 'text-ink'}`}>
            {message.text}
          </p>
        )}

        <button
          type="button"
          onClick={block}
          disabled={busy || rangeError !== null}
          className={`${smallButtonClass} mt-3 w-full`}
        >
          {busy
            ? 'Blocking…'
            : clashes.length > 0
              ? `Block the free times ${start}–${end} anyway`
              : `Block ${start}–${end}`}
        </button>
      </div>
    </Section>
  );
}
