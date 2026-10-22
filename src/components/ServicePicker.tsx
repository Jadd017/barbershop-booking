import { Brush, Clock, Scissors, Sparkles, type LucideIcon } from 'lucide-react';
import { formatPrice } from '../lib/shop';
import type { Service } from '../types';

interface Props {
  services: Service[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** An icon that fits the service's name; services Eddy adds get the scissors. */
function serviceIcon(name: string): LucideIcon {
  const n = name.toLowerCase();
  const beard = n.includes('beard') || n.includes('shave');
  if (beard && (n.includes('hair') || n.includes('cut'))) return Sparkles;
  if (beard) return Brush;
  return Scissors;
}

export function ServicePicker({ services, selectedId, onSelect }: Props) {
  return (
    <div className="grid gap-2">
      {services.map((service) => {
        const selected = service.id === selectedId;
        const Icon = serviceIcon(service.name);
        return (
          <button
            key={service.id}
            type="button"
            onClick={() => onSelect(service.id)}
            aria-pressed={selected}
            className={`flex min-h-16 items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
              selected
                ? 'border-charcoal bg-charcoal text-cream shadow-md'
                : 'border-line bg-card text-ink hover:border-muted'
            }`}
          >
            <span
              aria-hidden
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                selected ? 'bg-brass text-charcoal' : 'bg-cream text-ink'
              }`}
            >
              <Icon size={20} strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{service.name}</span>
              <span
                className={`flex items-center gap-1 text-sm ${selected ? 'text-line' : 'text-muted'}`}
              >
                <Clock aria-hidden size={14} />
                {service.durationMinutes} min
              </span>
            </span>
            {service.price !== undefined && (
              <span
                className={`caps shrink-0 text-lg font-semibold ${
                  selected ? 'text-brass-light' : 'text-ink'
                }`}
              >
                {formatPrice(service.price)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
