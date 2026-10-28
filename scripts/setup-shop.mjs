// `npm run setup-shop -- <shop> --key <admin key file> --username <owner> --owner-name "<name>"
//   [--whatsapp <number>] [--write]`
// The one-time setup of a new shop's Firestore and its owner's login (scripts/shopSetup.ts),
// with the Firebase Admin SDK and the project's admin key (README, "Adding a new shop").
//
// - A dry run unless --write: it reads the project and prints what it would create.
// - --write asks for the owner's password (twice, hidden: never on the command line, where it
//   would stay in the shell history) and for the project ID to confirm.
// - The key file must be outside the project folder, and for this shop's project; locked
//   projects (Eddy's) are refused.
// - --emulator runs against the local emulators (`npm run emu`) instead, with no key: a rehearsal.
import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { emitKeypressEvents } from 'node:readline';
import { createInterface } from 'node:readline/promises';
import { createServer } from 'vite';
import { LOCKED_PROJECTS } from './deployTargets.mjs';
import { readShop, SHOP_NAME } from './shops.mjs';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : undefined;
};
const shop = argv[0] && !argv[0].startsWith('--') ? argv[0] : undefined;
const emulator = flag('emulator');
const write = flag('write');

function fail(message) {
  console.error(`\nSetup refused: ${message}\nNothing was written.\n`);
  process.exit(1);
}

const usage =
  'npm run setup-shop -- <shop> --key <path to admin key> --username <owner username> --owner-name "<owner name>" [--whatsapp <number>] [--write]';
if (!shop || !SHOP_NAME.test(shop)) fail(`name the shop.\n  ${usage}`);
const config = readShop(shop);
if (!config.env) fail(`shops/${shop}/.env is missing. Start one with: npm run new-shop -- ${shop} <project-id>`);
const shopName = config.env.VITE_SHOP_NAME ?? '';
if (!shopName || shopName.includes('<')) fail(`set VITE_SHOP_NAME in shops/${shop}/.env.`);
const username = option('username');
const ownerName = option('owner-name');
if (!username || !ownerName) fail(`give the owner's username and name.\n  ${usage}`);

let project;
let key;
if (emulator) {
  project = 'demo-barbershop';
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
} else {
  const keyPath = option('key');
  if (!keyPath) fail(`give the admin key file: --key <path> (README, "Adding a new shop").\n  ${usage}`);
  const abs = resolve(keyPath);
  if (abs.startsWith(resolve('.') + sep)) {
    fail('the admin key file is inside the project folder. Move it outside (e.g. C:\\Users\\<you>\\firebase-keys\\), and delete it after the setup.');
  }
  try {
    key = JSON.parse(readFileSync(abs, 'utf8'));
  } catch {
    fail(`can't read the admin key file ${abs}.`);
  }
  project = key.project_id;
  if (!project || !key.private_key) fail(`${abs} isn't a Firebase admin key (Project settings → Service accounts).`);
  if (LOCKED_PROJECTS.includes(project)) fail(`${project} is locked until its migration (Eddy's live site, which runs the single-barber code from the eddy-single-barber branch).`);
  if (config.alias !== project) {
    fail(`the key is for ${project}, but .firebaserc says ${shop} is ${config.alias ?? '(no alias)'}.`);
  }
  if (config.env.VITE_FIREBASE_PROJECT_ID !== project) {
    fail(`the key is for ${project}, but shops/${shop}/.env says ${config.env.VITE_FIREBASE_PROJECT_ID}.`);
  }
}

/** Asks for a password without showing it. */
async function askHidden(prompt) {
  process.stdout.write(prompt);
  const stdin = process.stdin;
  emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((done, abort) => {
    let value = '';
    const onKey = (char, key) => {
      if (key?.ctrl && key.name === 'c') {
        stdin.setRawMode(false);
        abort(new Error('cancelled'));
      } else if (key?.name === 'return' || key?.name === 'enter') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off('keypress', onKey);
        process.stdout.write('\n');
        done(value);
      } else if (key?.name === 'backspace') {
        value = value.slice(0, -1);
      } else if (char && !key?.ctrl) {
        value += char;
      }
    };
    stdin.on('keypress', onKey);
  });
}

const server = await createServer({
  configFile: false,
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
  logLevel: 'error',
});
let app;
try {
  const { initializeApp, cert, deleteApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const { getAuth } = await import('firebase-admin/auth');
  const setup = await server.ssrLoadModule('/scripts/shopSetup.ts');

  app = initializeApp(emulator ? { projectId: project } : { credential: cert(key), projectId: project }, `setup-${shop}`);
  const db = getFirestore(app);
  const logo = config.hasLogo ? setup.logoDataUrl(readFileSync(config.logoPath)) : null;
  const plan = await setup.planSetup(db, { shopName, ownerName, username, whatsapp: option('whatsapp') ?? '', logo });

  console.log(`\nSetting up shop "${shop}" in ${emulator ? 'the emulators (demo-barbershop)' : `Firebase project ${project}`}:`);
  for (const { path } of plan.docs) console.log(`  create ${path}`);
  console.log(`  create the owner's login: username "${plan.username}", staff (role owner, barber "${plan.barber.id}"), usernames/${plan.username}`);
  console.log(`\n  Shop name:     ${plan.shop.shopName}`);
  console.log(`  Owner:         ${plan.barber.name}`);
  console.log(`  WhatsApp:      ${plan.shop.whatsapp || '(none yet)'}`);
  console.log(`  Services:      ${plan.shop.services.map((s) => `${s.name} ${s.durationMinutes} min $${s.price}`).join(', ')}`);
  console.log(`  Opening hours: 10:00–20:00 every day (the owner changes them in Settings → Shop)`);
  console.log(`  Logo:          ${logo ? `${config.logoPath} (${Math.round(logo.length / 1024)} KB)` : 'none'}`);
  for (const note of plan.notes) console.log(`  Note: ${note}`);

  if (plan.problems.length) fail(plan.problems.join('\n  '));
  if (!write) {
    console.log('\nDry run: nothing was written. Run it again with --write to create all of this.\n');
  } else {
    if (!process.stdin.isTTY) fail('--write needs a terminal, to type the password and confirm.');
    const password = await askHidden(`\nThe owner's password (at least 8 characters): `);
    if (password.length < 8) fail('the password needs at least 8 characters.');
    if ((await askHidden('Again: ')) !== password) fail("the passwords don't match.");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const typed = (await rl.question(`Type the project ID (${project}) to write: `)).trim();
    rl.close();
    if (typed !== project) fail('not confirmed.');
    await setup.applySetup(db, getAuth(app), plan, password);
    console.log(`
Done. ${plan.barber.name} logs in at ${config.env.VITE_SITE_URL ?? 'the site'}/admin as "${plan.username}" with that password.
${emulator ? '' : 'Now delete the admin key (README, "Adding a new shop", step 6).\n'}`);
  }
  await deleteApp(app);
} catch (err) {
  console.error(err);
  if (emulator) console.error('Is `npm run emu` running?');
  process.exitCode = 1;
} finally {
  await server.close();
}
