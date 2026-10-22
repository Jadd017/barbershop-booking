import { useEffect, useState } from 'react';
import { saveSettings, subscribeUpcomingBookings } from '../../../data/api';
import { useSettings } from '../../../hooks/useSettings';
import { fitsHours, settingsErrors } from '../../../lib/schedule';
import { isPast } from '../../../lib/slots';
import { toDateKey } from '../../../lib/time';
import type { AdminBooking, Settings } from '../../../types';
import { buttonDark, buttonOutline, PageMessage } from '../../ui';
import { AdminHeader } from '../AdminHeader';
import { AdminNav } from '../AdminNav';
import { BookingCard } from '../BookingCard';
import { BlockedTimes } from './BlockedTimes';
import { DaysOffEditor } from './DaysOffEditor';
import { HoursEditor } from './HoursEditor';
import { ServicesEditor } from './ServicesEditor';
import { ShopInfoEditor } from './ShopInfoEditor';
import { WindowEditor } from './WindowEditor';

/** True if `b` is still to come and falls on a closed day, outside the hours or in a break. */
function clashes(settings: Settings, b: AdminBooking): boolean {
  return (
    b.status === 'booked' &&
    !isPast(b.date, b.startTime) &&
    !fitsHours(settings, b.date, b.startTime, b.durationMinutes)
  );
}

/**
 * Eddy's settings. Hours, services, the shop's details, the booking window and days off are
 * edited as a draft and saved together; blocked times are saved straight away.
 *
 * Bookings that fall outside the hours or on a day off are listed so Eddy can cancel them.
 * Nothing here ever cancels or deletes a booking by itself.
 */
export function SettingsPage({ onLogout }: { onLogout: () => void }) {
  const [today] = useState(() => toDateKey(new Date()));
  const { settings: saved, error: loadError } = useSettings();
  // Null while nothing is edited, so changes saved elsewhere show up live.
  const [draft, setDraft] = useState<Settings | null>(null);
  const [upcoming, setUpcoming] = useState<AdminBooking[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(
    () => subscribeUpcomingBookings(today, setUpcoming, (err) => console.error(err)),
    [today],
  );

  if (loadError) {
    return <PageMessage error>Couldn't load settings. Check your connection and refresh.</PageMessage>;
  }
  // Null only until AdminPage has created the default settings.
  if (!saved) return <PageMessage>Loading…</PageMessage>;

  const current = draft ?? saved;
  const errors = draft ? settingsErrors(draft) : [];
  const conflicts = upcoming.filter((b) => clashes(current, b));
  // Bookings that only clash because of the unsaved changes.
  const newConflicts = draft ? conflicts.filter((b) => !clashes(saved, b)) : [];

  function edit(change: Partial<Settings>) {
    setDraft({ ...current, ...change });
    setConfirming(false);
    setSaveError(null);
  }

  async function save() {
    if (!draft || errors.length > 0) return;
    if (newConflicts.length > 0 && !confirming) {
      setConfirming(true);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      // Past days off and finished special periods are no longer needed.
      await saveSettings({
        ...draft,
        daysOff: draft.daysOff.filter((d) => d >= today),
        specialPeriods: draft.specialPeriods.filter((p) => p.end >= today),
      });
      setDraft(null);
      setConfirming(false);
    } catch (err) {
      console.error(err);
      setSaveError("Couldn't save. Check your connection and try again.");
    }
    setSaving(false);
  }

  function discard() {
    setDraft(null);
    setConfirming(false);
    setSaveError(null);
  }

  return (
    <div className="min-h-screen pb-64">
      <AdminHeader title="Settings" onLogout={onLogout} />

      <main className="mx-auto max-w-xl px-4 pt-6">
        {conflicts.length > 0 && (
          <div className="mb-8 rounded-2xl border border-brass/50 bg-brass/10 p-4">
            <h2 className="caps font-semibold">
              {conflicts.length === 1
                ? '1 booking is outside your opening hours'
                : `${conflicts.length} bookings are outside your opening hours`}
              {draft ? ' (with your changes)' : ''}
            </h2>
            <p className="mb-3 text-sm">
              On a closed day, a day off, after hours or in a break. They stay booked: cancel them
              here if needed and let the customer know.
            </p>
            <ul className="grid gap-3">
              {conflicts.map((b) => (
                <BookingCard key={b.id} booking={b} showDate cancelOnly />
              ))}
            </ul>
          </div>
        )}

        <HoursEditor weeklyHours={current.weeklyHours} onChange={(weeklyHours) => edit({ weeklyHours })} />
        <ServicesEditor services={current.services} onChange={(services) => edit({ services })} />
        <ShopInfoEditor
          shopAddress={current.shopAddress}
          mapsUrl={current.mapsUrl}
          onChange={edit}
        />
        <WindowEditor
          today={today}
          bookingWindowDays={current.bookingWindowDays}
          specialPeriods={current.specialPeriods}
          onChange={edit}
        />
        <DaysOffEditor today={today} daysOff={current.daysOff} onChange={(daysOff) => edit({ daysOff })} />
        <BlockedTimes today={today} settings={current} />
      </main>

      {draft && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 border-t border-line bg-cream/95 backdrop-blur">
          <div className="mx-auto max-w-xl px-4 py-3">
            {errors.length > 0 && (
              <ul role="alert" className="mb-3 list-disc pl-5 text-sm text-pole-red">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
            {confirming && (
              <p role="alert" className="mb-3 text-sm font-semibold">
                {newConflicts.length === 1
                  ? '1 booking falls'
                  : `${newConflicts.length} bookings fall`}{' '}
                outside the new hours (listed at the top). They won't be cancelled. Save anyway?
              </p>
            )}
            {saveError && <p className="mb-3 text-sm text-pole-red">{saveError}</p>}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={discard} disabled={saving} className={buttonOutline}>
                Discard
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || errors.length > 0}
                className={buttonDark}
              >
                {saving ? 'Saving…' : confirming ? 'Save anyway' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      <AdminNav active="settings" />
    </div>
  );
}
