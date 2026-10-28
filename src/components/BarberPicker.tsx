import { Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { initials } from '../lib/initials';
import type { Barber } from '../types';

interface Props {
  /** The active barbers, in display order. */
  barbers: Barber[];
  /** A barber's ID, null for "Any barber", undefined before choosing. */
  selected: string | null | undefined;
  onSelect: (barberId: string | null) => void;
}

/** "Any barber" first, then a card per barber with his initials and name. */
export function BarberPicker({ barbers, selected, onSelect }: Props) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 gap-2">
      <BarberCard
        selected={selected === null}
        onSelect={() => onSelect(null)}
        badge={<Users aria-hidden size={20} strokeWidth={1.75} />}
        name={t('booking.anyBarber')}
        detail={t('booking.anyBarberDetail')}
      />
      {barbers.map((barber) => (
        <BarberCard
          key={barber.id}
          selected={selected === barber.id}
          onSelect={() => onSelect(barber.id)}
          badge={<span className="caps text-base font-semibold">{initials(barber.name)}</span>}
          name={barber.name}
        />
      ))}
    </div>
  );
}

interface CardProps {
  selected: boolean;
  onSelect: () => void;
  badge: ReactNode;
  name: string;
  detail?: string;
}

function BarberCard({ selected, onSelect, badge, name, detail }: CardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex min-h-16 items-center gap-3 rounded-2xl border px-3 py-3 text-start transition ${
        selected
          ? 'border-charcoal bg-charcoal text-cream shadow-md'
          : 'border-line bg-card text-ink hover:border-muted'
      }`}
    >
      <span
        aria-hidden
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
          selected ? 'bg-brass text-charcoal' : 'bg-cream text-ink'
        }`}
      >
        {badge}
      </span>
      <span className="min-w-0">
        <span className="block break-words font-semibold leading-tight">{name}</span>
        {detail && (
          <span className={`block text-sm ${selected ? 'text-line' : 'text-muted-strong'}`}>{detail}</span>
        )}
      </span>
    </button>
  );
}
