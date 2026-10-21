import { SLOT_MINUTES } from '../config';
import type { Booking, DateKey, Settings, StartTimeOption } from '../types';
import { minutesToTime, timeToMinutes, toDateKey } from './time';

/** True if [aStart, aEnd) and [bStart, bEnd) overlap. */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Lists every start time on the slot grid during working hours (break excluded)
 * and marks whether a service of `durationMinutes` can start there.
 *
 * A start time is available only if every slot the service needs is
 * within working hours, outside the break, not booked, and not in the past.
 */
export function getStartTimes(
  date: DateKey,
  durationMinutes: number,
  settings: Settings,
  bookings: Booking[],
  now: Date = new Date(),
): StartTimeOption[] {
  const open = timeToMinutes(settings.workingHours.start);
  const close = timeToMinutes(settings.workingHours.end);
  const breakStart = timeToMinutes(settings.breakTime.start);
  const breakEnd = timeToMinutes(settings.breakTime.end);

  const booked = bookings.map((b) => {
    const start = timeToMinutes(b.start);
    return { start, end: start + b.durationMinutes };
  });

  const isToday = date === toDateKey(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const options: StartTimeOption[] = [];
  for (let start = open; start < close; start += SLOT_MINUTES) {
    // The shop is closed during the break, so don't list those times at all.
    if (start >= breakStart && start < breakEnd) continue;

    const end = start + durationMinutes;
    const available =
      end <= close &&
      !overlaps(start, end, breakStart, breakEnd) &&
      !booked.some((b) => overlaps(start, end, b.start, b.end)) &&
      !(isToday && start <= nowMinutes);

    options.push({ time: minutesToTime(start), available });
  }
  return options;
}
