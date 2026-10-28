// What scripts/deploy.mjs, scripts/deploy-guard.mjs and vite.config.ts check so a shop's deploy
// can only ever contain this (multi-barber) code, built with that shop's own config.
//
// Why: on 2026-10-28 a branch switch in the same folder, in the middle of `npm run deploy --
// sassine`, made its build step use the old single-barber code, whose Vite config loaded the root
// .env.local (Eddy's live config); Eddy's site was deployed to Sassine's project. Deploys now run
// in a frozen copy of one commit (a git worktree), and these checks refuse anything else.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOCKED_PROJECTS } from './deployTargets.mjs';
import { listShops, parseEnv, SHOPS_DIR } from './shops.mjs';

/** Files only the multi-barber code has: a copy without them is some other version. */
export const MULTI_BARBER_FILES = [
  'scripts/deploy.mjs',
  'scripts/deploy-guard.mjs',
  'scripts/deployChecks.mjs',
  'scripts/deployTargets.mjs',
  'scripts/shops.mjs',
  'src/lib/barberDoc.ts',
  'firestore.indexes.json',
];

/** The config values that identify a Firebase project in a built site. */
export const IDENTIFYING_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_AUTH_DOMAIN',
];

/** The emulator-only project (.env.emulator): never in a shop's build. */
const EMULATOR_PROJECT = 'demo-barbershop';

/** Uncommitted changes, from `git status --porcelain` (ignored files, like .env.local, aren't listed). */
export function uncommittedProblems(porcelain) {
  const lines = porcelain.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const shown = lines.slice(0, 8).map((l) => `    ${l}`);
  if (lines.length > 8) shown.push(`    … and ${lines.length - 8} more`);
  return [`there are uncommitted changes; a deploy is always one commit. Commit or stash them first:\n${shown.join('\n')}`];
}

/** What's wrong with the code in `dir` (a copy of the commit to deploy), if it isn't the multi-barber code. */
export function codeProblems(dir) {
  const problems = MULTI_BARBER_FILES.filter((f) => !existsSync(join(dir, f))).map(
    (f) => `${f} is missing: this isn't the multi-barber code.`,
  );
  const rules = join(dir, 'firestore.rules');
  if (!existsSync(rules) || !readFileSync(rules, 'utf8').includes('match /days/{dayId}')) {
    problems.push("firestore.rules isn't the multi-barber rules (no days/{dayId}).");
  }
  return problems;
}

/**
 * Ways something other than shops/<shop>/.env could reach a shop's build: VITE_ variables in the
 * environment (Vite puts them in the site, over the .env files), and other env files in the
 * shop's folder (Vite also reads .env.local and .env.<mode>[.local] there; .env.local holds the
 * App Check debug token).
 */
export function envLeakProblems({ processEnv, shopDir, shopDirFiles }) {
  const problems = Object.keys(processEnv)
    .filter((k) => k.startsWith('VITE_'))
    .map((k) => `${k} is set in the environment; Vite would build it into the site. Unset it.`);
  for (const file of shopDirFiles) {
    if (file.startsWith('.env') && file !== '.env') {
      problems.push(`${shopDir}/${file} would be built into the site too. A shop builds from ${shopDir}/.env only.`);
    }
  }
  return problems;
}

/** The files in a shop's folder (for envLeakProblems). */
export function shopDirFiles(root, shop) {
  const dir = join(root, SHOPS_DIR, shop);
  return existsSync(dir) ? readdirSync(dir) : [];
}

/**
 * The identifying values of every config but `shop`'s: the other shops, the emulator, locked
 * projects, and the root env files (.env.local is Eddy's live config). None may appear in
 * `shop`'s build. `extraEnvTexts`: env files from outside `root` (the repository folder's
 * untracked .env.local, when `root` is a frozen copy without it).
 */
export function foreignValues(root, shop, extraEnvTexts = []) {
  const own = parseEnv(readFileSync(join(root, SHOPS_DIR, shop, '.env'), 'utf8'));
  const envTexts = [...extraEnvTexts];
  for (const other of listShops(root).filter((s) => s !== shop)) {
    const path = join(root, SHOPS_DIR, other, '.env');
    if (existsSync(path)) envTexts.push(readFileSync(path, 'utf8'));
  }
  for (const file of readdirSync(root).filter((f) => f.startsWith('.env'))) {
    envTexts.push(readFileSync(join(root, file), 'utf8'));
  }
  const values = new Set([EMULATOR_PROJECT, ...LOCKED_PROJECTS]);
  for (const env of envTexts.map(parseEnv)) {
    for (const key of IDENTIFYING_KEYS) if (env[key] && !env[key].includes('<')) values.add(env[key]);
  }
  // The shop's own values are expected (another file may share one, e.g. a placeholder domain).
  for (const key of IDENTIFYING_KEYS) values.delete(own[key]);
  return [...values].filter(Boolean);
}

/**
 * What's wrong with a built site (its index.html and JavaScript, as one text) for shop `env`:
 * it must contain the shop's API key, project and app ID, and none of `foreign`.
 */
export function bundleProblems(bundle, env, foreign) {
  const problems = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID']
    .filter((k) => !bundle.includes(env[k]))
    .map((k) => `the build doesn't contain the shop's ${k} (${env[k]}).`);
  for (const value of foreign) {
    if (bundle.includes(value)) problems.push(`the build contains "${shortened(value)}", which belongs to another config.`);
  }
  return problems;
}

/** An API key is shown by its start only. */
const shortened = (value) => (value.startsWith('AIza') ? `${value.slice(0, 8)}…` : value);

/** dist/index.html and every .js file under dist/, as one text. */
export function readBuild(distDir) {
  const parts = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.js') || entry.name.endsWith('.html')) parts.push(readFileSync(path, 'utf8'));
    }
  };
  if (existsSync(distDir)) walk(distDir);
  return parts.join('\n');
}
