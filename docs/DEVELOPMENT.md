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

## Multi-barber branch

On the `multi-barber` branch everything runs against the local Firebase emulators, never a real
project (plan: [ARCHITECTURE.md](ARCHITECTURE.md)). `.env.emulator` uses the emulator-only project
`demo-barbershop`; `.env.local` is ignored there.

```bash
npm run emu       # terminal 1: Auth + Firestore emulators (needs Java 21+)
npm run seed      # terminal 2: a demo shop in the emulators (owner "tony" and 5 barbers,
                  #   password "password1", bookings today around the time it's run and on the
                  #   next open day); wipes what was there. Run again after restarting emu.
npm run dev       # http://localhost:5173 against the emulators
npm test          # unit tests
npm run test:emu  # rules + data-layer tests in the emulators (alias: test:rules)
npm run build     # type-check + build, emulator config
```

### Customer flow on the emulator

With `npm run emu`, `npm run seed` and `npm run dev` running, in a phone-sized window
(browser dev tools → device toolbar, e.g. 390 × 844):

1. The header says "Demo Barbershop" (also the tab title), with today's opening hours.
2. Pick a service: the Barber step shows "Any barber" and initials cards for Tony, Karim Haddad,
   Sami, Omar, Fadi and Elie.
3. Pick a barber and the demo day (the next open day): times follow his hours, breaks and
   bookings (Karim: booked 10:00–10:45 and 11:00, break 13:00–13:30; Sami starts at 12:00 and
   is blocked 16:00–17:00; Omar is off that day, so it shows closed for him).
4. "Any barber" shows a time if anyone is free (e.g. 12:45, where Karim and Sami can't).
5. Pick a time: the bottom bar shows the barber. Book now → the emulator's fake Google sign-in
   → name and phone → the confirmation names the barber ("You're booked with …" for Any barber),
   and the WhatsApp message goes to the shop's number with the barber's name.
6. My bookings lists it "With <barber>", and cancelling frees the time.

### Staff dashboard on the emulator

Same setup, at http://localhost:5173/admin. Logins (all password `password1`): `tony` (owner,
barber Tony), `karim`, `sami`, `omar`, `fadi`, `elie`. A barber sees only his own day; the
owner's extras are in the next checklist. Reseed to start over.

1. **Login**: `karim` with a wrong password → "Wrong username or password.", then `password1`.
   The header shows the shop name and "Karim Haddad".
2. **Today**: stats (Bookings, Done, Free slots), "Working 10:00–20:00", an **Up next** card
   (Maya, about 15 min after you ran the seed) with Done / No-show, Call, WhatsApp, Cancel;
   **Later today** with a walk-in (no phone, so no Call/WhatsApp), his break and a blocked hour;
   **Earlier today** with a done and a no-show booking; "Show cancelled (1)". Depending on the
   time you seeded, some of these fall outside the day or in a break and are left out.
3. Tap **Done** on Up next: it moves to Earlier today and the Done count goes up; tap it there
   and **Undo Done**. Open a later booking and **Cancel** → "Yes, cancel": it moves under
   cancelled, and Free slots goes up.
4. **Calendar**: arrows and the date field show any day; the next open day has Karim's 10:00 and
   11:00 bookings. Sunday says "The shop is closed on this day."
5. **Walk-in**: pick a service, today: only his free times can be picked (not his break, blocked
   or booked time). Add a name (phone optional) → it appears in his day. Add another at the same
   time: that time is no longer offered.
6. **Settings → My hours**: each day shows the shop's hours; times outside them aren't offered;
   Sunday (shop closed) can't be switched on. Change Monday to end at 19:00 → Save changes. If a
   booking falls outside the new hours, it's listed at the top and saving asks "Save anyway?".
7. **My days off**: add the next open day → Save → the Calendar says "This is your day off", and
   the customer page no longer offers Karim that day (its bookings are listed at the top).
8. **Blocked times**: only times within the shop's hours are offered; pick a range over one of
   his bookings → it's listed with Cancel; Block → it shows in the list and on Today; Unblock.
9. **Password**: wrong current password → refused; mismatched new ones → refused; correct →
   "Password changed". Log out; the old password fails, the new one works.
10. **Only his own**: log in as `sami`: he sees his own booking (Samir) and none of Karim's.
    `elie` on a Monday (Calendar): "You don't work on Mondays."

### Owner dashboard on the emulator

Log in as `tony` / `password1`. Use a phone-sized window, and a wide one (1400 px+) for step 2.
Reseed to start over.

