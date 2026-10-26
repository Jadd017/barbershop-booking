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
  return (
    <Section title="Address" description="Customers see the address, and get directions after booking.">
      <div className={`${cardClass} grid gap-3`}>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            Address <span className="font-normal text-muted">(optional)</span>
          </span>
          <input
            type="text"
            autoComplete="off"
            maxLength={MAX_ADDRESS_LENGTH}
            placeholder="Street, area, city"
            value={shopAddress}
            onChange={(e) => onChange({ shopAddress: e.target.value })}
            className={`${inputBase} w-full`}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            Google Maps link <span className="font-normal text-muted">(optional)</span>
          </span>
          <input
            type="url"
            inputMode="url"
            autoComplete="off"
            maxLength={MAX_MAPS_URL_LENGTH}
            placeholder="https://maps.app.goo.gl/…"
            value={mapsUrl}
            onChange={(e) => onChange({ mapsUrl: e.target.value })}
            className={`${inputBase} w-full`}
          />
          <span className="mt-1 block text-sm text-muted">
            In Google Maps, open the shop, tap Share, then Copy link.
          </span>
        </label>
      </div>
    </Section>
  );
}
