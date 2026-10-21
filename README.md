# Barbershop Booking

Booking site for a one-barber shop (Eddy). Customers pick a service, a day and a free start time — no account needed.

**Phase 1:** UI only, running on fake data. Firebase (Firestore, Auth, Hosting) comes in phase 2.

## Stack

React + Vite + TypeScript, Tailwind CSS. Mobile-first.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
```

## Structure

```
src/
  config.ts          DAYS_TO_SHOW, SLOT_MINUTES
  types.ts           Shared types (Settings, Service, Booking)
  data/
    api.ts           getSettings(), getBookings(date) — the only data entry point for the UI
    fakeData.ts      Fake settings and bookings (phase 1)
  lib/
    slots.ts         Availability logic (15-min grid, hours, break, bookings)
    time.ts          Time/date helpers
  components/        ServicePicker, DayPicker, TimeGrid
  App.tsx            Booking page
```

To switch to Firestore in phase 2, re-implement the functions in `src/data/api.ts` and keep their signatures.

## Firestore security rules

`firestore.rules` enforces everything on the server (the page's checks are only for UX):
bookings can be fetched by code but only Eddy can list them, customer bookings are fully
validated and must claim their slots in the same transaction, customers can only cancel
(before the start time), and each phone can hold at most 2 upcoming bookings
(via `phoneLimits/{phone}_{1|2}` "seats").

The services, `ADMIN_UID` and `DAYS_TO_SHOW` are copied into the rules — keep them in sync.

```bash
npm run test:rules   # rules + data layer tests in the Firestore emulator (needs Java 21+)
firebase deploy --only firestore:rules
```
