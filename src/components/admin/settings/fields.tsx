import type { ReactNode } from 'react';
import { SLOT_MINUTES } from '../../../config';
import { minutesToTime } from '../../../lib/time';
import type { TimeString } from '../../../types';

export const inputClass =
  'rounded-xl border border-neutral-300 bg-white px-3 py-3 outline-none focus:border-neutral-900';

export const smallButtonClass =
  'rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold hover:border-neutral-500 disabled:opacity-40';

/** Every time on the 15-min grid, 00:00 to 23:45. */
const TIMES = Array.from({ length: (24 * 60) / SLOT_MINUTES }, (_, i) => minutesToTime(i * SLOT_MINUTES));

/** A time picker limited to the 15-min grid (mobile time inputs ignore `step`). */
export function TimeSelect({
  value,
  onChange,
  label,
}: {
  value: TimeString;
  onChange: (time: TimeString) => void;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputClass} min-w-0 flex-1 tabular-nums`}
    >
      {TIMES.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold">{title}</h2>
      {description && <p className="mb-3 text-sm text-neutral-600">{description}</p>}
      <div className={description ? '' : 'mt-3'}>{children}</div>
    </section>
  );
}
