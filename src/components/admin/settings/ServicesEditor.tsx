import { useTranslation } from 'react-i18next';
import { MAX_PRICE, MAX_SERVICE_MINUTES, SLOT_MINUTES } from '../../../config';
import type { Service } from '../../../types';
import { buttonDangerOutline, inputBase } from '../../ui';
import { cardClass, Section, smallButtonClass } from './fields';

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
  const { t } = useTranslation();
  function setService(index: number, service: Service) {
    onChange(services.map((s, i) => (i === index ? service : s)));
  }

  /** An empty field removes the price; anything else is checked by settingsErrors. */
  function setPrice(index: number, value: string) {
    const { price: _old, ...rest } = services[index];
    setService(index, value === '' ? rest : { ...rest, price: Number(value) });
  }

  return (
    <Section
      title={t('services.title')}
      description={t('services.description')}
    >
      <ul className="grid gap-3">
        {services.map((service, i) => (
          <li key={service.id} className={cardClass}>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">{t('services.nameEn')}</span>
              <input
                type="text"
                lang="en"
                dir="ltr"
                value={service.name}
                maxLength={40}
                onChange={(e) => setService(i, { ...service, name: e.target.value })}
                className={`${inputBase} w-full`}
              />
            </label>
            <label className="mt-3 block">
              <span className="mb-1 block text-sm font-medium">
                {t('services.nameAr')} <span className="font-normal text-muted">{t('common.optional')}</span>
              </span>
              <input
                type="text"
                lang="ar"
                dir="rtl"
                value={service.nameAr ?? ''}
                maxLength={40}
                onChange={(e) => {
                  const { nameAr: _old, ...rest } = service;
                  setService(i, e.target.value ? { ...rest, nameAr: e.target.value } : rest);
                }}
                className={`${inputBase} w-full`}
              />
            </label>
            <div className="mt-3 flex items-end gap-2">
              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-sm font-medium">{t('services.length')}</span>
                <select
                  value={service.durationMinutes}
                  onChange={(e) =>
                    setService(i, { ...service, durationMinutes: Number(e.target.value) })
                  }
                  className={`${inputBase} w-full`}
                >
                  {DURATIONS.map((d) => (
                    <option key={d} value={d}>
                      {t('common.minutes', { minutes: d })}
                    </option>
                  ))}
                </select>
              </label>
              <label className="w-28 shrink-0">
                <span className="mb-1 block text-sm font-medium">
                  {t('services.price')} <span className="font-normal text-muted">($)</span>
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={MAX_PRICE}
                  step={0.5}
                  placeholder={t('services.none')}
                  value={service.price === undefined || Number.isNaN(service.price) ? '' : service.price}
                  onChange={(e) => setPrice(i, e.target.value)}
                  className={`${inputBase} w-full tabular-nums`}
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() => onChange(services.filter((_, j) => j !== i))}
              className={`${buttonDangerOutline} mt-3 w-full text-sm`}
            >
              {t('services.remove', { name: service.name.trim() || t('services.service') })}
            </button>
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
        {t('services.add')}
      </button>
    </Section>
  );
}
