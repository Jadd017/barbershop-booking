import { useTranslation } from 'react-i18next';
import { MAX_ADDRESS_LENGTH, MAX_MAPS_URL_LENGTH } from '../../../config';
import { inputBase } from '../../ui';
import { cardClass, Section } from './fields';

interface Props {
  shopAddress: string;
  mapsUrl: string;
  onChange: (change: { shopAddress?: string; mapsUrl?: string }) => void;
}

/** Where the shop is: shown on the booking page and behind "Get directions" after booking. */
export function ShopInfoEditor({ shopAddress, mapsUrl, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <Section title={t('shopInfo.title')} description={t('shopInfo.description')}>
      <div className={`${cardClass} grid gap-3`}>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            {t('shopInfo.address')} <span className="font-normal text-muted">{t('common.optional')}</span>
          </span>
          <input
            type="text"
            autoComplete="off"
            maxLength={MAX_ADDRESS_LENGTH}
            placeholder={t('shopInfo.addressPlaceholder')}
            value={shopAddress}
            onChange={(e) => onChange({ shopAddress: e.target.value })}
            className={`${inputBase} w-full`}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            {t('shopInfo.maps')} <span className="font-normal text-muted">{t('common.optional')}</span>
          </span>
          <input
            type="url"
            dir="ltr"
            inputMode="url"
            autoComplete="off"
            maxLength={MAX_MAPS_URL_LENGTH}
            placeholder="https://maps.app.goo.gl/…"
            value={mapsUrl}
            onChange={(e) => onChange({ mapsUrl: e.target.value })}
            className={`${inputBase} w-full`}
          />
          <span className="mt-1 block text-sm text-muted">
            {t('shopInfo.mapsHelp')}
          </span>
        </label>
      </div>
    </Section>
  );
}
