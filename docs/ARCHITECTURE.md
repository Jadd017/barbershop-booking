# Multi-barber, multi-shop: architecture plan

Status: **Phase 0 done; Phases 1–9 not started.** Branch `multi-barber`. Until told otherwise,
everything on this branch runs against the Firebase emulator only. Eddy's live site (`main`,
project `eddy-barbershop`) is not touched.

## 1. Goals and hard constraints

- One codebase, **one Firebase project per shop**. Eddy becomes "a shop with 1 barber" later;
  the next shop is Sassine Maatouk with 5 barbers.
- **Free Spark plan, permanently.** Nothing may need Cloud Functions, Firebase Storage, a server
  or any other paid feature. Everything happens in the browser + Firestore security rules +
  Firebase Auth (email/password and Google, both free). The only "admin" code is the backup and
  migration scripts you run yourself on your computer (section 9).
- All permissions are enforced by `firestore.rules` and covered by emulator tests. The page's own
  checks are for UX only.
- Rules must stay well under Firestore's per-write limits (1000 expressions, 10 document reads
  per document write, 20 per transaction). Today's customer booking already uses ~820
  expressions and 9 reads, so the data model below is shaped around that.
- No barber photos. Barber cards show the name and an initials circle.

## 2. Overview

```
Customer (Google sign-in)                         Staff (username + password)
  service → barber or "Any barber" → day → time     barber: his own hours, breaks, days off, blocked
                                                            times and bookings
                                                    owner:  same + every barber + moving bookings +
                                                            shop settings (name, logo …) + accounts
            │                                                │
            ▼                                                ▼
                      Firestore (one project per shop)
  settings/shop        shop-wide config the rules read (name, opening hours, services, window …)
  settings/branding    logo + colors (never read by booking rules)
  barbers/{barberId}   name, active, order, weekly hours, breaks, personal days off
  days/{barberId}_{date}   ONE doc per barber per day: booked + blocked 15-min slots
  bookings/{code}      the booking, now with barberId + barberName
  staff/{uid}          login → role, barberId, active
  usernames/{username} username → current login (uid + internal email)
  phoneLimits/…, userLimits/…, customers/{uid}   unchanged
```

The biggest change from today: the 96 possible `slots/{date}_{HHMM}` docs per day become **one
`days/{barberId}_{date}` doc per barber per day**, holding all its taken slots in two maps. That
makes slots per barber, and it frees reads in the rules (one `getAfter` instead of four), which
pays for reading the barber's schedule.

## 3. Per-shop config and Firebase projects

### 3.1 Files

| File | Committed | Contents |
|---|---|---|
| `.env.emulator` | yes | `VITE_USE_EMULATOR=true`, project ID `demo-barbershop`, dummy values (Phase 0) |
| `.env.eddy`, `.env.sassine` | yes (Phase 7) | Firebase web config (public by design), `VITE_SHOP_NAME`, `VITE_SITE_URL`, auth domain, reCAPTCHA site key (public) |
| `shops/<shop>/logo.png` | yes (Phase 7) | initial logo, and the link-preview image |
| `.env.<shop>.local` | no (gitignored) | App Check debug token for local dev |
| `.firebaserc` | yes | **empty on this branch until Phase 7** (the CLI picks a lone alias even without `default`), then aliases only (`eddy → eddy-barbershop`, `sassine → …`), never `default` |
| `firebase.template.json` | yes (Phase 7) | today's `firebase.json` with the shop's domains as placeholders |

Vite loads `.env.[mode]` automatically, so `vite --mode sassine` builds Sassine's site and
`vite --mode emulator` builds against the emulator.

**The per-shop config only holds the initial shop name and logo** (plus the Firebase settings):

- They are copied into Firestore (`settings/shop.shopName`, `settings/branding.logo`) the first
  time the owner opens the dashboard of a new shop. After that, Firestore is what the site shows,
  and the owner changes them from Settings.
- They are also used for the **link preview** when someone shares the site (WhatsApp, Instagram,
  Facebook). Those apps don't run JavaScript, so the build writes `og:title`, `og:description`
  and `og:image` (the config logo, copied to `/og-image.png`) into `index.html`. Changing the
  preview therefore means changing the config file and redeploying; the owner's in-app changes
  don't reach it.

The WhatsApp number moves out of `.env` into `settings/shop` (the owner edits it). It is public
anyway: it's in every wa.me link.

### 3.2 Emulator-only development (safety, Phase 0)

