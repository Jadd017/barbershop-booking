import { useState } from 'react';
import { addDays, formatDayLong } from '../../../lib/time';
import type { DateKey } from '../../../types';
import { inputClass, Section, smallButtonClass } from './fields';

/** Longest range added at once, so a typo in the year doesn't add thousands of dates. */
const MAX_RANGE_DAYS = 90;

interface Props {
  today: DateKey;
  daysOff: DateKey[];
  onChange: (daysOff: DateKey[]) => void;
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

export function DaysOffEditor({ today, daysOff, onChange }: Props) {
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  function add() {
    const end = to || from;
    if (!from || end < from) return setError('The last day must be on or after the first.');
    const dates: DateKey[] = [];
    for (let d = from; d <= end && dates.length < MAX_RANGE_DAYS; d = addDays(d, 1)) dates.push(d);
    if (dates[dates.length - 1] !== end) {
      return setError(`Add at most ${MAX_RANGE_DAYS} days at a time.`);
    }
    setError(null);
    onChange([...new Set([...daysOff, ...dates])].sort());
    setTo('');
  }

  const upcoming = toRanges(daysOff.filter((d) => d >= today));

  return (
    <Section title="Days off" description="The shop is closed on these days (vacation, holidays).">
      {upcoming.length > 0 && (
        <ul className="mb-3 grid gap-2">
          {upcoming.map(({ from: a, to: b }) => (
            <li
              key={a}
              className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3"
            >
              <span className="text-sm font-medium">
                {formatDayLong(a)}
                {a !== b && ` – ${formatDayLong(b)}`}
              </span>
              <button
                type="button"
                onClick={() => onChange(daysOff.filter((d) => d < a || d > b))}
                className="shrink-0 text-sm font-semibold text-red-700 underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-2xl border border-neutral-200 bg-white p-4">
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className="mb-1 block text-sm font-medium">From</span>
            <input
              type="date"
              min={today}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={`${inputClass} w-full`}
            />
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium">
              To <span className="font-normal text-neutral-500">(optional)</span>
            </span>
            <input
              type="date"
              min={from}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={`${inputClass} w-full`}
            />
          </label>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <button type="button" onClick={add} className={`${smallButtonClass} mt-3 w-full`}>
          + Add {to && to !== from ? 'days off' : 'day off'}
        </button>
      </div>
    </Section>
  );
}