1. **Today (phone)**: "Whole shop" stats on top, then a row of barber pills (initials, first name,
   bookings). Tap **Karim**: his day with his own numbers, Up next, later and earlier today.
2. **Today (wide window)**: every barber side by side, each column with his numbers and hours.
3. **Acting on any barber**: on Karim's Up next tap **Done**, then **Undo Done**; open a later
   booking and **Cancel** it.
4. **Move**: open one of Karim's bookings → **Move**. Each other barber shows "Free", "Booked
   then", "Blocked then" or "Not working then"; only free ones can be picked. Pick one → **Move
   to …** → "Moved to …" and **WhatsApp <customer>** (for a booking with a phone), whose message
   names the new barber. The booking now shows under that barber.
5. **Walk-in for any barber**: Walk-in → pick **Sami** → service → only Sami's free times → add.
   It shows in Sami's day; that time is gone for him, still free for others.
6. **Barbers**: the list (in customer order) with each login. Move Sami **up** → the customer
   page lists him earlier. **Add a barber**: name "Ziad Test" (username suggested "ziad"), first
   password `ziadpass1` → "Ziad Test was added", and you're still logged in as Tony. Log in as
   `ziad` later: he sees his own (empty) day.
7. **A barber's page** (tap Karim): rename him (customers see the new name), change his hours,
   breaks and days off (same warnings as his own settings), block time for him. **New login**:
   new password `karimnew1` → "New login ready"; later `karim` / `password1` fails and
   `karimnew1` works.
8. **Deactivate**: open Fadi → **Deactivate Fadi** → "Yes, deactivate". "Fadi is inactive" lists
   Nour's booking on the next open day with Move / Cancel; **Move** it to Tony (free at 15:00),
   WhatsApp Nour. The customer page no longer shows Fadi, and `fadi` can't log in ("turned off").
   **Bring Fadi back** → he's bookable and `fadi` / `password1` works again.
9. **Settings → Shop**:
   - Shop name "Tony Cuts" → Save changes: header, tab title and customer page change.
   - WhatsApp: "12345" is refused; "71 999 888" is accepted.
   - **Logo and colors**: upload a PNG/JPEG → preview of the customer header → Save look; the
     customer page shows it. Make Background the same as Dark → a contrast warning; **Reset
     colors to defaults**. **Remove logo** → Save look → name only.
   - Services: change a price, add a service; booking window, a special period, a closed day:
     the customer page follows. A closed day with bookings lists them at the top with Move /
     Cancel, and saving asks "Save anyway?".
   - Opening hours: end Monday at 18:00 → Save. Barbers working later are named, with **Trim
     their hours to the shop's**.
10. **Settings → Me**: Tony's own hours, days off, blocked times and password.
11. **A barber can't reach owner pages**: log in as `karim`: 4 tabs (no Barbers), no barber
    switcher, no Move, Settings has no Shop tab. Typing `/admin/barbers`, `/admin/barbers/sami`
    or `/admin/shop` shows "Owner only". (The rules refuse every owner write from a barber
    anyway: `npm run test:emu`.)

Reloading a page while the emulators are busy can sit on "Loading…" for a few seconds: the
emulator speaks HTTP/1.1, so the browser queues the new page's connections behind the old one's.
Real Firestore uses HTTP/2 and doesn't do this.

Safety (details in ARCHITECTURE.md, 3.2): `.firebaserc` holds shop aliases only, never
`default` or Eddy's; `npm run deploy -- <shop>` refuses without a named, complete shop, shows its
project and asks you to type the project ID, and runs every test before building; every
`firebase deploy` runs `scripts/deploy-guard.mjs` first, which refuses anything not started by
`npm run deploy` for that shop's own project and always refuses `eddy-barbershop`
(LOCKED_PROJECTS in `scripts/deployTargets.mjs`); Vite refuses a real project outside a shop's
own mode (`--mode <shop>`); and the app refuses to start if the emulator setting and the project
ID don't match.

### Shops

Each real shop is a folder `shops/<shop>/` (`.env` with its Firebase web config, first name and
site address; `logo.png`) plus an alias in `.firebaserc`. `npm run new-shop` starts one from
`shops/_template/`, `npm run setup-shop` sets up its Firestore and owner once, and
`npm run deploy -- <shop>` deploys it. Step by step: README, "Adding a new shop".
`npx vite build --mode <shop>` builds a shop's site without deploying it (into `dist/`).

## Structure

