import { useEffect, useMemo, useState } from 'react';
import { subscribeTakenSlots } from '../data/api';
import { getStartTimes } from '../lib/slots';
import type { DateKey, Service, Settings, StartTimeOption, TimeString } from '../types';

/** How often "now" is refreshed, so today's times grey out as they pass. */
const CLOCK_TICK_MS = 30_000;

/**
 * Live start-time availability for `service` on `day`: listens to the day's
 * taken slots in real time and re-checks past times as the clock moves.
 * `startTimes` is null while loading or when no service is chosen.
 */
export function useStartTimes(
  day: DateKey,
  service: Service | null,
  settings: Settings | null,
): { startTimes: StartTimeOption[] | null; error: boolean } {
  // Taken slots are tagged with the day they belong to, so stale data is never shown.
  const [taken, setTaken] = useState<{ day: DateKey; slots: Set<TimeString> } | null>(null);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    return subscribeTakenSlots(
      day,
      (slots) => {
        setTaken({ day, slots });
        setError(false);
      },
      (err) => {
        console.error(err);
        setError(true);
      },
    );
  }, [day]);

  const takenSlots = taken?.day === day ? taken.slots : null;

  const startTimes = useMemo(() => {
    if (!settings || !service || !takenSlots) return null;
    return getStartTimes(day, service.durationMinutes, settings, takenSlots, now);
  }, [settings, service, day, takenSlots, now]);

  return { startTimes, error };
}
