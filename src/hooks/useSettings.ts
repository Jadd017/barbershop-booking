import { useEffect, useState } from 'react';
import { subscribeSettings } from '../data/api';
import type { Settings } from '../types';

/**
 * The shop's settings, live. `settings` is undefined while loading and null while
 * settings/shop doesn't exist yet.
 */
export function useSettings(): { settings: Settings | null | undefined; error: boolean } {
  const [settings, setSettings] = useState<Settings | null | undefined>(undefined);
  const [error, setError] = useState(false);

  useEffect(
    () =>
      subscribeSettings(
        (value) => {
          setSettings(value);
          setError(false);
        },
        (err) => {
          console.error(err);
          setError(true);
        },
      ),
    [],
  );

  return { settings, error };
}
