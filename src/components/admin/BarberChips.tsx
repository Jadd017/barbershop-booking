import { initials } from '../../lib/initials';
import type { Barber } from '../../types';

interface Props {
  barbers: Barber[];
  selected: string;
  onSelect: (barberId: string) => void;
}

/** The owner picks one barber: a wrapping row of initials + first name pills. */
export function BarberChips({ barbers, selected, onSelect }: Props) {
  return (
    <div role="group" aria-label="Barber" className="flex flex-wrap gap-2">
      {barbers.map((b) => {
        const current = b.id === selected;
        return (
          <button
            key={b.id}
            type="button"
            aria-pressed={current}
            onClick={() => onSelect(b.id)}
            className={`flex min-h-11 items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm font-semibold ${
              current ? 'border-charcoal bg-charcoal text-cream' : 'border-line bg-card text-ink hover:border-muted'
            }`}
          >
            <span
              aria-hidden
              className={`caps flex h-8 w-8 items-center justify-center rounded-full text-xs ${
                current ? 'bg-brass text-charcoal' : 'bg-cream'
              }`}
            >
              {initials(b.name)}
            </span>
            {b.name}
          </button>
        );
      })}
    </div>
  );
}
