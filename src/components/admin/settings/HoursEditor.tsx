import { MAX_BREAKS_PER_DAY } from '../../../config';
import { WEEKDAY_NAMES } from '../../../lib/schedule';
import { minutesToTime, timeToMinutes } from '../../../lib/time';
import type { DayHours, OpeningHours } from '../../../types';
import { cardClass, Section, TimeSelect } from './fields';

interface Props {
  weeklyHours: DayHours[];
  onChange: (weeklyHours: DayHours[]) => void;
  title?: string;
  /**
   * The shop's opening hours, for a barber's own hours: each day shows them, times are offered
   * only within them, and a day the shop is closed can't be switched on.
   */
  shopHours?: OpeningHours[];
  /** False for the shop's opening hours: breaks are each barber's. */
  breaks?: boolean;
}

/** A first break in the middle of the day, or right after the previous one. */
function newBreak(day: DayHours) {
  const last = day.breaks[day.breaks.length - 1];
  const middle = Math.floor((timeToMinutes(day.start) + timeToMinutes(day.end)) / 2 / 60) * 60;
  const start = last ? timeToMinutes(last.end) + 60 : middle;
  return { start: minutesToTime(start), end: minutesToTime(start + 30) };
}

export function HoursEditor({ weeklyHours, onChange, title = 'Opening hours', shopHours, breaks = true }: Props) {
  // A barber's own days are "Working" or not; the shop's "Open" or "Closed".
  const own = shopHours !== undefined;

  function setDay(index: number, day: DayHours) {
    onChange(weeklyHours.map((d, i) => (i === index ? day : d)));
  }

  function copyToAll(day: DayHours) {
    // Days the shop is closed stay as they are.
    onChange(weeklyHours.map((d, i) => (shopHours?.[i]?.closed ? d : structuredClone(day))));
  }

  return (
    <Section
      title={title}
      description={
        breaks
          ? `Up to ${MAX_BREAKS_PER_DAY} breaks per day.${own ? " Hours must be within the shop's opening hours." : ''}`
          : "When the shop is open. Each barber's own hours and breaks fit inside these."
      }
    >
      <ul className="grid gap-3">
        {weeklyHours.map((day, i) => {
          const shop = shopHours?.[i];
          const shopClosed = shop?.closed === true;
          const limits = shop && !shopClosed ? { min: shop.start, max: shop.end } : {};
          // A day the shop is closed can still be switched off, never on.
          const locked = shopClosed && day.closed;
          return (
            <li key={WEEKDAY_NAMES[i]} className={cardClass}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{WEEKDAY_NAMES[i]}</p>
                  {shop && (
                    <p className="text-xs text-muted-strong tabular-nums">
                      {shopClosed ? 'Shop closed' : `Shop open ${shop.start}–${shop.end}`}
                    </p>
                  )}
                </div>
                <label className={`flex items-center gap-2 text-sm font-medium ${locked ? 'opacity-50' : ''}`}>
                  <input
                    type="checkbox"
                    checked={!day.closed}
                    disabled={locked}
                    onChange={(e) => setDay(i, { ...day, closed: !e.target.checked })}
                    className="h-5 w-5 accent-charcoal"
                  />
                  {own ? 'Working' : 'Open'}
                </label>
              </div>

              {day.closed ? (
                <p className="mt-1 text-sm text-muted">{own ? 'Not working' : 'Closed'}</p>
              ) : (
                <>
                  <div className="mt-3 flex items-center gap-2">
                    <TimeSelect
                      label={`${WEEKDAY_NAMES[i]} ${own ? 'start' : 'opening'} time`}
                      value={day.start}
                      onChange={(start) => setDay(i, { ...day, start })}
                      {...limits}
                    />
                    <span className="text-muted">to</span>
                    <TimeSelect
                      label={`${WEEKDAY_NAMES[i]} ${own ? 'end' : 'closing'} time`}
                      value={day.end}
                      onChange={(end) => setDay(i, { ...day, end })}
                      {...limits}
                    />
                  </div>

                  {breaks && day.breaks.map((b, j) => (
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
                        {...limits}
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
                        {...limits}
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
                    {breaks && day.breaks.length < MAX_BREAKS_PER_DAY && (
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
          );
        })}
      </ul>
    </Section>
  );
}
