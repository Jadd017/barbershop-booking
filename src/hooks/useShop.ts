import { useEffect, useState } from 'react';
import { store } from '../data/firebase';
import { subscribeBarbers, subscribeBranding, subscribeShop } from '../data/shop';
import type { Barber, Branding, ShopSettings } from '../types';

/**
 * The shop's settings and barbers, live. `shop` is undefined while loading and null while
 * settings/shop doesn't exist yet; `barbers` (all of them, in display order, active or not) is
 * undefined while loading.
 */
export function useShop(): {
  shop: ShopSettings | null | undefined;
  barbers: Barber[] | undefined;
  error: boolean;
} {
  const [shop, setShop] = useState<ShopSettings | null | undefined>(undefined);
  const [barbers, setBarbers] = useState<Barber[] | undefined>(undefined);
  const [error, setError] = useState(false);

  useEffect(() => {
    const onError = (err: Error) => {
      console.error(err);
      setError(true);
    };
    const stopShop = subscribeShop(store, (value) => {
      setShop(value);
      setError(false);
    }, onError);
    const stopBarbers = subscribeBarbers(store, setBarbers, onError);
    return () => {
      stopShop();
      stopBarbers();
    };
  }, []);

  return { shop, barbers, error };
}

/** The shop's logo and colors, live: undefined while loading, null before the owner sets them. */
export function useBranding(): Branding | null | undefined {
  const [branding, setBranding] = useState<Branding | null | undefined>(undefined);
  useEffect(() => subscribeBranding(store, setBranding, console.error), []);
  return branding;
}
