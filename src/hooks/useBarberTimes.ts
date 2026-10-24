import { useEffect, useMemo, useState } from 'react';
import { store } from '../data/firebase';
import { subscribeDay, subscribeDaysOn } from '../data/days';
import { anyBarberStartTimes, barberStartTimes } from '../lib/barberSlots';
import type { AnyStartTimeOption, Barber, BarberDay, DateKey, Service, ShopSettings } from '../types';

/** How often "now" is refreshed, so today's times grey out as they pass. */
const CLOCK_TICK_MS = 30_000;

/**
 * Live start-time availability for `service` on `day`, with the barber `barberId`, or with
 * "Any barber" (null): listens to that barber's day, or to every barber's day, in real time and
 * re-checks past times as the clock moves. Each option says which barbers are free then.
 * `startTimes` is null while loading, and when no service or barber choice is made yet
 * (`barberId` undefined).
 */
export function useBarberTimes(
  day: DateKey,
  service: Service | null,
  shop: ShopSettings | null,
  barbers: Barber[],
  barberId: string | null | undefined,
): { startTimes: AnyStartTimeOption[] | null; error: boolean } {
  // Tagged with the day and barber choice they belong to, so stale data is never shown.
  const [days, setDays] = useState<{ key: string; days: Map<string, BarberDay> } | null>(null);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const key = `${day}|${barberId}`;

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (barberId === undefined) return;
    const onError = (err: Error) => {
      console.error(err);
      setError(true);
    };
    const onDays = (value: Map<string, BarberDay>) => {
      setDays({ key: `${day}|${barberId}`, days: value });
      setError(false);
    };
    return barberId === null
      ? subscribeDaysOn(store, day, onDays, onError)
      : subscribeDay(store, barberId, day, (d) => onDays(new Map([[barberId, d]])), onError);
  }, [day, barberId]);

  const current = days?.key === key ? days.days : null;

  const startTimes = useMemo(() => {
    if (!shop || !service || barberId === undefined || !current) return null;
    if (barberId === null) {
      return anyBarberStartTimes(day, service.durationMinutes, shop, barbers, current, now);
    }
    const barber = barbers.find((b) => b.id === barberId);
    if (!barber) return null;
    return barberStartTimes(day, service.durationMinutes, shop, barber, current.get(barberId), now).map(
      (o) => ({ ...o, freeBarberIds: o.available ? [barberId] : [] }),
    );
  }, [shop, service, barbers, barberId, day, current, now]);

  return { startTimes, error };
}
