import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, formatDayLong } from '../../../lib/time';
import type { DateKey } from '../../../types';
import { inputBase } from '../../ui';
import { cardClass, removeButtonClass, Section, smallButtonClass } from './fields';

/** Longest range added at once, so a typo in the year doesn't add thousands of dates. */
const MAX_RANGE_DAYS = 90;

interface Props {
  today: DateKey;
  daysOff: DateKey[];
  onChange: (daysOff: DateKey[]) => void;
  title?: string;
  description?: string;
  /** Days that are off anyway (the shop's closed days, for a barber's own days off), shown below. */
  closedAnyway?: DateKey[];
}

/** Sorted dates grouped into runs of consecutive days. */
function toRanges(dates: DateKey[]): { from: DateKey; to: DateKey }[] {
  const ranges: { from: DateKey; to: DateKey }[] = [];
  for (const date of [...dates].sort()) {
    const last = ranges[ranges.length - 1];
    if (last && addDays(last.to, 1) === date) last.to = date;
    else ranges.push({ from: date, to: date });
  }
  return ranges;
}

export function DaysOffEditor({
  today,
  daysOff,
  onChange,
  title,
  description,
  closedAnyway = [],
}: Props) {
  const { t } = useTranslation();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  function add() {
    const end = to || from;
    if (!from || end < from) return setError(t('daysOff.lastAfterFirst'));
    const dates: DateKey[] = [];
    for (let d = from; d <= end && dates.length < MAX_RANGE_DAYS; d = addDays(d, 1)) dates.push(d);
    if (dates[dates.length - 1] !== end) {
      return setError(t('daysOff.maxRange', { max: MAX_RANGE_DAYS }));
    }
    setError(null);
    onChange([...new Set([...daysOff, ...dates])].sort());
    setTo('');
  }

  const upcoming = toRanges(daysOff.filter((d) => d >= today));
  const closed = toRanges(closedAnyway.filter((d) => d >= today));

  return (
    <Section title={title ?? t('daysOff.title')} description={description ?? t('daysOff.shopDescription')}>
      {upcoming.length > 0 && (
        <ul className="mb-3 grid gap-2">
          {upcoming.map(({ from: a, to: b }) => (
            <li
              key={a}
              className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-card px-4 py-2"
            >
              <span className="text-sm font-medium">
                {formatDayLong(a)}
                {a !== b && ` – ${formatDayLong(b)}`}
              </span>
              <button
                type="button"
                onClick={() => onChange(daysOff.filter((d) => d < a || d > b))}
                className={removeButtonClass}
              >
                {t('common.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={cardClass}>
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className="mb-1 block text-sm font-medium">{t('common.from')}</span>
            <input
              type="date"
              min={today}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={`${inputBase} w-full`}
            />
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium">
              {t('common.to')} <span className="font-normal text-muted">{t('common.optional')}</span>
            </span>
            <input
              type="date"
              min={from}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={`${inputBase} w-full`}
            />
          </label>
        </div>
        {error && <p className="mt-2 text-sm text-pole-red">{error}</p>}
        <button type="button" onClick={add} className={`${smallButtonClass} mt-3 w-full`}>
          {to && to !== from ? t('daysOff.addMany') : t('daysOff.addOne')}
        </button>
      </div>

      {closed.length > 0 && (
        <div className="mt-3 text-sm text-muted-strong">
          <p className="font-medium">{t('daysOff.shopClosedOn')}</p>
          <ul className="list-disc ps-5">
            {closed.map(({ from: a, to: b }) => (
              <li key={a}>
                {formatDayLong(a)}
                {a !== b && ` – ${formatDayLong(b)}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}
