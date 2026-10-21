import type { StartTimeOption, TimeString } from '../types';

interface Props {
  options: StartTimeOption[];
  selected: TimeString | null;
  onSelect: (time: TimeString) => void;
}

export function TimeGrid({ options, selected, onSelect }: Props) {
  if (!options.some((o) => o.available)) {
    return <p className="text-sm text-neutral-500">No free times left on this day.</p>;
  }

  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
      {options.map(({ time, available }) => {
        const isSelected = time === selected;
        return (
          <button
            key={time}
            type="button"
            disabled={!available}
            onClick={() => onSelect(time)}
            aria-pressed={isSelected}
            className={`rounded-lg border py-2 text-sm font-medium tabular-nums transition ${
              !available
                ? 'cursor-not-allowed border-neutral-100 bg-neutral-100 text-neutral-300 line-through'
                : isSelected
                  ? 'border-neutral-900 bg-neutral-900 text-white'
                  : 'border-neutral-200 bg-white hover:border-neutral-400'
            }`}
          >
            {time}
          </button>
        );
      })}
    </div>
  );
}
