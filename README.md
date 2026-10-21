# Barbershop Booking

Booking site for a one-barber shop (Eddy). Customers pick a service, a day and a free start time, then sign in with Google to book.

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

## Customer sign-in (Google)

Browsing is open to everyone; pressing **Confirm** asks the customer to sign in with Google,
then shows the name/phone form with their choice kept. `src/data/auth.ts` opens a Google popup
(which also works in mobile Safari and Chrome, as a new tab) and falls back to a full-page
redirect where popups can't open, e.g. a home-screen app. The choice is saved in session
storage first so it survives the redirect.

For the redirect fallback to work in Safari, Chrome and Firefox (which block third-party
storage), `VITE_FIREBASE_AUTH_DOMAIN` must be the domain the site is served from. On Firebase
Hosting that's automatic once it's set to that domain (e.g. `eddy-barbershop.web.app` or a
custom domain); elsewhere `/__/auth/*` needs to be proxied to `<project>.firebaseapp.com`.
Every domain the site runs on must also be listed under Authentication → Settings →
Authorized domains. Google refuses sign-in inside in-app browsers (Instagram, Facebook, …);
the page tells those visitors to open it in Chrome or Safari.

Eddy's `/admin` login stays email/password. His account isn't a Google one, so it never counts
as a customer, and a Google customer who opens `/admin` sees "Not authorized".

## Firestore security rules

`firestore.rules` enforces everything on the server (the page's checks are only for UX):

- Customer bookings must come from a Google sign-in and carry that account's UID and email.
  Customers can only read, list and cancel (before the start time) their own bookings;
  only Eddy can see all of them. Walk-ins Eddy adds have no customer UID.
- Each Google account and each phone can hold at most 2 upcoming bookings
  (via `userLimits/{uid}_{1|2}` and `phoneLimits/{phone}_{1|2}` "seats").
- Bookings are fully validated and must claim their slots in the same transaction.
- `customers/{uid}` keeps the last name and phone for pre-filling; only that customer and Eddy can read it.

The services, `ADMIN_UID` and `DAYS_TO_SHOW` are copied into the rules — keep them in sync.

```bash
npm run test:rules   # rules + data layer tests in the Firestore emulator (needs Java 21+)
firebase deploy --only firestore:rules
```