- `.env.emulator` uses the project ID **`demo-barbershop`**. Firebase treats `demo-*` projects as
  emulator-only: the SDK and CLI cannot reach any real project with it, even by mistake.
- `src/data/firebase.ts`: when `VITE_USE_EMULATOR` is set, it connects to the Firestore and Auth
  emulators, skips App Check, and **refuses to start unless the project ID starts with `demo-`**.
- `vite.config.ts` refuses to run (dev or build) with any project ID that doesn't start with
  `demo-`, so `.env.local`'s real Eddy config can't be used from this branch by accident. Phase 7
  adds the shop modes to an explicit allow-list.
- `firebase.json` gains the Auth emulator (port 9099), needed for staff logins and the fake Google
  sign-in popup.
- `.firebaserc` has no projects on this branch (and `firebase use --clear` was run for this
  folder), so a bare `firebase deploy` fails with "No active project" instead of pushing new rules
  onto Eddy's live project (which would break his current site), and `npm run deploy` is disabled
  until Phase 7.
- Scripts:
  - `npm run emu` – start Auth + Firestore emulators for `demo-barbershop`
  - `npm run dev` – the site at http://localhost:5173, against the emulator
  - `npm run build` – type-check + build (emulator config)
  - `npm test` – unit tests; `npm run test:emu` (alias `test:rules`) – rules + data-layer tests in
    the emulator
  - `npm run seed` – demo shop in the emulator (owner + 4 barbers, services, bookings), Phase 3

### 3.3 Build and deploy (Phase 7, used only when you say so)

`scripts/deploy.mjs <shop>`:

1. Refuses unless `<shop>` is an alias in `.firebaserc` and `.env.<shop>` exists.
2. Refuses if the git branch isn't the release branch for that shop (protects Eddy until
   migration day).
3. Writes `firebase.<shop>.json` from `firebase.template.json` (fills the shop's domains into
   the CSP `frame-src`).
4. Runs `vite build --mode <shop>` then
   `firebase deploy --project <shop> --config firebase.<shop>.json --only hosting,firestore:rules,firestore:indexes`.
5. `--dry-run` prints the generated config and the commands without running them.

