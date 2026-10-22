import { MAX_BREAKS_PER_DAY } from '../../../config';
import { WEEKDAY_NAMES } from '../../../lib/schedule';
import { minutesToTime, timeToMinutes } from '../../../lib/time';
import type { DayHours } from '../../../types';
import { cardClass, Section, TimeSelect } from './fields';

interface Props {
  weeklyHours: DayHours[];
  onChange: (weeklyHours: DayHours[]) => void;
}

/** A first break in the middle of the day, or right after the previous one. */
function newBreak(day: DayHours) {
  const last = day.breaks[day.breaks.length - 1];
  const middle = Math.floor((timeToMinutes(day.start) + timeToMinutes(day.end)) / 2 / 60) * 60;
  const start = last ? timeToMinutes(last.end) + 60 : middle;
  return { start: minutesToTime(start), end: minutesToTime(start + 30) };
}

export function HoursEditor({ weeklyHours, onChange }: Props) {
  function setDay(index: number, day: DayHours) {
    onChange(weeklyHours.map((d, i) => (i === index ? day : d)));
  }

  function copyToAll(day: DayHours) {
    onChange(weeklyHours.map(() => structuredClone(day)));
  }

  return (
    <Section title="Opening hours" description={`Up to ${MAX_BREAKS_PER_DAY} breaks per day.`}>
      <ul className="grid gap-3">
        {weeklyHours.map((day, i) => (
          <li key={WEEKDAY_NAMES[i]} className={cardClass}>
            <div className="flex items-center justify-between">
              <p className="font-semibold">{WEEKDAY_NAMES[i]}</p>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={!day.closed}
                  onChange={(e) => setDay(i, { ...day, closed: !e.target.checked })}
                  className="h-5 w-5 accent-charcoal"
                />
                Open
              </label>
            </div>

            {day.closed ? (
              <p className="mt-1 text-sm text-muted">Closed</p>
            ) : (
              <>
                <div className="mt-3 flex items-center gap-2">
                  <TimeSelect
                    label={`${WEEKDAY_NAMES[i]} opening time`}
                    value={day.start}
                    onChange={(start) => setDay(i, { ...day, start })}
                  />
                  <span className="text-muted">to</span>
                  <TimeSelect
                    label={`${WEEKDAY_NAMES[i]} closing time`}
                    value={day.end}
                    onChange={(end) => setDay(i, { ...day, end })}
                  />
                </div>

                {day.breaks.map((b, j) => (
                  <div key={j} className="mt-2 flex items-center gap-2">
                    <span className="w-12 shrink-0 text-sm text-muted">Break</span>
                    <TimeSelect
                      label={`${WEEKDAY_NAMES[i]} break ${j + 1} start`}
                      value={b.start}
                      onChange={(start) =>
                        setDay(i, {
                          ...day,
                          breaks: day.breaks.map((x, k) => (k === j ? { ...x, start } : x)),
                        })
                      }
                    />
                    <span className="text-muted">–</span>
                    <TimeSelect
                      label={`${WEEKDAY_NAMES[i]} break ${j + 1} end`}
                      value={b.end}
                      onChange={(end) =>
                        setDay(i, {
                          ...day,
                          breaks: day.breaks.map((x, k) => (k === j ? { ...x, end } : x)),
                        })
                      }
                    />
                    <button
                      type="button"
                      aria-label={`Remove ${WEEKDAY_NAMES[i]} break ${j + 1}`}
                      onClick={() =>
                        setDay(i, { ...day, breaks: day.breaks.filter((_, k) => k !== j) })
                      }
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-xl leading-none text-pole-red hover:bg-pole-red/5"
                    >
                      ×
                    </button>
                  </div>
                ))}

                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium">
                  {day.breaks.length < MAX_BREAKS_PER_DAY && (
                    <button
                      type="button"
                      onClick={() => setDay(i, { ...day, breaks: [...day.breaks, newBreak(day)] })}
                      className="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
                    >
                      + Add break
                    </button>
                  )}
                  <button type="button" onClick={() => copyToAll(day)} className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
                    Use these hours every day
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}
