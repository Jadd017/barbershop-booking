import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../../i18n';
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
  const { t } = useTranslation();
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
        setMessage({ error: true, text: i18n.t('blocked.loadError') });
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
            ? t('blocked.nothing')
            : t('blocked.done', { start, end, day: formatDayLong(date) }),
      });
    } catch (err) {
      console.error(err);
      setMessage({ error: true, text: t('blocked.failed') });
    }
    setBusy(false);
  }

  async function unblock(range: BlockedTime) {
    setMessage(null);
    try {
      await unblockTime(store, barberId, range.date, range.start, range.end);
    } catch (err) {
      console.error(err);
      setMessage({ error: true, text: t('blocked.unblockFailed') });
    }
  }

  return (
    <Section
      title={t('blocked.title')}
      description={self ? t('blocked.descriptionYou') : t('blocked.descriptionThem', { name: barber.name })}
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
                {t('blocked.unblock')}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={cardClass}>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">{t('common.day')}</span>
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
            ? t('blocked.shopClosed')
            : `${t('blocked.shopOpen', { start: shopHours.start, end: shopHours.end })} ${
                myHours
                  ? self
                    ? t('blocked.youWork', { start: myHours.start, end: myHours.end })
                    : t('blocked.theyWork', { name: barber.name, start: myHours.start, end: myHours.end })
                  : self
                    ? t('blocked.youOff')
                    : t('blocked.theyOff', { name: barber.name })
              }`}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <TimeSelect
            label={t('blocked.from')}
            value={start}
            onChange={setStart}
            min={shopHours?.start}
            max={shopHours?.end}
          />
          <span className="text-muted">{t('common.toTime')}</span>
          <TimeSelect
            label={t('blocked.until')}
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
              {clashes.length === 1 ? t('blocked.clashOne') : t('blocked.clashMany', { count: clashes.length })}
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
            ? t('blocked.blocking')
            : clashes.length > 0
              ? t('blocked.blockAnyway', { start, end })
              : t('blocked.block', { start, end })}
        </button>
      </div>
    </Section>
  );
}
