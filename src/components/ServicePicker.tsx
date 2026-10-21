import type { Service } from '../types';

interface Props {
  services: Service[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ServicePicker({ services, selectedId, onSelect }: Props) {
  return (
    <div className="grid gap-2">
      {services.map((service) => {
        const selected = service.id === selectedId;
        return (
          <button
            key={service.id}
            type="button"
            onClick={() => onSelect(service.id)}
            aria-pressed={selected}
            className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
              selected
                ? 'border-neutral-900 bg-neutral-900 text-white'
                : 'border-neutral-200 bg-white hover:border-neutral-400'
            }`}
          >
            <span className="font-medium">{service.name}</span>
            <span className={selected ? 'text-neutral-300' : 'text-neutral-500'}>
              {service.durationMinutes} min
            </span>
          </button>
        );
      })}
    </div>
  );
}
