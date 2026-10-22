import { SLOT_MINUTES } from '../config';
import type { DateKey, Settings, StartTimeOption, TimeString } from '../types';
import { fitsHours, hoursOn } from './schedule';
import { minutesToTime, timeToMinutes, toDateKey } from './time';

/** Every grid slot a service of `durationMinutes` starting at `start` occupies. */
export function slotsNeeded(start: TimeString, durationMinutes: number): TimeString[] {
  const first = timeToMinutes(start);
  const slots: TimeString[] = [];
  for (let t = first; t < first + durationMinutes; t += SLOT_MINUTES) {
    slots.push(minutesToTime(t));
  }
  return slots;
}

/** True if `start` on `date` is at or before the current time. */
export function isPast(date: DateKey, start: TimeString, now: Date = new Date()): boolean {
  const today = toDateKey(now);
  if (date !== today) return date < today;
  return timeToMinutes(start) <= now.getHours() * 60 + now.getMinutes();
}

/**
 * Lists every start time on the slot grid during that day's hours (breaks excluded)
 * and marks whether a service of `durationMinutes` can start there.
 * Empty when the shop is closed on `date`.
 *
 * A start time is available only if every slot the service needs is
 * within working hours, outside the breaks, not taken (booked or blocked), and not in the past.
 */
export function getStartTimes(
  date: DateKey,
  durationMinutes: number,
  settings: Settings,
  takenSlots: ReadonlySet<TimeString>,
  now: Date = new Date(),
): StartTimeOption[] {
  const hours = hoursOn(settings, date);
  if (!hours) return [];
  const open = timeToMinutes(hours.start);
  const close = timeToMinutes(hours.end);

  const options: StartTimeOption[] = [];
  for (let start = open; start < close; start += SLOT_MINUTES) {
    // The shop is closed during breaks, so don't list those times at all.
    const inBreak = hours.breaks.some(
      (b) => start >= timeToMinutes(b.start) && start < timeToMinutes(b.end),
    );
    if (inBreak) continue;

    const time = minutesToTime(start);
    const available =
      fitsHours(settings, date, time, durationMinutes) &&
      !slotsNeeded(time, durationMinutes).some((slot) => takenSlots.has(slot)) &&
      !isPast(date, time, now);

    options.push({ time, available });
  }
  return options;
}
