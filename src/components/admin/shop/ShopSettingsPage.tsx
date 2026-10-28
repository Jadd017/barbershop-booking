import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_SHOP_NAME_LENGTH } from '../../../config';
import { subscribeUpcomingBookings } from '../../../data/bookings';
import { store } from '../../../data/firebase';
import { saveShop, trimBarbersToShop } from '../../../data/shop';
import { barbersOutsideShopHours, shopErrors } from '../../../lib/barberSchedule';
import { normalizeLebanesePhone } from '../../../lib/phone';
import { bookingsOutsideHours } from '../../../lib/staffDay';
import { toDateKey } from '../../../lib/time';
import type { ShopSettings, ShopStaffBooking } from '../../../types';
import { buttonOutline, inputBase, Notice } from '../../ui';
import { AdminHeader } from '../AdminHeader';
import { AdminNav } from '../AdminNav';
import { BookingCard } from '../BookingCard';
import type { StaffSession } from '../session';
import { DaysOffEditor } from '../settings/DaysOffEditor';
import { cardClass, Section } from '../settings/fields';
import { HoursEditor } from '../settings/HoursEditor';
import { SaveBar } from '../settings/SaveBar';
import { ServicesEditor } from '../settings/ServicesEditor';
import { SettingsTabs } from '../settings/SettingsTabs';
import { ShopInfoEditor } from '../settings/ShopInfoEditor';
import { WindowEditor } from '../settings/WindowEditor';
import { BrandingEditor } from './BrandingEditor';

/**
 * The owner's shop settings (settings/shop): name, WhatsApp number, opening hours, services and
 * prices, address and Maps link, booking window and special periods, and closed days, edited as
 * a draft and saved together. The logo and colors are saved on their own (BrandingEditor).
 *
 * Nothing here cancels bookings or changes barbers by itself: upcoming bookings the changes leave
 * outside the hours are listed (Move or Cancel) and saving asks first, and barbers whose hours
 * stick out of narrower opening hours can be trimmed with one button.
 */
