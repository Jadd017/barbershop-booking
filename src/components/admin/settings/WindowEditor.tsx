import { MAX_BOOKING_WINDOW_DAYS, MAX_SPECIAL_PERIODS } from '../../../config';
import { addDays } from '../../../lib/time';
import type { DateKey, SpecialPeriod } from '../../../types';
import { inputBase } from '../../ui';
import { cardClass, removeButtonClass, Section, smallButtonClass } from './fields';

interface Props {
  today: DateKey;
  bookingWindowDays: number;
  specialPeriods: SpecialPeriod[];
  onChange: (change: { bookingWindowDays?: number; specialPeriods?: SpecialPeriod[] }) => void;
}

/** A whole number of days, or NaN while the field is empty (settingsErrors reports it). */
function DaysInput({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      aria-label={label}
      min={1}
      max={MAX_BOOKING_WINDOW_DAYS}
      value={Number.isNaN(value) ? '' : value}
      onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
      className={`${inputBase} w-20 text-center tabular-nums`}
    />
  );
}

export function WindowEditor({ today, bookingWindowDays, specialPeriods, onChange }: Props) {
  function setPeriod(index: number, period: SpecialPeriod) {
    onChange({ specialPeriods: specialPeriods.map((p, i) => (i === index ? period : p)) });
  }

  return (
    <Section title="Booking window">
      <div className={`${cardClass} flex items-center gap-3`}>
        <span className="flex-1 text-sm">Customers can book this many days ahead, today included</span>
        <DaysInput
          label="Days ahead"
          value={bookingWindowDays}
          onChange={(n) => onChange({ bookingWindowDays: n })}
        />
      </div>

      <h3 className="mt-5 font-semibold">Special periods</h3>
      <p className="mb-3 text-sm text-muted-strong">
        For holidays: between these dates, customers can book further ahead.
      </p>
      <ul className="grid gap-3">
        {specialPeriods.map((period, i) => (
          <li key={i} className={cardClass}>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Name</span>
              <input
                type="text"
                value={period.name}
                maxLength={40}
                placeholder="Christmas"
                onChange={(e) => setPeriod(i, { ...period, name: e.target.value })}
                className={`${inputBase} w-full`}
              />
            </label>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label>
                <span className="mb-1 block text-sm font-medium">From</span>
                <input
                  type="date"
                  value={period.start}
                  onChange={(e) => setPeriod(i, { ...period, start: e.target.value })}
                  className={`${inputBase} w-full`}
                />
              </label>
              <label>
                <span className="mb-1 block text-sm font-medium">To</span>
                <input
                  type="date"
                  value={period.end}
                  min={period.start}
                  onChange={(e) => setPeriod(i, { ...period, end: e.target.value })}
                  className={`${inputBase} w-full`}
                />
              </label>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <span className="flex-1 text-sm">Days ahead during this period</span>
              <DaysInput
                label={`${period.name || 'Special period'} days ahead`}
                value={period.daysAhead}
                onChange={(daysAhead) => setPeriod(i, { ...period, daysAhead })}
              />
            </div>
            <button
              type="button"
              onClick={() => onChange({ specialPeriods: specialPeriods.filter((_, j) => j !== i) })}
              className={`${removeButtonClass} mt-2`}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      {specialPeriods.length < MAX_SPECIAL_PERIODS && (
        <button
          type="button"
          onClick={() =>
            onChange({
              specialPeriods: [
                ...specialPeriods,
                { name: '', start: today, end: addDays(today, 14), daysAhead: 14 },
              ],
            })
          }
          className={`${smallButtonClass} mt-3 w-full`}
        >
          + Add special period
        </button>
      )}
    </Section>
  );
}
