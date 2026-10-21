import { SLOT_MINUTES } from '../config';
import type { DateKey, Settings, StartTimeOption, TimeString } from '../types';
import { minutesToTime, timeToMinutes, toDateKey } from './time';

/** True if [aStart, aEnd) and [bStart, bEnd) overlap. */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

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
 * Lists every start time on the slot grid during working hours (break excluded)
 * and marks whether a service of `durationMinutes` can start there.
 *
 * A start time is available only if every slot the service needs is
 * within working hours, outside the break, not taken, and not in the past.
 */
export function getStartTimes(
  date: DateKey,
  durationMinutes: number,
  settings: Settings,
  takenSlots: ReadonlySet<TimeString>,
  now: Date = new Date(),
): StartTimeOption[] {
  const open = timeToMinutes(settings.workingHours.start);
  const close = timeToMinutes(settings.workingHours.end);
  const breakStart = timeToMinutes(settings.breakTime.start);
  const breakEnd = timeToMinutes(settings.breakTime.end);

  const options: StartTimeOption[] = [];
  for (let start = open; start < close; start += SLOT_MINUTES) {
    // The shop is closed during the break, so don't list those times at all.
    if (start >= breakStart && start < breakEnd) continue;

    const time = minutesToTime(start);
    const end = start + durationMinutes;
    const available =
      end <= close &&
      !overlaps(start, end, breakStart, breakEnd) &&
      !slotsNeeded(time, durationMinutes).some((slot) => takenSlots.has(slot)) &&
      !isPast(date, time, now);

    options.push({ time, available });
  }
  return options;
}