export function ShopSettingsPage({ session }: { session: StaffSession }) {
  const { t } = useTranslation();
  const { shop: saved, barbers } = session;
  const [today] = useState(() => toDateKey(new Date()));
  // Null while nothing is edited, so changes saved elsewhere show up live.
  const [draft, setDraft] = useState<ShopSettings | null>(null);
  // What's typed in the WhatsApp field, until it's a valid number.
  const [whatsappText, setWhatsappText] = useState<string | null>(null);
  const [upcoming, setUpcoming] = useState<ShopStaffBooking[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [trim, setTrim] = useState<{ busy: boolean; message: string | null }>({ busy: false, message: null });

  useEffect(
    () => subscribeUpcomingBookings(store, null, today, setUpcoming, (err) => console.error(err)),
    [today],
  );

  const current = draft ?? saved;
  const errors = draft ? shopErrors(draft) : [];
  const barberOf = (id: string) => barbers.find((b) => b.id === id);
  const clashesWith = (shop: ShopSettings, b: ShopStaffBooking) => {
    const barber = barberOf(b.barberId);
    return barber !== undefined && bookingsOutsideHours(shop, barber, [b]).length > 0;
  };
  const conflicts = upcoming.filter((b) => clashesWith(current, b));
  // Bookings that only clash because of the unsaved changes.
  const newConflicts = draft ? conflicts.filter((b) => !clashesWith(saved, b)) : [];
  const outside = barbersOutsideShopHours(barbers, current);

  function edit(change: Partial<ShopSettings>) {
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
      // Past closed days and finished special periods are no longer needed.
      await saveShop(store, {
        ...draft,
        shopName: draft.shopName.trim(),
        closedDays: draft.closedDays.filter((d) => d >= today),
        specialPeriods: draft.specialPeriods.filter((p) => p.end >= today),
      });
      setDraft(null);
      setWhatsappText(null);
      setConfirming(false);
    } catch (err) {
      console.error(err);
      setSaveError(t('common.couldntSave'));
    }
    setSaving(false);
  }

  function discard() {
    setDraft(null);
    setWhatsappText(null);
    setConfirming(false);
    setSaveError(null);
  }

  async function trimBarbers() {
    setTrim({ busy: true, message: null });
    try {
      const changed = await trimBarbersToShop(store, saved, barbers);
      setTrim({ busy: false, message: t('shopSettings.trimmed', { count: changed.length }) });
    } catch (err) {
      console.error(err);
      setTrim({ busy: false, message: t('shopSettings.trimFailed') });
    }
  }

  return (
    <div className="min-h-screen pb-64">
      <AdminHeader session={session} title={t('settings.title')}>
        <SettingsTabs active="shop" />
      </AdminHeader>

      <main className="mx-auto max-w-xl px-4 pt-6">
        {conflicts.length > 0 && (
          <div className="mb-8 rounded-2xl border border-brass/50 bg-brass/10 p-4">
            <h2 className="caps font-semibold">
              {conflicts.length === 1
                ? t('shopSettings.outsideOne')
                : t('shopSettings.outsideMany', { count: conflicts.length })}
              {draft ? t('shopSettings.withYourChanges') : ''}
            </h2>
            <p className="mb-3 text-sm">{t('shopSettings.outsideText')}</p>
            <ul className="grid gap-3">
              {conflicts.map((b) => (
                <BookingCard key={b.id} booking={b} showDate cancelOnly />
              ))}
            </ul>
          </div>
        )}

        {outside.length > 0 && (
          <Notice tone="warning" className="mb-8">
            <p className="font-semibold">
              {t(
                outside.length === 1
                  ? draft
                    ? 'shopSettings.worksOutsideNew'
                    : 'shopSettings.worksOutside'
                  : draft
                    ? 'shopSettings.workOutsideNew'
                    : 'shopSettings.workOutside',
                { names: outside.map((b) => b.name).join(', ') },
              )}
            </p>
            <p className="mb-2">
              {t('shopSettings.onlyWhileOpen')}{' '}
              {draft ? t('shopSettings.trimAfterSaving') : t('shopSettings.trimQuestion')}
            </p>
            {!draft && (
              <button type="button" onClick={trimBarbers} disabled={trim.busy} className={`${buttonOutline} text-sm`}>
                {trim.busy ? t('shopSettings.trimming') : t('shopSettings.trim')}
              </button>
            )}
          </Notice>
        )}
        {trim.message && (
          <Notice tone="success" className="mb-8">
            {trim.message}
          </Notice>
        )}

        <Section title={t('shopSettings.shop')} description={t('shopSettings.shopDescription')}>
          <div className={`${cardClass} grid gap-3`}>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">{t('shopSettings.shopName')}</span>
              <input
                type="text"
                autoComplete="off"
                maxLength={MAX_SHOP_NAME_LENGTH}
                value={current.shopName}
                onChange={(e) => edit({ shopName: e.target.value })}
                className={`${inputBase} w-full`}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">{t('shopSettings.whatsapp')}</span>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="off"
                dir="ltr"
                placeholder={t('common.phonePlaceholder')}
                value={whatsappText ?? current.whatsapp}
                onChange={(e) => {
                  setWhatsappText(e.target.value);
                  edit({ whatsapp: normalizeLebanesePhone(e.target.value) ?? e.target.value.trim() });
                }}
                className={`${inputBase} w-full text-start tabular-nums rtl:text-end`}
              />
              <span className="mt-1 block text-sm text-muted">{t('shopSettings.whatsappHelp')}</span>
            </label>
          </div>
        </Section>

        <BrandingEditor shopName={current.shopName} />

        <HoursEditor
          weeklyHours={current.openingHours.map((d) => ({ ...d, breaks: [] }))}
          onChange={(hours) => edit({ openingHours: hours.map(({ closed, start, end }) => ({ closed, start, end })) })}
          breaks={false}
        />
        <ServicesEditor services={current.services} onChange={(services) => edit({ services })} />
        <ShopInfoEditor shopAddress={current.shopAddress} mapsUrl={current.mapsUrl} onChange={edit} />
        <WindowEditor
          today={today}
          bookingWindowDays={current.bookingWindowDays}
          specialPeriods={current.specialPeriods}
          onChange={edit}
        />
        <DaysOffEditor
          today={today}
          daysOff={current.closedDays}
          onChange={(closedDays) => edit({ closedDays })}
          title={t('shopSettings.closedDays')}
          description={t('shopSettings.closedDaysHelp')}
        />
      </main>

      {draft && (
        <SaveBar
          errors={errors}
          confirm={
            confirming
              ? newConflicts.length === 1
                ? t('settings.conflictsOne')
                : t('settings.conflictsMany', { count: newConflicts.length })
              : null
          }
          saveError={saveError}
          saving={saving}
          onSave={save}
          onDiscard={discard}
        />
      )}

      <AdminNav active="settings" />
    </div>
  );
}