```
src/
  config.ts          SLOT_MINUTES, limits shared with firestore.rules
  types.ts           Shared types (Settings, Service, Booking)
  data/              The only data entry points for the UI (Firestore): shop.ts, days.ts,
                     bookings.ts, accounts.ts (staff logins), auth.ts (Google sign-in)
  lib/
    barberSchedule.ts  Shop and barber hours, days off and the booking window
    barberSlots.ts   Per-barber availability and "Any barber"
    staffDay.ts      The staff dashboard's day: blocked ranges, days off, clashing bookings
    team.ts          The owner's view: per-barber numbers, move options, new barber IDs, order
    logo.ts, logoImage.ts  Shrinking the shop's logo in the browser
    schedule.ts      Hours, breaks and validation helpers shared by the above
    slots.ts         The 15-min grid, past times
    shop.ts          Prices and the (https-only) directions link
    time.ts          Time/date helpers
  components/        Customer pages' parts; ui.tsx holds the shared look
    admin/           Staff dashboard (Today, Calendar, Walk-in, Move), settings, login;
                     barbers/ (the owner's barbers pages) and shop/ (shop settings, branding)
  pages/             BookingPage, MyBookingsPage, StaffPage (/admin)
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

Staff log in at `/admin` with a username and password (email/password underneath, see
ARCHITECTURE.md, 5). Those accounts aren't Google ones, so they never count as customers, and a
Google customer who opens `/admin` sees "No access".

## Staff dashboard

`/admin` (`StaffPage`) shows a barber his own day: **Today** (stats, Up next with Done /
No-show, later and earlier today with breaks and blocked time, Call / WhatsApp / Cancel),
**Calendar** (any day) and **Walk-in** (his own free times only; `createWalkIn` claims the slots
in a transaction). The owner sees every barber's day (a barber switcher on a phone, columns side
by side on a wide screen, numbers per barber and for the shop), adds walk-ins for any barber, and
can **Move** any booking to a barber free for its whole length, then WhatsApp the customer.

`/admin/settings` is his own: weekly hours with up to 2 breaks a day and days off (a draft, saved
together; hours must stay inside the shop's opening hours, and the shop's closed weekdays can't
be switched on), blocked times (saved straight away, only within the shop's hours on an open
day) and his password. Nothing there cancels bookings: upcoming bookings outside his hours are
listed at the top (and in the blocking form) with a Cancel button, and saving changes that
create new clashes asks first. If the owner narrowed the shop's hours, "Fit my hours to the
shop's" trims his.

The owner also has **Barbers** (`/admin/barbers`: order, add a barber with his login, and per
barber his name, schedule, blocked times, "New login" and deactivate / bring back, with a
deactivated barber's upcoming bookings to move or cancel) and **Settings → Shop**
(`/admin/shop`: name, WhatsApp, logo and colors, opening hours, services, address, booking
window, special periods, closed days). A barber who opens those addresses gets "Owner only".

The rules enforce what matters on the server: a barber reads, marks, cancels and adds bookings
only for his own `barberId`, blocks only his own days, and changes only `weeklyHours` and
`daysOff` of his own barber doc, inside the shop's hours. Blocking inside the shop's hours is
checked by the page only (the rules can't loop over a day doc's keys); blocked time outside the
hours is harmless.

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
npm run deploy -- <shop>   # confirm the project, run every test, build, deploy (README, "Adding a new shop")
```

Each shop's site is served from `dist` at its own address (e.g. https://sassine-maatouk.web.app).
Every path (`/admin`, `/my-bookings`, …) falls back to `index.html` so the router handles it.
The site, the Firestore rules and the indexes go out in the same command so they always match
the code.

- **Auth domain:** each shop's `VITE_FIREBASE_AUTH_DOMAIN` (in `shops/<shop>/.env`) is the
  domain its site is served from, so Google's redirect sign-in stays on the site's own domain,
  which mobile browsers need.
- **Caching:** files in `/assets` have a content hash in their name, so they're cached for a year.
  `index.html`, the app's routes and the favicon are sent with `no-cache` (always revalidated),
  so the next visit after a deploy loads the new version.

- **Security headers** (`firebase.json`, every path): a Content-Security-Policy that allows only
  this site's own scripts plus Google's sign-in helper (`apis.google.com`) and reCAPTCHA, frames
  only from the shop's own sign-in domains (`__AUTH_DOMAIN__` and `__PROJECT_ID__` in
  `firebase.json`, filled in per shop by the deploy), and only Firebase's APIs for requests; `frame-ancestors 'self'` and `X-Frame-Options` so other
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
