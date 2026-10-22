import { Moon, Sun, Sunrise, type LucideIcon } from 'lucide-react';
import { timeToMinutes } from '../lib/time';
import type { StartTimeOption, TimeString } from '../types';

interface Props {
  options: StartTimeOption[];
  selected: TimeString | null;
  onSelect: (time: TimeString) => void;
}

/** Morning before 12:00, afternoon until 17:00, evening after. */
const GROUPS: { label: string; Icon: LucideIcon; until: number }[] = [
  { label: 'Morning', Icon: Sunrise, until: 12 * 60 },
  { label: 'Afternoon', Icon: Sun, until: 17 * 60 },
  { label: 'Evening', Icon: Moon, until: 24 * 60 },
];

export function TimeGrid({ options, selected, onSelect }: Props) {
  if (!options.some((o) => o.available)) {
    return (
      <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted-strong">
        No free times left on this day.
      </p>
    );
  }

  const groups = GROUPS.map(({ label, Icon, until }, i) => {
    const from = i === 0 ? 0 : GROUPS[i - 1].until;
    const items = options.filter((o) => {
      const m = timeToMinutes(o.time);
      return m >= from && m < until;
    });
    return { label, Icon, items };
  }).filter((g) => g.items.length > 0);

  return (
    <div className="grid gap-5">
      {groups.map(({ label, Icon, items }) => (
        <div key={label}>
          <h3 className="caps mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-strong">
            <Icon aria-hidden size={14} />
            {label}
          </h3>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {items.map(({ time, available }) => {
              const isSelected = time === selected;
              return (
                <button
                  key={time}
                  type="button"
                  disabled={!available}
                  onClick={() => onSelect(time)}
                  aria-pressed={isSelected}
                  aria-label={available ? time : `${time}, not available`}
                  className={`min-h-11 rounded-xl border text-sm font-semibold tabular-nums transition ${
                    !available
                      ? 'cursor-not-allowed border-dashed border-line bg-transparent text-muted opacity-60'
                      : isSelected
                        ? 'border-charcoal bg-charcoal text-cream shadow-md'
                        : 'border-line bg-card text-ink hover:border-muted'
                  }`}
                >
                  {time}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {options.some((o) => !o.available) && (
        <p className="text-sm text-muted-strong">
          Faded times don't have enough free time for this service.
        </p>
      )}
    </div>
  );
}
