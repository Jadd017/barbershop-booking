import { MAX_SERVICE_MINUTES, SLOT_MINUTES } from '../../../config';
import type { Service } from '../../../types';
import { inputClass, Section, smallButtonClass } from './fields';

const DURATIONS = Array.from(
  { length: MAX_SERVICE_MINUTES / SLOT_MINUTES },
  (_, i) => (i + 1) * SLOT_MINUTES,
);

interface Props {
  services: Service[];
  onChange: (services: Service[]) => void;
}

/** IDs stay fixed when a service is renamed; bookings keep their own copy of the name and length. */
function newServiceId(): string {
  return `s-${crypto.randomUUID().slice(0, 8)}`;
}

export function ServicesEditor({ services, onChange }: Props) {
  function setService(index: number, service: Service) {
    onChange(services.map((s, i) => (i === index ? service : s)));
  }

  return (
    <Section
      title="Services"
      description="Removing or changing a service doesn't affect bookings already made."
    >
      <ul className="grid gap-3">
        {services.map((service, i) => (
          <li key={service.id} className="rounded-2xl border border-neutral-200 bg-white p-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Name</span>
              <input
                type="text"
                value={service.name}
                maxLength={40}
                onChange={(e) => setService(i, { ...service, name: e.target.value })}
                className={`${inputClass} w-full`}
              />
            </label>
            <div className="mt-3 flex items-end gap-2">
              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-sm font-medium">Length</span>
                <select
                  value={service.durationMinutes}
                  onChange={(e) =>
                    setService(i, { ...service, durationMinutes: Number(e.target.value) })
                  }
                  className={`${inputClass} w-full`}
                >
                  {DURATIONS.map((d) => (
                    <option key={d} value={d}>
                      {d} min
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => onChange(services.filter((_, j) => j !== i))}
                className="rounded-xl border border-red-300 bg-white px-4 py-3 text-sm font-semibold text-red-700"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() =>
          onChange([...services, { id: newServiceId(), name: '', durationMinutes: 30 }])
        }
        className={`${smallButtonClass} mt-3 w-full`}
      >
        + Add service
      </button>
    </Section>
  );
}
