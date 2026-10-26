import { useEffect, useState } from 'react';
import { subscribeUpcomingBookings } from '../../../data/bookings';
import { isPermissionDenied } from '../../../data/errors';
import { store } from '../../../data/firebase';
import { saveMySchedule } from '../../../data/shop';
import { hoursOutsideShop, trimToShopHours } from '../../../lib/barberSchedule';
import { weeklyHoursErrors } from '../../../lib/schedule';
import { bookingsOutsideHours } from '../../../lib/staffDay';
import { toDateKey } from '../../../lib/time';
import type { Barber, ShopSettings, ShopStaffBooking } from '../../../types';
import { linkButton, Notice } from '../../ui';
import { BookingCard } from '../BookingCard';
import { DaysOffEditor } from './DaysOffEditor';
import { HoursEditor } from './HoursEditor';
import { SaveBar } from './SaveBar';

/** The part of a barber doc his schedule is. */
type Schedule = Pick<Barber, 'weeklyHours' | 'daysOff'>;

interface Props {
  shop: ShopSettings;
  barber: Barber;
  /** The signed-in barber's own schedule ("your hours") rather than one the owner edits. */
  self: boolean;
}

/**
 * A barber's weekly hours and breaks and days off, edited as a draft and saved together (by him,
 * or by the owner for any barber). The rules accept only hours within the shop's opening hours.
 *
 * Bookings the changes would leave outside his hours are listed so they can be cancelled (or, by
 * the owner, moved); saving asks first. Nothing here ever cancels a booking by itself.
 */
export function ScheduleEditor({ shop, barber, self }: Props) {
  const [today] = useState(() => toDateKey(new Date()));
  // Null while nothing is edited, so changes saved elsewhere show up live.
  const [draft, setDraft] = useState<Schedule | null>(null);
  const [upcoming, setUpcoming] = useState<ShopStaffBooking[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const whose = self ? 'your' : `${barber.name}'s`;

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
          ? "Couldn't save: the shop's hours may have just changed. Check the hours against them and try again."
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
    <>
      {conflicts.length > 0 && (
        <div className="mb-8 rounded-2xl border border-brass/50 bg-brass/10 p-4">
          <h2 className="caps font-semibold">
            {conflicts.length === 1
              ? `1 booking is outside ${whose} hours`
              : `${conflicts.length} bookings are outside ${whose} hours`}
            {draft ? ' (with the changes)' : ''}
          </h2>
          <p className="mb-3 text-sm">
            On a day off or a day the shop is closed, outside the hours or in a break. They stay
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
          <p className="font-semibold">{self ? 'Your' : `${barber.name}'s`} hours go outside the shop's opening hours:</p>
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
            Fit {self ? 'my' : 'his'} hours to the shop's
          </button>
        </Notice>
      )}

      <HoursEditor
        title={self ? 'My hours' : 'Hours'}
        weeklyHours={current.weeklyHours}
        shopHours={shop.openingHours}
        onChange={(weeklyHours) => edit({ weeklyHours })}
      />
      <DaysOffEditor
        today={today}
        daysOff={current.daysOff}
        onChange={(daysOff) => edit({ daysOff })}
        title={self ? 'My days off' : 'Days off'}
        description={`Customers can't book ${self ? 'you' : barber.name} on these days (vacation, personal days).`}
        closedAnyway={shop.closedDays}
      />

      {draft && (
        <SaveBar
          errors={errors}
          confirm={
            confirming
              ? `${newConflicts.length === 1 ? '1 booking falls' : `${newConflicts.length} bookings fall`} outside the new hours (listed at the top). They won't be cancelled. Save anyway?`
              : null
          }
          saveError={saveError}
          saving={saving}
          onSave={save}
          onDiscard={discard}
        />
      )}
    </>
  );
}
