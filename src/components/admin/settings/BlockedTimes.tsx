import { useEffect, useState } from 'react';
import { blockTime, subscribeBlockedTimes, subscribeBookings, unblockTime } from '../../../data/api';
import { hoursOn, overlaps } from '../../../lib/schedule';
import { formatDayLong, timeToMinutes } from '../../../lib/time';
import type { AdminBooking, BlockedTime, DateKey, Settings } from '../../../types';
import { BookingCard } from '../BookingCard';
import { inputClass, Section, smallButtonClass, TimeSelect } from './fields';

interface Props {
  today: DateKey;
  settings: Settings;
}

/**
 * Blocks a time range on one day, saved straight away (not part of the settings draft).
 * Blocked times are slot docs, so customers' availability and the rules treat them as taken.
 * Times already booked stay with their bookings: they're listed so Eddy can cancel them first.
 */
export function BlockedTimes({ today, settings }: Props) {
  const [date, setDate] = useState(today);
  const [start, setStart] = useState('16:00');
  const [end, setEnd] = useState('17:00');
  const [dayBookings, setDayBookings] = useState<{ date: DateKey; items: AdminBooking[] } | null>(
    null,
  );
  const [blocked, setBlocked] = useState<BlockedTime[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  useEffect(
    () =>
      subscribeBookings(
        date,
        (items) => setDayBookings({ date, items }),
        (err) => console.error(err),
      ),
    [date],
  );

  useEffect(
    () =>
      subscribeBlockedTimes(today, setBlocked, (err) => {
        console.error(err);
        setMessage({ error: true, text: "Couldn't load blocked times. Check your connection." });
      }),
    [today],
  );

  const from = timeToMinutes(start);
  const to = timeToMinutes(end);
  const validRange = from < to;
  const clashes =
    dayBookings?.date === date && validRange
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
  const hours = hoursOn(settings, date);

  async function block() {
    setMessage(null);
    setBusy(true);
    try {
      const count = await blockTime(date, start, end);
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
      await unblockTime(range.date, range.start, range.end);
    } catch (err) {
      console.error(err);
      setMessage({ error: true, text: "Couldn't unblock. Check your connection and try again." });
    }
  }

  return (
    <Section
      title="Blocked times"
      description="Block part of a day so customers can't book it. Saved straight away."
    >
      {blocked && blocked.length > 0 && (
        <ul className="mb-3 grid gap-2">
          {blocked.map((range) => (
            <li
              key={`${range.date}_${range.start}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3"
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
                className="shrink-0 text-sm font-semibold text-red-700 underline"
              >
                Unblock
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-2xl border border-neutral-200 bg-white p-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Day</span>
          <input
            type="date"
            min={today}
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className={`${inputClass} w-full`}
          />
        </label>
        <p className="mt-1 text-sm text-neutral-500">
          {hours ? `Open ${hours.start}–${hours.end} that day.` : 'The shop is closed that day.'}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <TimeSelect label="Block from" value={start} onChange={setStart} />
          <span className="text-neutral-500">to</span>
          <TimeSelect label="Block until" value={end} onChange={setEnd} />
        </div>
        {!validRange && <p className="mt-2 text-sm text-red-600">The end must be after the start.</p>}

        {clashes.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3">
            <p className="mb-3 text-sm font-medium text-amber-900">
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
          <p className={`mt-3 text-sm ${message.error ? 'text-red-600' : 'text-green-700'}`}>
            {message.text}
          </p>
        )}

        <button
          type="button"
          onClick={block}
          disabled={busy || !validRange}
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
