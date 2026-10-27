// Each shop's config: shops/<shop>/.env (Firebase web config, public by design, plus the shop's
// first name and site address), shops/<shop>/logo.png, and its alias in .firebaserc (shop name →
// Firebase project). Used by vite.config.ts (`--mode <shop>`), scripts/deploy.mjs and
// scripts/setup-shop.mjs. See README, "Adding a new shop".
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { shopAliases } from './deployTargets.mjs';

export const SHOPS_DIR = 'shops';
/** shops/_template: copied by `npm run new-shop`, never a shop itself. */
export const TEMPLATE = '_template';

/** A shop's name on the command line and its folder: lower-case letters, digits and dashes. */
export const SHOP_NAME = /^[a-z][a-z0-9-]{1,29}$/;

/** What every shop's .env must set (VITE_RECAPTCHA_ENTERPRISE_KEY may stay empty: App Check off). */
export const REQUIRED_ENV = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_SHOP_NAME',
  'VITE_SITE_URL',
];

/** The shops: every folder in shops/ but the template. */
export function listShops(root = '.') {
  const dir = join(root, SHOPS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== TEMPLATE && SHOP_NAME.test(d.name))
    .map((d) => d.name)
    .sort();
}

/** KEY=value lines (# comments, blank lines and surrounding quotes allowed), like Vite reads them. */
export function parseEnv(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}

/**
 * Everything wrong with shop `shop`'s config, as messages (empty when it's ready to build and
 * deploy): its folder and .env, the required values, a real (not demo-) project that is the one
 * its .firebaserc alias points at, an https site address, and its logo.
 */
export function shopProblems(shop, { env, alias, hasLogo }) {
  if (!SHOP_NAME.test(shop)) return [`"${shop}" isn't a shop name (lower-case letters, digits, dashes).`];
  if (!env) return [`${SHOPS_DIR}/${shop}/.env is missing. Start one with: npm run new-shop -- ${shop} <project-id>`];
  const problems = REQUIRED_ENV.filter((k) => !env[k] || env[k].includes('<')).map(
    (k) => `${SHOPS_DIR}/${shop}/.env: fill in ${k}.`,
  );
  const project = env.VITE_FIREBASE_PROJECT_ID;
  if (project?.startsWith('demo-')) problems.push(`${shop} uses the emulator-only project ${project}.`);
  if (!alias) {
    problems.push(`.firebaserc has no alias "${shop}". Add  "${shop}": "${project || '<project-id>'}"  under "projects".`);
  } else if (project && alias !== project) {
    problems.push(`.firebaserc says ${shop} is ${alias}, but ${SHOPS_DIR}/${shop}/.env says ${project}.`);
  }
  if (env.VITE_SITE_URL && !/^https:\/\/[^/\s]+$/.test(env.VITE_SITE_URL)) {
    problems.push(`VITE_SITE_URL must be like https://${project || 'my-shop'}.web.app (no path, no trailing slash).`);
  }
  if (!hasLogo) problems.push(`${SHOPS_DIR}/${shop}/logo.png is missing (the link-preview image and first logo).`);
  return problems;
}

/** Reads shop `shop`'s config from disk: its env (or null), its .firebaserc alias and logo. */
export function readShop(shop, root = '.') {
  const dir = join(root, SHOPS_DIR, shop);
  const envPath = join(dir, '.env');
  const env = SHOP_NAME.test(shop) && existsSync(envPath) ? parseEnv(readFileSync(envPath, 'utf8')) : null;
  const rc = join(root, '.firebaserc');
  const alias = existsSync(rc) ? shopAliases(readFileSync(rc, 'utf8'))[shop] : undefined;
  const logoPath = join(dir, 'logo.png');
  return { shop, dir, env, alias, logoPath, hasLogo: existsSync(logoPath) };
}

/** Placeholders in firebase.json's Content-Security-Policy, filled in per shop at deploy time. */
export const CSP_PLACEHOLDERS = { authDomain: '__AUTH_DOMAIN__', project: '__PROJECT_ID__' };

/**
 * The shop's own firebase.json for deploying: firebase.json with the shop's sign-in domains in
 * the Content-Security-Policy (Google sign-in opens a frame on the auth domain and on
 * <project>.firebaseapp.com). Throws if firebase.json has no placeholders to fill.
 */
export function firebaseConfigFor(firebaseJsonText, { authDomain, project }) {
  if (!firebaseJsonText.includes(CSP_PLACEHOLDERS.authDomain) || !firebaseJsonText.includes(CSP_PLACEHOLDERS.project)) {
    throw new Error(`firebase.json's Content-Security-Policy needs ${CSP_PLACEHOLDERS.authDomain} and ${CSP_PLACEHOLDERS.project}.`);
  }
  const config = JSON.parse(
    firebaseJsonText.replaceAll(CSP_PLACEHOLDERS.authDomain, authDomain).replaceAll(CSP_PLACEHOLDERS.project, project),
  );
  // The emulator settings don't belong in a deploy.
  delete config.emulators;
  return config;
}
