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
  config.ts          SLOT_MINUTES, limits shared with firestore.rules
  types.ts           Shared types (Settings, Service, Booking)
  data/
    api.ts           The only data entry point for the UI (Firestore)
  lib/
    schedule.ts      Hours, breaks, days off and the booking window from the settings
    settingsDoc.ts   settings/shop as stored in Firestore, and its defaults
    slots.ts         Availability logic (15-min grid, hours, breaks, taken/blocked slots)
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

## Settings (Eddy)

`/admin/settings` (the **Settings** link on the dashboard) edits `settings/shop`, which the
booking page reads live: weekly hours with up to 2 breaks a day (or closed), services
(15–60 min), how many days ahead customers can book, up to 4 special periods (while today is
between their dates, customers can book their own number of days ahead), and days off.
Changes are saved together with **Save changes**.

**Blocked times** (a time range on one day) are saved straight away as slot docs marked
`blocked`, so they count as taken everywhere. Times already booked are left to their bookings.

Nothing on the settings page cancels bookings. Upcoming bookings on a closed day, a day off,
outside the hours or in a break are listed at the top (and in the blocking form) with a Cancel
button, and saving changes that create new clashes asks for confirmation first.

`settings/shop` is created with the defaults in `src/lib/settingsDoc.ts` (10:00–20:00 every day,
break 14:00–15:00, Haircut 30 / Beard 15 / Haircut + Beard 45, 4 days ahead) the first time Eddy
opens `/admin`. Until then the booking page says booking opens soon.

## Firestore security rules

`firestore.rules` enforces everything on the server (the page's checks are only for UX):

- Customer bookings must come from a Google sign-in and carry that account's UID and email.
  Customers can only read, list and cancel (before the start time) their own bookings;
  only Eddy can see all of them. Walk-ins Eddy adds have no customer UID.
- Each Google account and each phone can hold at most 2 upcoming bookings
  (via `userLimits/{uid}_{1|2}` and `phoneLimits/{phone}_{1|2}` "seats").
- Bookings are fully validated and must claim their slots in the same transaction.
- Customer bookings must match `settings/shop`: an existing service with its current name and
  length, within that weekday's hours, clear of its breaks, not on a closed day or day off, and
  within the booking window (or a special period's window while it's on).
- Eddy's walk-ins skip the window and hours but still claim their slots, so they can't
  double-book. Eddy can only change a booking's status, not move it or revive a cancelled one.
- Anyone can read `settings/shop`; only Eddy can write it, and its shape is checked.
- Blocked times are slot docs only Eddy can create or delete.
- `customers/{uid}` keeps the last name and phone for pre-filling; only that customer and Eddy can read it.

`ADMIN_UID` and the limits in `src/config.ts` (60-min services, 2 breaks a day, 4 special
periods, 60-day window) are copied into the rules; keep them in sync.

Firestore stops evaluating a write after 1000 expressions, and a customer booking uses a lot of
them. That's why `settings/shop` stores times as minutes and special periods as day numbers, and
why the rules compute shared values once. The "heaviest valid booking" test fails if a change
pushes the worst case over the limit.

```bash
npm run test:rules   # rules + data layer tests in the Firestore emulator (needs Java 21+)
firebase deploy --only firestore:rules
```

## Deploy (Firebase Hosting)

```bash
npm run deploy   # production build, then firebase deploy --only hosting,firestore:rules
```

The site is served from `dist` at https://eddy-barbershop.web.app. Every path (`/admin`,
`/my-bookings`, …) falls back to `index.html` so the router handles it. The Firestore rules go
out in the same command so they always match the code.

- **Auth domain:** `.env.production` sets `VITE_FIREBASE_AUTH_DOMAIN=eddy-barbershop.web.app` for
  builds, overriding `.env.local`. Google's redirect sign-in then stays on the site's own domain,
  which mobile browsers need. `npm run dev` keeps the `.env.local` value.
- **Caching:** files in `/assets` have a content hash in their name, so they're cached for a year.
  `index.html`, the app's routes and the favicon are sent with `no-cache` (always revalidated),
  so the next visit after a deploy loads the new version.

`npx firebase emulators:start --only hosting` serves `dist` at http://127.0.0.1:5050 with the
same rewrites. The emulator doesn't apply the cache headers.
