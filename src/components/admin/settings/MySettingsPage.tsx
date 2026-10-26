import { useState } from 'react';
import { toDateKey } from '../../../lib/time';
import { AdminHeader } from '../AdminHeader';
import { AdminNav } from '../AdminNav';
import type { StaffSession } from '../session';
import { BlockedTimes } from './BlockedTimes';
import { PasswordEditor } from './PasswordEditor';
import { ScheduleEditor } from './ScheduleEditor';
import { SettingsTabs } from './SettingsTabs';

/**
 * The signed-in barber's own settings: weekly hours and breaks and days off (a draft, saved
 * together), blocked times (saved straight away) and his password. The rules let a barber change
 * only these fields of his own barber doc, and only within the shop's opening hours. The owner
 * reaches this page as the "Me" tab of his settings.
 */
export function MySettingsPage({ session }: { session: StaffSession }) {
  const { shop, barber, user, staff, isOwner } = session;
  const [today] = useState(() => toDateKey(new Date()));

  return (
    <div className="min-h-screen pb-64">
      <AdminHeader session={session} title="Settings">
        {isOwner && <SettingsTabs active="me" />}
      </AdminHeader>

      <main className="mx-auto max-w-xl px-4 pt-6">
        <ScheduleEditor shop={shop} barber={barber} self />
        <BlockedTimes today={today} shop={shop} barber={barber} self />
        <PasswordEditor user={user} username={staff.username} />
      </main>

      <AdminNav active="settings" />
    </div>
  );
}
