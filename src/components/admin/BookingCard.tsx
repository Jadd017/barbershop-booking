import { useTranslation } from 'react-i18next';
import { useBookingServiceName } from '../../hooks/useServiceNames';
import { formatLebanesePhone } from '../../lib/phone';
import { formatDayLong, minutesToTime, timeToMinutes } from '../../lib/time';
import type { ShopStaffBooking } from '../../types';
import { StatusChip } from '../ui';
import { BookingActions } from './BookingActions';

interface Props {
  booking: ShopStaffBooking;
  /** Shows the booking's date, for lists that span several days. */
  showDate?: boolean;
  /** Offers only Cancel (no Done / No-show), for bookings that clash with the settings. */
  cancelOnly?: boolean;
}

export function BookingCard({ booking, showDate = false, cancelOnly = false }: Props) {
  const { t } = useTranslation();
  const serviceName = useBookingServiceName();
  const end = minutesToTime(timeToMinutes(booking.startTime) + booking.durationMinutes);

  return (
    <li
      className={`rounded-2xl border border-line bg-card p-4 ${
        booking.status === 'cancelled' ? 'opacity-60' : ''
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          {showDate && <p className="caps text-sm font-semibold">{formatDayLong(booking.date)}</p>}
          <p className="caps text-xl font-semibold tabular-nums">
            <bdi dir="ltr">
              {booking.startTime}
              <span className="text-base font-normal text-muted">–{end}</span>
            </bdi>
          </p>
          <p className="text-sm text-muted">
            {serviceName(booking)} · {t('common.minutes', { minutes: booking.durationMinutes })}
          </p>
        </div>
        <StatusChip status={booking.status} />
      </div>
      <BookingDetails booking={booking} />
      <div className="mt-3">
        <BookingActions booking={booking} cancelOnly={cancelOnly} />
      </div>
    </li>
  );
}

/** Name, phone, Google account, code, and whether the customer chose "Any barber". */
export function BookingDetails({ booking }: { booking: ShopStaffBooking }) {
  const { t } = useTranslation();
  return (
    <div className="text-sm">
      <p className="text-lg font-semibold">{booking.name}</p>
      <p className="tabular-nums text-ink">
        {booking.phone ? <span dir="ltr">{formatLebanesePhone(booking.phone)}</span> : t('actions.noPhone')}
      </p>
      {booking.customerEmail && <p className="break-all text-muted">{booking.customerEmail}</p>}
      {!booking.customerEmail && <p className="text-muted">{t('actions.walkInOrPhone')}</p>}
      {booking.anyBarber && <p className="text-muted">{t('actions.bookedAny')}</p>}
      <p className="text-muted">
        {t('common.code')}{' '}
        <span lang="en" dir="ltr" className="caps font-semibold tracking-[0.15em] text-ink">
          {booking.bookingCode}
        </span>
      </p>
    </div>
  );
}
