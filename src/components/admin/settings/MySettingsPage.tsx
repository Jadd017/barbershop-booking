import { useEffect, useState } from 'react';
import { subscribeUpcomingBookings } from '../../../data/bookings';
import { isPermissionDenied } from '../../../data/errors';
import { store } from '../../../data/firebase';
import { saveMySchedule } from '../../../data/shop';
import { hoursOutsideShop, trimToShopHours } from '../../../lib/barberSchedule';
import { weeklyHoursErrors } from '../../../lib/schedule';
import { bookingsOutsideHours } from '../../../lib/staffDay';
import { toDateKey } from '../../../lib/time';
import type { Barber, ShopStaffBooking } from '../../../types';
import { buttonDark, buttonOutline, linkButton, Notice } from '../../ui';
import { AdminHeader } from '../AdminHeader';
import { AdminNav } from '../AdminNav';
import { BookingCard } from '../BookingCard';
import type { StaffSession } from '../session';
import { BlockedTimes } from './BlockedTimes';
import { DaysOffEditor } from './DaysOffEditor';
import { HoursEditor } from './HoursEditor';
import { PasswordEditor } from './PasswordEditor';

/** The part of his barber doc a barber edits himself. */
type Schedule = Pick<Barber, 'weeklyHours' | 'daysOff'>;

/**
 * The signed-in barber's own settings: weekly hours and breaks and days off (a draft, saved
 * together), blocked times (saved straight away) and his password. The rules let a barber change
 * only these fields of his own barber doc, and only within the shop's opening hours.
 *
 * Bookings his changes would leave outside his hours are listed so he can cancel them; saving
 * asks first. Nothing here ever cancels a booking by itself.
 */
export function MySettingsPage({ session }: { session: StaffSession }) {
  const { shop, barber, user, staff } = session;
  const [today] = useState(() => toDateKey(new Date()));
  // Null while nothing is edited, so changes saved elsewhere (by the owner) show up live.
  const [draft, setDraft] = useState<Schedule | null>(null);
  const [upcoming, setUpcoming] = useState<ShopStaffBooking[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(
    () => subscribeUpcomingBookings(store, barber.id, today, setUpcoming, (err) => console.error(err)),
    [barber.id, today],
  );

  const current: Schedule = draft ?? { weeklyHours: barber.weeklyHours, daysOff: barber.daysOff };
  const outsideShop = hoursOutsideShop(current.weeklyHours, shop.openingHours);
  const errors = draft ? [...weeklyHoursErrors(draft.weeklyHours), ...outsideShop] : [];
  const conflicts = bookingsOutsideHours(shop, { ...barber, ...current }, upcoming);
  // Bookings that only clash because of the unsaved changes.
  const newConflicts = draft
    ? conflicts.filter((b) => !bookingsOutsideHours(shop, barber, [b]).length)
    : [];

  function edit(change: Partial<Schedule>) {
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
      // Past days off are no longer needed.
      await saveMySchedule(
        store,
        barber.id,
        draft.weeklyHours,
        draft.daysOff.filter((d) => d >= today),
      );
      setDraft(null);
      setConfirming(false);
    } catch (err) {
      console.error(err);
      setSaveError(
        isPermissionDenied(err)
          ? "Couldn't save: the shop's hours may have just changed. Check your hours against them and try again."
          : "Couldn't save. Check your connection and try again.",
      );
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
      <AdminHeader session={session} title="Settings" />

      <main className="mx-auto max-w-xl px-4 pt-6">
        {conflicts.length > 0 && (
          <div className="mb-8 rounded-2xl border border-brass/50 bg-brass/10 p-4">
            <h2 className="caps font-semibold">
              {conflicts.length === 1
                ? '1 booking is outside your hours'
                : `${conflicts.length} bookings are outside your hours`}
              {draft ? ' (with your changes)' : ''}
            </h2>
            <p className="mb-3 text-sm">
              On a day off or a day the shop is closed, outside your hours or in a break. They stay
              booked: cancel them here if needed and let the customer know.
            </p>
            <ul className="grid gap-3">
              {conflicts.map((b) => (
                <BookingCard key={b.id} booking={b} showDate cancelOnly />
              ))}
            </ul>
          </div>
        )}

        {outsideShop.length > 0 && (
          <Notice tone="warning" className="mb-6">
            <p className="font-semibold">Your hours go outside the shop's opening hours:</p>
            <ul className="mb-1 list-disc pl-5">
              {outsideShop.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => edit({ weeklyHours: trimToShopHours(current.weeklyHours, shop.openingHours) })}
              className={`${linkButton} text-ink underline`}
            >
              Fit my hours to the shop's
            </button>
          </Notice>
        )}

        <HoursEditor
          title="My hours"
          weeklyHours={current.weeklyHours}
          shopHours={shop.openingHours}
          onChange={(weeklyHours) => edit({ weeklyHours })}
        />
        <DaysOffEditor
          today={today}
          daysOff={current.daysOff}
          onChange={(daysOff) => edit({ daysOff })}
          title="My days off"
          description="Customers can't book you on these days (vacation, personal days)."
          closedAnyway={shop.closedDays}
        />
        <BlockedTimes today={today} shop={shop} barber={barber} />
        <PasswordEditor user={user} username={staff.username} />
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
                outside your new hours (listed at the top). They won't be cancelled. Save anyway?
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
