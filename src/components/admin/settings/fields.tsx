import type { ReactNode } from 'react';
import { SLOT_MINUTES } from '../../../config';
import { minutesToTime } from '../../../lib/time';
import type { TimeString } from '../../../types';
import { buttonOutline, inputBase } from '../../ui';

export const smallButtonClass = `${buttonOutline} text-sm`;

/** Remove / Unblock and the like: red text, still 44px tall. */
export const removeButtonClass =
  'inline-flex min-h-11 shrink-0 items-center px-1 text-sm font-semibold text-pole-red underline-offset-4 hover:underline';

/** A white card inside a settings section. */
export const cardClass = 'rounded-2xl border border-line bg-card p-4';

/** Every time on the 15-min grid, 00:00 to 23:45. */
const TIMES = Array.from({ length: (24 * 60) / SLOT_MINUTES }, (_, i) => minutesToTime(i * SLOT_MINUTES));

/**
 * A time picker limited to the 15-min grid (mobile time inputs ignore `step`), and to `min`–`max`
 * when given. The current value is always offered, even outside them, so it shows as it is.
 */
export function TimeSelect({
  value,
  onChange,
  label,
  min = '00:00',
  max = '23:45',
}: {
  value: TimeString;
  onChange: (time: TimeString) => void;
  label: string;
  min?: TimeString;
  max?: TimeString;
}) {
  const times = TIMES.filter((t) => t === value || (t >= min && t <= max));
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputBase} min-w-0 flex-1 tabular-nums`}
    >
      {times.map((t) => (
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
      <h2 className="caps text-lg font-semibold">{title}</h2>
      {description && <p className="mb-3 text-sm text-muted-strong">{description}</p>}
      <div className={description ? '' : 'mt-3'}>{children}</div>
    </section>
  );
}