`firestore.rules` is **identical for every shop**: no UIDs or shop data are hard-coded in it any
more (today's `ADMIN_UID` goes away, staff come from `staff/{uid}`). Composite indexes
(`firestore.indexes.json`) are free on Spark.

### 3.4 New shop checklist (Sassine)

1. Firebase console: create project (Spark), add a web app, enable Auth providers
   **Email/Password** and **Google**, create Firestore, add the hosting domain to Authorized
   domains.
2. Add `.env.sassine`, `shops/sassine/logo.png` and the `.firebaserc` alias; run
   `npm run deploy sassine`.
3. Bootstrap the first owner (section 5.5).
4. Owner signs in (name and logo are seeded from the config), fills in shop settings, adds
   barbers and their logins.
5. Optional: App Check exactly as in `docs/DEVELOPMENT.md`, with the new project's own key.

## 4. Data model

Times inside documents the rules read are **minutes since midnight** and dates in windows are
**day numbers**, as today (cheaper rules). The UI converts, as `lib/settingsDoc.ts` does now.

### 4.1 `settings/shop` – shop-wide, read by the booking rule

| Field | Type | Notes |
|---|---|---|
| `shopName` | string, 2–40 chars, trimmed | header, browser tab title, WhatsApp text |
| `openingHours` | list of 7 `{closed, open, close}` | Monday first, minutes. The shop's limits: every barber's hours must fit inside |
| `services` | map id → `{name, durationMinutes, order, price?}` | same for all barbers; 15–60 min |
| `bookingWindowDays` | int 1–60 | as today |
| `specialPeriods` | list ≤ 4 of `{name, startDay, endDay, daysAhead}` | holiday booking windows, as today |
| `closedDays` | list of `"YYYY-MM-DD"` | whole shop closed (holidays); no barber can be booked |
| `whatsapp` | string, `+961…` | shop's number; booking messages go here |
| `shopAddress`, `mapsUrl` | string | as today (`mapsUrl` https only) |
| `updatedAt` | timestamp | |

Readable by everyone. Written only by the owner.

### 4.2 `settings/branding` – never read by the booking rules

| Field | Type | Notes |
|---|---|---|
| `logo` | string or `null` | `data:image/(webp\|jpeg\|png);base64,…`, ≤ 140,000 characters (≈ 100 KB). `null`: no logo, the header shows the shop name only |
| `colors` | `{dark, accent, light}` | `#RRGGBB` each; become the Tailwind CSS variables at runtime |
| `updatedAt` | timestamp | |

Kept out of `settings/shop` so the booking rule's `get()` and every settings listener don't drag
the logo along. Only the owner writes it; the rules check the data-URL prefix, the size and the
color format.

**Logo upload** (Settings → Shop): the owner picks an image; the browser scales it so its longest
side is at most 512 px and re-encodes it (WebP, or JPEG where the browser can't make WebP),
lowering quality and then size until it's under 100 KB. A **preview** shows the header as
customers will see it before anything is saved. **Remove logo** sets `logo: null`, falling back
to the shop name only. Colors: the page warns when a pair is below 4.5:1 contrast and has
"reset to defaults" (today's charcoal/cream/brass).

### 4.3 `barbers/{barberId}` – one per barber, read by the booking rule

| Field | Type | Notes |
|---|---|---|
| `name` | string 2–30 | initials are derived from it |
| `active` | bool | inactive: hidden from customers, rules refuse new customer bookings |
| `order` | int | display order, and the tie-break for "Any barber" |
| `weeklyHours` | list of 7 `{closed, open, close, breaks: ≤2 × {start, end}}` | Monday first, minutes. Each open day must fit inside the shop's `openingHours`, and can't be open on a day the shop is closed |
| `daysOff` | list of `"YYYY-MM-DD"` | personal days off |
| `updatedAt` | timestamp | |

`barberId` is a short slug chosen when the barber is added (`eddy`, `karim`), never changed.
Readable by everyone (the customer page needs names and schedules to show times).

If the owner later **narrows the shop's opening hours**, barbers' hours aren't silently changed:
the booking rule checks the booking against both (so the effective hours are the overlap), the
settings page lists barbers whose hours now stick out and the bookings that clash, and offers
"trim barbers' hours to fit". A barber whose hours stick out gets them trimmed on his next save.

### 4.4 `days/{barberId}_{date}` – taken time, one doc per barber per day

| Field | Type | Notes |
|---|---|---|
| `barberId`, `date` | string | must match the doc ID; never change |
| `booked` | map `"HHMM"` → bookingId | each 15-min slot a booking occupies |
| `blocked` | map `"HHMM"` → `true` | times the barber/owner blocked |
| `lastBookingId` | string | the booking this write is for (lets the rules find it with one `getAfter`) |

- Readable by everyone; it holds booking codes only, never names or phones (same as today's slots).
- Max 96 keys per map, so a few KB at most.
- A cancelled or moved-away booking's keys are removed. Done / no-show bookings keep theirs.
- The customer page listens to **one doc** for a chosen barber, or to the query
  `days where date == D` (one doc per barber) for "Any barber". Much cheaper on the free
  50k-reads/day quota than one doc per slot.
- Booking and blocking are in separate maps, so blocking can never touch a booking's slots, and
  the rules never have to loop over keys.

### 4.5 `bookings/{bookingCode}`

Today's fields, plus:

| Field | Notes |
|---|---|
| `barberId` | which barber |
| `barberName` | copied at booking time, updated on a move (My bookings, WhatsApp text, history after renames) |
| `anyBarber` | bool: customer chose "Any barber" (shown on the dashboard) |
| `movedAt` | timestamp, only on bookings the owner moved to another barber |

Composite index: `barberId ASC, date ASC` (barber's calendar).

### 4.6 `staff/{uid}` – who a login is

| Field | Type | Notes |
|---|---|---|
| `username` | string | |
| `barberId` | string | the barber this login acts as (the owner is a barber too) |
| `role` | `'owner' \| 'barber'` | **exactly one owner per shop** |
| `active` | bool | false: the rules deny everything for this login |
| `createdAt` | timestamp | |

Readable by that user (to know his role) and by the owner. Written only by the owner, who can
only create `role: 'barber'` logins and can't change his own `role` or `active` (so he can't lock
himself out). The owner's own `staff` doc is made once at bootstrap (5.5), so there is never a
second owner.

### 4.7 `usernames/{username}` – login lookup and uniqueness

`{uid, email}`. Username: `^[a-z0-9]{3,20}$`, lower-cased. Anyone can `get` one (the login form
needs it before signing in); nobody can `list` them. Created and updated only by the owner. The
doc ID being the username makes usernames unique.

### 4.8 Unchanged

`phoneLimits/{phone}_{1|2}`, `userLimits/{uid}_{1|2}` (2 upcoming bookings per phone and per
Google account, **across the whole shop**), `customers/{uid}`. The old `slots` collection is not
used on this branch.

## 5. Staff accounts (free, Spark-only)

### 5.1 Usernames on top of email/password

Firebase Auth only knows emails, so each login gets an internal email that is never shown or
mailed: `<username>.<4 random chars>@staff.invalid` (`.invalid` is a reserved domain that can
never receive mail). The login form asks for **username + password**, reads
`usernames/{username}` to get the email, then calls `signInWithEmailAndPassword`.

The random part matters: it lets a username move to a brand-new login later (forgotten password,
5.3) without colliding with the old Auth user, which can't be deleted from the browser.

### 5.2 Owner creates barber logins without being logged out

`createUserWithEmailAndPassword` signs the new user in on whatever Auth instance runs it. So the
dashboard creates accounts on a **second, throw-away Firebase app instance**
(`initializeApp(config, 'account-creator')` with in-memory persistence):

1. Owner fills in username + temporary password (≥ 8 chars) and picks the barber.
2. Second instance: create the Auth user → get its UID → sign that instance out and delete it.
3. Owner's own session (unchanged) writes, in one batch: `staff/{newUid}` and `usernames/{username}`.
   The rules accept this only from the active owner.
4. Owner gives the barber his username + temporary password; the barber changes it.

If step 3 fails, an Auth user is left with no `staff` doc: it has no access at all, and the
random email suffix means the next attempt doesn't collide.

Email/password sign-up is open to anyone who has the (public) API key, by Firebase's design.
That's harmless here: a login without an active `staff` doc written by the owner gets nothing.

### 5.3 Deactivating, and forgotten passwords

- **Deactivate a login**: owner sets `staff/{uid}.active = false`. Every rule checks `active` on
  every request, so it takes effect immediately, even for a barber who is signed in right now.
- **Deactivate a barber**: `barbers/{id}.active = false` and his login(s), in one batch. His
  upcoming bookings are then listed for the owner to move or cancel (section 7.4).
- **Forgotten password**: the free plan doesn't let the owner change another user's password, so
  the owner presses **New login** for that barber: the old login is deactivated and a new one is
  created as in 5.2, with **the same username** (`usernames/{username}` is pointed at the new
  UID/email) and a new temporary password. Same barber, same bookings, same schedule: only the
  login changed.
- **Owner forgot his password**: nobody above him can do the above, so the shop's Firebase
  console is the fallback (Authentication → that user → reset password). Documented in the
  operator notes.

### 5.4 Changing one's own password

Settings → "Change password": current password, new password twice → `reauthenticateWithCredential`
then `updatePassword`. Plain Firebase Auth, free, no rules involved.

### 5.5 The very first owner of a shop

There is no owner yet to create one. One-time manual setup in the Firebase console (console writes
bypass rules, no code or keys needed):

1. Authentication → Add user: `<username>.<random>@staff.invalid` + password. Copy the UID.
2. Firestore → create `staff/{uid}` `{username, barberId, role: 'owner', active: true}`,
   `usernames/{username}` `{uid, email}` and `barbers/{barberId}`.

In the emulator, `npm run seed` does this.

## 6. Customer flow and availability

1. **Service** (unchanged).
2. **Barber**: one card per active barber (initials circle + name, in `order`), plus **Any
   barber** first. Skipped automatically when the shop has a single active barber (Eddy).
3. **Day**: within the booking window / special period, the shop open that weekday, not a shop
   closed day; for a specific barber also a day he works and not his day off; for "Any", a day at
   least one barber works.
4. **Time**: computed per barber by `lib/slots.ts`: the overlap of the shop's and the barber's
   hours − his breaks − `booked` − `blocked` − past times, on the 15-min grid, needing all of the
   service's slots free. For "Any", a time shows if **at least one** barber has it.
5. Confirm → Google sign-in (unchanged) → name/phone → booking → confirmation with the barber's
   name → WhatsApp to `settings/shop.whatsapp`:
   "Hi *Sassine Maatouk*, I just booked with *Karim*: …".

## 7. "Any barber", concurrency and moving bookings

### 7.1 One transaction

`createBooking` runs a Firestore transaction:

1. Read `days/{b}_{date}` for every candidate barber (all active barbers for "Any", one for a
   specific barber) and the account seats, as today.
2. In the browser, keep the barbers who work then (shop + barber hours, breaks, days off) and
   have every needed slot free in both `booked` and `blocked`.
3. "Any": pick the one with the **fewest bookings that day** (distinct booking IDs in his
   `booked` map), tie → lowest `order`. Specific barber: him, or `SlotTakenError`.
4. Write the booking (`barberId`, `barberName`, `anyBarber`), the barber's day doc
   (new `booked` keys + `lastBookingId`), and the account/phone seats.

### 7.2 Why two customers can't get the same barber and time

- **Client side**: Firestore transactions are optimistic. Each doc read in step 1 is checked again
  at commit; if any changed (someone else booked that barber that day), the commit is rejected and
  the SDK re-runs the whole function with fresh data, up to 5 times. The second customer is then
  given the next free barber, or "just taken" if nobody is left.
- **Server side (the real guarantee)**: the rules only let a booking **add** keys to `booked`
  that weren't there (an existing key would be a *change*, which is denied) and, for customers,
  that aren't in `blocked`. Even a hacked client that skips the transaction can't double-book.
- Different barbers at the same time are different docs, so they never conflict.

### 7.3 What the rules don't check

The "fewest bookings" choice is made in the browser. Checking it in the rules would mean reading
every barber's day doc (5+ reads) per booking. That's acceptable: a customer who bypasses it
just gets the barber they could have picked by name anyway. Hours, days off, closed days, active
barber, window and double-booking are all still enforced.

### 7.4 Moving a booking to another barber (owner only)

Used mainly after deactivating a barber: the owner's barbers page lists that barber's upcoming
bookings, each with **Move to…** and **Cancel**. Moving keeps the same day, time and service.

1. The picker shows only barbers free for the **whole duration** at that time (and warns, but
   allows, outside the new barber's hours or over his blocked time, as walk-ins do today).
2. One transaction: read the booking (must still be `booked`), the old barber's day doc and the
   new barber's day doc; if any needed slot is taken in the new one → "no longer free", nothing
   written. Otherwise write: booking `barberId`, `barberName`, `movedAt`; the new day doc gains the
   booking's keys; the old day doc loses them; both get `lastBookingId`.
3. The rules check the same thing on the server (8.3), so even two owners' tabs moving bookings at
   once can never double-book the new barber.
4. After the move: a **WhatsApp the customer** button opens a wa.me chat to the booking's phone:
   "Hi Rami, your booking at Sassine Maatouk on Friday 24 October at 16:30 is now with Karim.
   Booking code: K7M2QX". Walk-ins without a phone get no button.

The customer's seats are unchanged (same booking, same start time).

## 8. Security rules design

### 8.1 Helpers

```
isCustomer()        Google sign-in (unchanged)
staff()             get(staff/{request.auth.uid}).data            – 1 read, staff writes only
isStaff()           password sign-in && staff().active == true
isOwner()           isStaff() && staff().role == 'owner'
actsFor(barberId)   isOwner() || (isStaff() && staff().barberId == barberId)
```

Customers never pay for `staff()`: checks are ordered so a Google sign-in short-circuits first.

### 8.2 Per collection

| Collection | Read | Write |
|---|---|---|
| `settings/shop` | everyone | owner; shape validated, `shopName` 2–40 chars and trimmed |
| `settings/branding` | everyone | owner; logo `null` or data-URL prefix + ≤ 140,000 chars, colors `#RRGGBB` |
| `barbers/{id}` | everyone | owner: everything. The barber himself: only `weeklyHours`, `daysOff` (+`updatedAt`). Either way the hours are checked against `settings/shop.openingHours` (1 `get`) |
| `days/{barberId}_{date}` | everyone | see 8.3 |
| `bookings/{code}` | customer: own; barber: `barberId == his` (queries must filter on it); owner: all | create: customer (8.4) or `actsFor(barberId)` walk-in. Update: status by `actsFor`; cancel by the booking's customer or `actsFor`; move by owner only (8.3). Never revived after cancel, never moved in time |
| `staff/{uid}` | self, owner | owner; only `role: 'barber'`; never his own `role`/`active` |
| `usernames/{u}` | `get`: everyone; `list`: nobody | owner |
| seats, `customers` | as today | as today |

### 8.3 `days` rules

- `barberId`/`date` match the doc ID and never change.
- Every write that changes `booked` sets `lastBookingId`; the rule reads that booking with
  `get` (before) and `getAfter` (after) and allows exactly one of:
  - **Add** – the booking was created in this write, *or* moved to this barber in this write
    (`movedAt == request.time`, barber before ≠ this barber, after = this barber): `booked` gets
    **only added keys**, exactly the booking's keys (built as `[k0,k1,k2,k3][0:duration/15]`);
    for customers, none of them in `blocked`.
  - **Remove** – the booking goes `booked → cancelled` in this write, *or* moves away from this
    barber in this write: `booked` loses exactly the booking's keys and nothing else changes.
- **Block/unblock** (`booked` unchanged): `actsFor(barberId)`; only `blocked` changes. Blocking
  over a booked slot is allowed but meaningless (the booking stays).
- A **move** of a booking (on `bookings/{code}`): owner; status `booked`; only `barberId`,
  `barberName`, `movedAt` change; `barberName` matches the new barber's doc; and both day docs
  have `lastBookingId == code` afterwards, so both of their rules (above) run and check the slots.

No rule ever loops over map keys; everything is a fixed number of checks.

### 8.4 Customer booking rule

Today's checks (shape, Google UID/email, code format, phone, service from `settings/shop`, start
time in the future, window/special periods, 2+2 seats), with "within hours" now checking **both**
the shop's `openingHours` and the **barber's** hours and breaks, plus: barber `active`,
`barberName == barber.name`, date not in shop `closedDays` nor in barber `daysOff`, and
`getAfter(day).lastBookingId == this booking` (the day doc's own rule then checks the slots, 8.3).

### 8.5 How it stays under the limits

**Document reads per customer booking (limit 10):**

| | Today | Planned |
|---|---|---|
| settings | 1 | 1 (`settings/shop`) |
| barber schedule | – | 1 (`barbers/{id}`) |
| slots | 4 (`slots/*`) | 1 (`days/{id}_{date}`) |
| phone + account seats | 4 | 4 |
| **total** | **9** | **7** |

**Expressions (limit 1000)**: 4 slot `getAfter`s with built paths become one `getAfter` and cheap
map lookups; the slot checks move to the day doc's own rule, which has its own budget; the shop
hours check is 3 comparisons on a doc already read; the logo and branding are never read; values
used twice are computed once and passed down (as now). Target: heaviest valid customer booking
**≤ 750 expressions** and **≤ 7 reads**, enforced by the existing "heaviest booking" padding
tests (updated), which fail if a change eats into the headroom.

Fallbacks if measurement comes in over target (in order): merge each owner's two seat docs into one
(−2 reads, fewer expressions); drop the `barberName` check (copy it unverified, display only).

Staff writes are far from the limits: a barber saving his hours costs `staff()` + `settings/shop`
(2 reads) and ~7 × 20 expressions; a move is `staff()` + the new barber + 2 day docs + the
booking (5 reads).

## 9. Admin scripts, backup and Eddy's migration (later, only with your go-ahead)

### 9.1 The admin key file

The backup and migration scripts use `firebase-admin` with a **service account key** (a JSON
file). Running them on your own computer is free; it is not Cloud Functions.

- **Lives outside the project folder**, e.g. `C:\Users\jad\firebase-keys\eddy-barbershop.json`.
  The scripts take `--key <path>` and **refuse a key path inside the project folder**.
- **Never committed**: `.gitignore` ignores `*-firebase-adminsdk-*.json`, `*service-account*.json`,
  `*serviceAccount*.json` and `firebase-keys/` anyway (added in Phase 0).
- The README (Phase 8) explains: create it (Firebase console → Project settings → Service
  accounts → Generate new private key), where to save it, and **delete it after use**: Google
  Cloud console → IAM & Admin → Service accounts → `firebase-adminsdk-…` → Keys → delete that
  key, then delete the local file. A deleted key stops working immediately.

### 9.2 Dry run first, always

Every script that writes to Firestore **runs as a dry run by default**: it reads, then prints what
it would create/update/delete (counts per collection and each document's before → after for the
first few, or all with `--verbose`) and writes nothing. Writing needs `--write`, and then you also
type the project ID to confirm. `--emulator` points a script at the emulator instead (no key).

### 9.3 Eddy's migration

Eddy keeps his current email/password account and password.

1. **Backup**: `scripts/backup.mjs` (read-only) dumps every collection to a JSON file outside the
   project. Spark has no managed export, so this is the backup.
2. **Rehearse**: load that backup into the emulator, run the migration there with `--emulator
   --write`, run the test suite and click through the site.
3. **Migrate** (quiet hour, e.g. early morning), `scripts/migrate-eddy.mjs`, dry run first:
   - `barbers/eddy` from `settings/shop.weeklyHours` (breaks included) + `daysOff`;
   - new-shape `settings/shop` (`shopName`, `openingHours` = Eddy's hours, `whatsapp` from today's
     `.env`, services, window, periods, `closedDays: []`, address, Maps link) and
     `settings/branding` from the config logo;
   - `staff/HHBoRoG4jphMLu2OjKpYTGJTKd42` = owner, barber `eddy`; `usernames/eddy` → his
     existing email (he logs in as "eddy" with his current password);
   - every booking gets `barberId: 'eddy'`, `barberName: 'Eddy'`;
   - `days/eddy_{date}` built from the `slots` docs (booked + blocked), for today onwards;
   - seats and customers stay as they are.
4. Deploy the new code + rules + indexes to `eddy-barbershop` right after the script. Customers
   with an old page open get a "please refresh" error for a booking attempt in between (rules
   refuse it, nothing is corrupted); `index.html` is `no-cache`, so the next load is the new site.
5. Check, delete the admin key (9.1), and delete the old `slots` docs a week later.

Rollback: redeploy `main` (old rules + site); the migration only **adds** fields/docs, so the old
site still works on the migrated data, except bookings made on the new site in between, which
have no `slots` docs (re-created by a small rollback script if ever needed).

## 10. Risks

| Risk | Mitigation |
|---|---|
| Accidentally deploying this branch to Eddy's project, or using his data | No `default` alias; `npm run deploy` disabled until Phase 7; Vite refuses non-`demo-` projects; emulator guard in `firebase.ts` |
| Rules cost creeps over the limit as features are added | Budgeted reads (7/10) and expressions (≤750/1000), enforced by tests on every run |
| Day doc contention (many bookings for one barber at once) | Firestore handles ~1 write/sec per doc; a shop's peak is far below. Transactions retry automatically |
| "Fewest bookings" not enforced server-side | Acceptable by design (7.3) |
| Usernames can't be renamed once used for a login in Auth | Internal email has a random suffix; username docs can be re-pointed |
| Forgotten password needs a new login | By design on Spark (5.3); owner's own password via console |
| Open email/password sign-up (Firebase default) | Harmless: no active `staff` doc → no access. Tested |
| Owner deactivates/demotes himself, or creates a second owner | Rules forbid it. Tested |
| Owner narrows shop hours below barbers' hours | Bookings checked against both; settings page lists conflicts and offers trimming (4.3) |
| Moving a booking onto a busy barber | Transaction + day-doc rules: only free slots can be added (7.4, 8.3) |
| Logo/colors make the page unreadable or heavy | ≤ 512 px / < 100 KB, type and size checked by rules; preview; contrast warning; reset |
| Link preview shows the config logo, not the owner's new one | By design (crawlers don't run JS); change the config and redeploy |
| Admin key file leaks | Outside the project, gitignored anyway, scripts refuse in-project paths, deleted after use |
| A migration script writes something wrong | Dry run by default, rehearsal on the emulator, JSON backup first |
| Spark quotas (50k reads, 20k writes/day) | Day docs cut reads per page view roughly 10×; typical shop uses a few % |
| Google limits how many projects one account can create | One project per shop; ask for a free quota increase if needed |
| Rules assume Lebanon time (UTC+2/+3) | Same as today; a shop outside Lebanon would need a rules constant |
| Old browser tabs during Eddy's migration | Rules refuse their writes safely; refresh fixes it |
| App Check per shop | Each project needs its own key; optional, rules protect data regardless |

## 11. Build order

Each phase ends with commands you can run. Every phase keeps `npm run build`, `npm run lint`,
`npm test` and `npm run test:emu` green.

**Phase 0 – Safety and scaffolding** ✅
`demo-barbershop` emulator config (`.env.emulator`), Auth emulator, emulator connection guard in
`firebase.ts`, Vite refusing real projects, `.firebaserc` without default, `npm run deploy`
disabled, admin-key `.gitignore` rules, scripts (`emu`, `dev`, `test:emu`).
*Test:* see `docs/DEVELOPMENT.md`, "Multi-barber branch".

**Phase 1 – Data model and pure logic**
New types and doc converters (shop incl. opening hours and name, branding, barber, day),
per-barber availability (shop ∩ barber hours), "Any barber" union, assignment choice (fewest
bookings, tie → order), initials, barber-hours-fit-shop check and trimming, logo compression
size logic.
*Test:* `npm test` – unit tests for availability with breaks/days off/closed days/blocks/shop
hours, Any union, assignment ties, trimming.

**Phase 2 – Security rules**
New `firestore.rules`: staff/roles, usernames, barbers (incl. hours inside shop hours), days,
bookings (incl. moves), settings, branding.
*Test:* `npm run test:emu` – allow/deny tests per role (customer, barber, owner, inactive login,
random password account): double-booking, blocked slots, cancel releases slots, moves only onto
free slots, barber can't touch another barber, barber can't set hours outside the shop's, only the
owner changes shop name/logo (valid/too long/too big/bad prefix/`null`), no second owner, owner
can't demote himself, heaviest-booking cost tests (≤750 expressions, ≤7 reads).

**Phase 3 – Data layer**
`api.ts`: subscriptions (shop, branding, barbers, days, bookings by barber), `createBooking`
(specific and Any), cancel, status, walk-ins, block/unblock, hours, days off, move, settings and
branding, account creation on a second app instance, new login, deactivate. `npm run seed`.
*Test:* `npm run test:emu` – including concurrency: 6 customers book "Any" at the same time with
5 free barbers → 5 succeed on 5 different barbers, 1 gets "taken"; two customers book the same
barber at the same time → exactly one wins; two moves onto the same free slot → exactly one wins;
owner creates a login and is still signed in as owner.

**Phase 4 – Customer flow**
Barber step with initials cards + Any, per-barber times, shop name/logo in header and tab title,
confirmation and WhatsApp with shop and barber name, My bookings shows barber.
*Test:* `npm test`; manual checklist on `npm run dev` with seeded data, on a phone-sized window.

**Phase 5 – Staff login and barber dashboard**
Username login, role routing, Today / Calendar for his bookings, done/no-show, walk-ins, cancel,
his weekly hours and breaks, days off, blocked times, change password.
*Test:* `npm run test:emu`; manual: log in as a seeded barber, confirm he sees and can change
only his own data and can't set hours outside the shop's.

**Phase 6 – Owner dashboard**
All-barbers view and barber switcher, barbers page (add, order, hours, activate/deactivate, list
and move or cancel a deactivated barber's bookings, WhatsApp the customer after a move), accounts
(create login, new login, deactivate), shop settings: name, opening hours (with conflict list and
trimming), WhatsApp, closed days, logo upload with preview and remove, colors.
*Test:* `npm run test:emu`; manual: full owner checklist, including the forgotten-password flow
and moving a booking.

**Phase 7 – Per-shop build and deploy pipeline**
`.env.eddy`, `.env.sassine`, `shops/<shop>/logo.png`, link-preview tags, `firebase.template.json`,
`scripts/deploy.mjs` with `--dry-run`, Vite allow-list for shop modes, operator docs.
*Test:* `npm run build -- --mode sassine` and `--mode eddy` succeed with the right project IDs and
`og:` tags; `node scripts/deploy.mjs sassine --dry-run` prints the config and commands only.

**Phase 8 – Admin scripts and Eddy migration**
`scripts/backup.mjs`, `scripts/migrate-eddy.mjs` (dry run by default, `--write` + typed
confirmation, `--emulator`, refuses in-project key paths), README section on the key file.
*Test:* `npm run test:emu` – migration test loads Eddy-shaped fixture data (today's format) into
the emulator, checks the dry run writes nothing, migrates, then checks his bookings, blocks and
hours, and that his old login works as owner "eddy".

**Phase 9 – Go-live (only when you say so)**
Create Sassine's project and deploy; later back up, rehearse and migrate Eddy.

## 12. Decisions

1. Barbers edit their own weekly hours, breaks, days off and blocked times. Their hours must stay
   inside the shop's opening hours, and shop closed days always win.
2. Exactly one owner per shop.
3. A deactivated barber's upcoming bookings are listed for the owner, who moves each one to
   another barber (transaction, whole duration free, never double-booked) and then can WhatsApp
   the customer, or cancels it.
4. Shop name and logo are edited by the owner in Settings (rules + tests); the per-shop config only
   holds the initial values and the link preview.
5. The admin key lives outside the project, is gitignored anyway and deleted after use; scripts
   dry-run by default.
