# Developer notes

How the booking site works in detail, and how to set up and operate it. The overview is in the [README](../README.md).

## Stack

React + Vite + TypeScript, Tailwind CSS, Firebase (Firestore, Auth, Hosting, App Check).
Mobile-first.

## Look

Classic barbershop: charcoal, cream and brass, with a red/cream/blue barber-pole stripe on the
customer pages. The colors are Tailwind theme tokens in `src/index.css` (`bg-charcoal`,
`text-brass-light`, …), along with the `caps` utility (Oswald, uppercase, spaced) for headings
and labels. Oswald is self-hosted through `@fontsource/oswald`, so it loads from the site itself
and fits the Content-Security-Policy; icons come from `lucide-react`. Shared buttons, notices and
status chips are in `src/components/ui.tsx`.

Contrast: brass is only a fill or border on light backgrounds (as text it's under 3:1 there) and
a text color on charcoal; small muted text on cream uses `muted-strong` (#73685D) because #7A6F64
is just under 4.5:1 on cream; the WhatsApp button's white text is 24px. Buttons are at least
44px tall.

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
    shop.ts          Prices and the (https-only) directions link
    time.ts          Time/date helpers
  components/        Customer pages' parts; ui.tsx holds the shared look
    admin/           Eddy's dashboard (Today, Calendar, Walk-in), settings, login
  pages/             BookingPage, MyBookingsPage, AdminPage
```

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

`/admin/settings` (**Settings** in the bottom bar of Eddy's pages) edits `settings/shop`, which the
booking page reads live: weekly hours with up to 2 breaks a day (or closed), services
(15–60 min, with an optional price shown to customers), the shop's address and Google Maps
link (for "Get directions" after booking), how many days ahead customers can book, up to 4 special periods (while today is
between their dates, customers can book their own number of days ahead), and days off.
Changes are saved together with **Save changes**.

**Blocked times** (a time range on one day) are saved straight away as slot docs marked
`blocked`, so they count as taken everywhere. Times already booked are left to their bookings.

Nothing on the settings page cancels bookings. Upcoming bookings on a closed day, a day off,
outside the hours or in a break are listed at the top (and in the blocking form) with a Cancel
button, and saving changes that create new clashes asks for confirmation first.

`settings/shop` is created with the defaults in `src/lib/settingsDoc.ts` (10:00–20:00 every day,
break 14:00–15:00, Haircut 30 min $10 / Beard 15 min $5 / Haircut + Beard 45 min $13, 4 days
ahead) the first time Eddy
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
- Anyone can read `settings/shop`; only Eddy can write it, and its shape is checked. The Maps
  link must be `https://` (it's put in a link, so never `javascript:`) and the address at most
  200 characters; both are optional so older settings still save. Prices sit inside each
  service and are only ever displayed: bookings don't store or depend on them.
- Blocked times are slot docs only Eddy can create or delete.
- `customers/{uid}` keeps the last name and phone for pre-filling; only that customer and Eddy can
  read it, only that customer can write it, and nobody can list or delete them.
- Eddy is his UID *and* an email/password sign-in: if Google were ever linked to his account,
  that sign-in gets no admin rights.

`ADMIN_UID` and the limits in `src/config.ts` (60-min services, 2 breaks a day, 4 special
periods, 60-day window) are copied into the rules; keep them in sync.

Firestore stops evaluating a write after 1000 expressions, and a customer booking uses a lot of
them. That's why `settings/shop` stores times as minutes and special periods as day numbers, and
why the rules compute shared values once. The "heaviest valid booking" tests measure the worst
case at about 820 expressions and fail if a change eats into the remaining ~15%. The booking also
reads up to 9 documents, against a limit of 10 per write that the emulator doesn't check, so
don't add a `get()` to customer bookings.

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

- **Security headers** (`firebase.json`, every path): a Content-Security-Policy that allows only
  this site's own scripts plus Google's sign-in helper (`apis.google.com`) and reCAPTCHA, and
  only Firebase's APIs for requests; `frame-ancestors 'self'` and `X-Frame-Options` so other
  sites can't frame the page; `nosniff`, `Referrer-Policy`, HSTS and a `Permissions-Policy`.
  Hosting doesn't add them to its own `/__/auth/*` pages, so they can't break Google sign-in.
  If something new is blocked, the browser console says which directive to extend.

`npx firebase emulators:start --only hosting` serves `dist` at http://127.0.0.1:5050 with the
same rewrites. The emulator doesn't apply the cache or security headers.

## App Check

`src/data/firebase.ts` starts [App Check](https://firebase.google.com/docs/app-check) with
reCAPTCHA Enterprise (free up to 10,000 checks a month, far above this site's traffic): each
visitor's browser gets a token proving it's running this site, and once enforcement is on,
Firestore refuses requests without one. Scripts that copy the public API key get nothing.
It's off while `VITE_RECAPTCHA_ENTERPRISE_KEY` is empty.

Setup, in this order:

1. **Google Cloud console** (project `eddy-barbershop`) → search "reCAPTCHA" → enable the API if
   asked → **Create key**: type **Website**, domains `eddy-barbershop.web.app` and
   `eddy-barbershop.firebaseapp.com` (not `localhost`), **Use checkbox challenge off**.
   Copy the key ID.
2. **Firebase console** → **App Check** → **Apps** → the web app → **reCAPTCHA Enterprise** →
   paste the key → **Save**.
3. Put the key in `.env.production` and `.env.local` as `VITE_RECAPTCHA_ENTERPRISE_KEY`.
4. **Localhost:** App Check → Apps → ⋮ next to the web app → **Manage debug tokens** → **Add** →
   **Generate**, then put it in `.env.local` as `VITE_APPCHECK_DEBUG_TOKEN` and restart
   `npm run dev`. It's a secret; never commit it. Only `npm run dev` uses it.
5. Deploy, then use the live site (book, cancel, Eddy's dashboard and settings) on a phone and a
   computer. Under App Check → **APIs** → **Cloud Firestore**, requests should show as verified.
6. Only then: App Check → APIs → Cloud Firestore → **Enforce**. It takes effect within ~15 min;
   **Unenforce** undoes it.

## Browser API key

The `VITE_FIREBASE_API_KEY` is public by design (it's in the page); the rules and App Check are
what protect the data. Still, restrict it: Google Cloud console → **APIs & Services** →
**Credentials** → the "Browser key (auto created by Firebase)" → **Application restrictions:
Websites** → `https://eddy-barbershop.web.app/*`, `https://eddy-barbershop.firebaseapp.com/*`,
`http://localhost:5173/*` → **Save**.
