import { useEffect, useState } from 'react';
import { getSettings, subscribeBookings } from '../../data/api';
import { addDays, formatDayLong, toDateKey } from '../../lib/time';
import type { AdminBooking, DateKey, Settings } from '../../types';
import { AddBookingSheet } from './AddBookingSheet';
import { BookingCard } from './BookingCard';

export function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [today] = useState(() => toDateKey(new Date()));
  const [date, setDate] = useState<DateKey>(today);
  // Tagged with their date, so a previous day's list is never shown for a new day.
  const [bookings, setBookings] = useState<{ date: DateKey; items: AdminBooking[] } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  useEffect(() => {
    return subscribeBookings(
      date,
      (items) => {
        setBookings({ date, items });
        setLoadError(false);
      },
      (err) => {
        console.error(err);
        setLoadError(true);
      },
    );
  }, [date]);

  const items = bookings?.date === date ? bookings.items : null;
  const cancelledCount = items?.filter((b) => b.status === 'cancelled').length ?? 0;
  const visible = items?.filter((b) => showCancelled || b.status !== 'cancelled') ?? [];
  const activeCount = (items?.length ?? 0) - cancelledCount;

  return (
    <div className="mx-auto min-h-screen max-w-xl bg-neutral-50 px-4 pb-28 pt-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Bookings</h1>
        <button type="button" onClick={onLogout} className="text-sm font-medium underline">
          Log out
        </button>
      </header>

      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setDate(addDays(date, -1))}
          aria-label="Previous day"
          className="rounded-xl border border-neutral-300 bg-white px-4 py-3 font-bold"
        >
          ‹
        </button>
        <input
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-neutral-300 bg-white px-3 py-3 text-center"
        />
        <button
          type="button"
          onClick={() => setDate(addDays(date, 1))}
          aria-label="Next day"
          className="rounded-xl border border-neutral-300 bg-white px-4 py-3 font-bold"
        >
          ›
        </button>
      </div>

      <div className="mb-4 flex items-center justify-between text-sm">
        <p className="font-medium text-neutral-700">
          {date === today ? 'Today · ' : ''}
          {formatDayLong(date)}
        </p>
        {date !== today && (
          <button type="button" onClick={() => setDate(today)} className="font-medium underline">
            Back to today
          </button>
        )}
      </div>

      {loadError ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          Couldn't load bookings. Check your connection and refresh.
        </p>
      ) : !items ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between text-sm">
            <p className="text-neutral-600">
              {activeCount} booking{activeCount === 1 ? '' : 's'}
            </p>
            {cancelledCount > 0 && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showCancelled}
                  onChange={(e) => setShowCancelled(e.target.checked)}
                  className="h-4 w-4"
                />
                Show cancelled ({cancelledCount})
              </label>
            )}
          </div>

          {visible.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
              No bookings on this day.
            </p>
          ) : (
            <ul className="grid gap-3">
              {visible.map((b) => (
                <BookingCard key={b.id} booking={b} />
              ))}
            </ul>
          )}
        </>
      )}

      {settings && (
        <div className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-white/95 backdrop-blur">
          <div className="mx-auto max-w-xl px-4 py-3">
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="w-full rounded-xl bg-neutral-900 px-5 py-4 font-semibold text-white hover:bg-neutral-700"
            >
              + Add booking
            </button>
          </div>
        </div>
      )}

      {adding && settings && (
        <AddBookingSheet
          settings={settings}
          initialDate={date}
          onClose={() => setAdding(false)}
          onAdded={(addedDate) => {
            setAdding(false);
            setDate(addedDate);
          }}
        />
      )}
    </div>
  );
}
