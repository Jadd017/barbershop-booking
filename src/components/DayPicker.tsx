import { formatDayShort } from '../lib/time';
import type { DateKey } from '../types';

interface Props {
  days: DateKey[];
  selected: DateKey;
  onSelect: (day: DateKey) => void;
}

export function DayPicker({ days, selected, onSelect }: Props) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {days.map((day, i) => {
        const { weekday, day: date } = formatDayShort(day);
        const isSelected = day === selected;
        return (
          <button
            key={day}
            type="button"
            onClick={() => onSelect(day)}
            aria-pressed={isSelected}
            className={`flex min-w-20 flex-1 flex-col items-center rounded-xl border px-3 py-2 transition ${
              isSelected
                ? 'border-neutral-900 bg-neutral-900 text-white'
                : 'border-neutral-200 bg-white hover:border-neutral-400'
            }`}
          >
            <span className="text-xs uppercase tracking-wide opacity-70">
              {i === 0 ? 'Today' : weekday}
            </span>
            <span className="font-semibold">{date}</span>
          </button>
        );
      })}
    </div>
  );
}
