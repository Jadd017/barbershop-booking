// `npm run screenshots`: the README's pictures (docs/screenshots/*.webp), taken with Playwright from
// the demo shop (scripts/demoShop.ts) on the Firebase emulators. Never a real project: the site is
// built in emulator mode (a demo- project, checked below), and the data only goes to the emulators.
//
// Uses the emulators if they're running (`npm run emu`; their data is wiped and the demo shop
// seeded, as `npm run seed` does), or starts its own for the run. The browser's clock is fixed at
// 13:40 shop time, today or the next day all six barbers work, and the demo shop is seeded for that moment,
// so the pictures come out the same whenever this runs.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const OUT_DIR = 'docs/screenshots';
const PORT = 5180;
// The browser's time of day, shop time: Karim's next customer is due in 20 minutes.
const TIME = '13:40';
const BASE = `http://127.0.0.1:${PORT}`;
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 };
// A made-up customer (the Auth emulator's Google sign-in takes any details).
const CUSTOMER = { email: 'rayan.khalil@example.com', displayName: 'Rayan Khalil', name: 'Rayan', phone: '70 123 456' };

/** True if something is listening on 127.0.0.1:port. */
function listening(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

// The emulators (ports from firebase.json): the running ones, or our own for this run.
const [firestoreUp, authUp] = await Promise.all([listening(8080), listening(9099)]);
if (!firestoreUp || !authUp) {
  if (process.env.SCREENSHOTS_EMULATORS || firestoreUp || authUp) {
    console.error('Needs both the Auth (9099) and Firestore (8080) emulators. Stop `npm run emu` or start it fully.');
    process.exit(1);
  }
  const run = spawnSync(
    'firebase emulators:exec --project demo-barbershop --only auth,firestore "node scripts/screenshots.mjs"',
    { stdio: 'inherit', shell: true, env: { ...process.env, SCREENSHOTS_EMULATORS: '1' } },
  );
  process.exit(run.status ?? 1);
}

const server = await createServer({
  mode: 'emulator',
  server: { host: '127.0.0.1', port: PORT, strictPort: true },
  logLevel: 'warn',
});
let browser;
try {
  const env = server.config.env;
  if (env.VITE_USE_EMULATOR !== 'true' || !env.VITE_FIREBASE_PROJECT_ID?.startsWith('demo-')) {
    throw new Error(`Refusing: the site isn't on the emulator (project "${env.VITE_FIREBASE_PROJECT_ID}").`);
  }
  await server.listen();

  const load = (path) => server.ssrLoadModule(path);
  const { SHOP_TIME_ZONE } = await load('/src/config.ts');
  const { addDays, zonedInstant } = await load('/src/lib/time.ts');
  const { weekdayIndex } = await load('/src/lib/schedule.ts');
  const { seedDemoShop, demoDayAfter, DEMO_PASSWORD } = await load('/scripts/demoShop.ts');

  // Tuesday to Saturday, when all six barbers work (closed on Sundays, Elie is off on Mondays).
  let day = new Intl.DateTimeFormat('en-CA', { timeZone: SHOP_TIME_ZONE }).format(new Date());
  while ([0, 6].includes(weekdayIndex(day))) day = addDays(day, 1);
  const now = zonedInstant(day, TIME, SHOP_TIME_ZONE);
  await seedDemoShop(now);

  browser = await chromium.launch();
  mkdirSync(OUT_DIR, { recursive: true });

  /** A browser context at the fixed time, in the shop's time zone, optionally in Arabic. */
  async function newContext(device, language = 'en') {
    const context = await browser.newContext({ ...device, timezoneId: SHOP_TIME_ZONE, locale: 'en-US' });
    await context.clock.setFixedTime(now);
    await context.addInitScript((lang) => localStorage.setItem('language', lang), language);
    // The confirmation hands off to WhatsApp: answered with "No Content", so the page stays.
    await context.route(/^https:\/\/wa\.me\//, (route) => route.fulfill({ status: 204 }));
    // The page's errors, for when a step times out.
    context.on('console', (msg) => msg.type() === 'error' && console.error(`[browser] ${msg.text()}`));
    return context;
  }

  /** Waits for the page to finish loading (data and fonts). */
  async function settled(page) {
    await page.waitForFunction(() => !/Loading…|جارٍ التحميل…/.test(document.body.innerText));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
  }

  /** Scrolls so `locator` is near the top of the screen. */
  async function scrollTo(locator) {
    await locator.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 12));
    await locator.page().waitForTimeout(200);
  }

  /** Saves what's on screen as WebP (Chromium's own encoder: small, and no extra dependency). */
  const encoder = await (await browser.newContext()).newPage();
  async function shot(page, name) {
    const png = await page.screenshot({ animations: 'disabled', caret: 'hide' });
    const webp = await encoder.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const canvas = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
      canvas.getContext('2d').drawImage(img, 0, 0);
      return canvas.toDataURL('image/webp', 0.85).split(',')[1];
    }, png.toString('base64'));
    const file = `${OUT_DIR}/${name}.webp`;
    writeFileSync(file, Buffer.from(webp, 'base64'));
    console.log(`${file} (${Math.round(Buffer.byteLength(webp, 'base64') / 1024)} KB)`);
  }

  const section = (page, n) => page.locator('main > section').nth(n);

  // Customer: service, barber, time, sign-in, confirmation, my bookings.
  {
    const context = await newContext(PHONE);
    const page = await context.newPage();
    await page.goto(BASE);
    await settled(page);
    await shot(page, 'customer-1-service');

    await page.locator('button[aria-pressed]', { hasText: 'Haircut' }).first().click();
    await scrollTo(section(page, 1));
    await shot(page, 'customer-2-barber');

    await page.locator('button[aria-pressed]', { hasText: 'Karim Haddad' }).click();
    // The demo day, the day after the clock's: Karim already has bookings at 10:00 and 11:00.
    await section(page, 2).locator('button:not([disabled])').nth(1).click();
    await page.getByRole('button', { name: '12:00', exact: true }).click();
    await scrollTo(section(page, 2));
    await shot(page, 'customer-3-time');

    // The Auth emulator's stand-in for Google sign-in.
    const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'Book now' }).click()]);
    await popup.waitForLoadState();
    // Its button does nothing until the page's script is ready: tap until the form opens.
    const email = popup.locator('#email-input');
    for (let tries = 0; !(await email.isVisible()); tries++) {
      if (tries === 20) throw new Error("The Auth emulator's sign-in form didn't open.");
      await popup.locator('#add-account-button').click();
      await email.waitFor({ timeout: 1000 }).catch(() => {});
    }
    await email.fill(CUSTOMER.email);
    await popup.locator('#display-name-input').fill(CUSTOMER.displayName);
    await popup.locator('#sign-in').click();
    await page.getByLabel('Name').fill(CUSTOMER.name);
    await page.getByLabel('Phone').fill(CUSTOMER.phone);
    await page.locator('form button[type="submit"]').click();
    await page.waitForFunction(() => /booking code/i.test(document.body.innerText));
    await page.evaluate(() => window.scrollTo(0, 0));
    await settled(page);
    await shot(page, 'customer-4-confirmation');

    await page.goto(`${BASE}/my-bookings`);
    await settled(page);
    await page.getByText('Karim Haddad').first().waitFor();
    await shot(page, 'customer-5-my-bookings');
    await context.close();
  }

  // Customer, in Arabic.
  {
    const context = await newContext(PHONE, 'ar');
    const page = await context.newPage();
    await page.goto(BASE);
    await settled(page);
    await section(page, 0).locator('button[aria-pressed]').first().click();
    await section(page, 1).locator('button[aria-pressed]').nth(2).click();
    await page.waitForFunction(() => getComputedStyle(document.body).fontFamily.includes('Cairo'));
    await settled(page);
    await shot(page, 'customer-6-arabic');
    await context.close();
  }

  /** A staff member's dashboard, signed in. */
  async function staffPage(device, username) {
    const context = await newContext(device);
    const page = await context.newPage();
    await page.goto(`${BASE}/admin`);
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Password').fill(DEMO_PASSWORD);
    await page.locator('form button[type="submit"]').click();
    await page.getByRole('navigation').waitFor();
    await settled(page);
    // The day's numbers are in.
    await page.waitForFunction(() => ![...document.querySelectorAll('dd')].some((d) => d.textContent === '–'));
    return { context, page };
  }

  // A barber: his Today.
  {
    const { context, page } = await staffPage(PHONE, 'karim');
    await shot(page, 'barber-1-today');
    await context.close();
  }

  // The owner: barbers, shop settings, then every barber's day on a wide screen.
  {
    const { context, page } = await staffPage(PHONE, 'tony');
    await page.getByRole('navigation').getByRole('button', { name: 'Barbers' }).click();
    await page.getByText('Karim Haddad').first().waitFor();
    await settled(page);
    await shot(page, 'owner-1-barbers');
    await page.getByRole('navigation').getByRole('button', { name: 'Settings' }).click();
    await settled(page);
    await shot(page, 'owner-2-shop-settings');
    await context.close();
  }
  {
    const { context, page } = await staffPage(DESKTOP, 'tony');
    await shot(page, 'owner-3-all-barbers-desktop');
    await context.close();
  }
  console.log(`Taken at ${day} ${TIME} (${SHOP_TIME_ZONE}), the demo shop's next day ${demoDayAfter(day)}.`);
} catch (err) {
  // What each open page showed when it failed.
  for (const [i, page] of (browser?.contexts() ?? []).flatMap((c) => c.pages()).entries()) {
    const file = join(tmpdir(), `screenshots-failed-${i}.png`);
    await page.screenshot({ path: file }).catch(() => {});
    console.error(`${page.url()}: ${file}`);
  }
  throw err;
} finally {
  await browser?.close();
  await server.close();
}
