import { fromDateKey } from '../lib/time';
import type { DateKey } from '../types';

interface Props {
  /** Every day of the booking window; closed ones are shown but can't be picked. */
  days: { date: DateKey; open: boolean }[];
  today: DateKey;
  selected: DateKey;
  onSelect: (day: DateKey) => void;
}

export function DayPicker({ days, today, selected, onSelect }: Props) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {days.map(({ date, open }) => {
        const d = fromDateKey(date);
        const weekday = date === today ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' });
        const month = d.toLocaleDateString('en-US', { month: 'short' });
        const isSelected = open && date === selected;
        return (
          <button
            key={date}
            type="button"
            disabled={!open}
            onClick={() => onSelect(date)}
            aria-pressed={isSelected}
            aria-label={`${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${open ? '' : ', closed'}`}
            className={`flex min-h-20 min-w-16 flex-1 flex-col items-center justify-center rounded-2xl border px-2 py-2 transition ${
              !open
                ? 'cursor-not-allowed border-dashed border-line bg-transparent text-muted-strong'
                : isSelected
                  ? 'border-brass bg-brass text-charcoal shadow-md'
                  : 'border-line bg-card text-ink hover:border-muted'
            }`}
          >
            <span className="caps text-xs font-medium">{weekday}</span>
            <span className="caps text-2xl leading-tight font-semibold">{d.getDate()}</span>
            <span className="text-xs">{open ? month : 'Closed'}</span>
          </button>
        );
      })}
    </div>
  );
}
