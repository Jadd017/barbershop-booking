import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { LOCKED_PROJECTS } from './deployTargets.mjs';
import { firebaseConfigFor, listShops, parseEnv, readShop, shopProblems } from './shops.mjs';

const READY = {
  VITE_FIREBASE_API_KEY: 'AIzaSyExample',
  VITE_FIREBASE_AUTH_DOMAIN: 'sassine-maatouk.web.app',
  VITE_FIREBASE_PROJECT_ID: 'sassine-maatouk',
  VITE_FIREBASE_STORAGE_BUCKET: 'sassine-maatouk.firebasestorage.app',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '123456789',
  VITE_FIREBASE_APP_ID: '1:123456789:web:abc',
  VITE_SHOP_NAME: 'Sassine Maatouk',
  VITE_SITE_URL: 'https://sassine-maatouk.web.app',
};

describe('parseEnv', () => {
  it('reads KEY=value lines, skipping comments and blank lines', () => {
    expect(parseEnv('# a comment\nA=1\n\nB = two words \r\nC="quoted"\nnot a line\nD=')).toEqual({
      A: '1',
      B: 'two words',
      C: 'quoted',
      D: '',
    });
  });

  it('reads the template', () => {
    const env = parseEnv(readFileSync('shops/_template/.env', 'utf8'));
    expect(env.VITE_FIREBASE_PROJECT_ID).toBe('<project-id>');
    expect(env.VITE_RECAPTCHA_ENTERPRISE_KEY).toBe('');
  });
});

describe('shopProblems', () => {
  const ready = { env: READY, alias: 'sassine-maatouk', hasLogo: true };

  it('is empty for a complete shop', () => {
    expect(shopProblems('sassine', ready)).toEqual([]);
  });

  it('needs the .env, every value filled in, and the logo', () => {
    expect(shopProblems('sassine', { ...ready, env: null })[0]).toMatch(/shops\/sassine\/\.env is missing/);
    const half = { ...READY, VITE_FIREBASE_API_KEY: '<apiKey>', VITE_SHOP_NAME: '' };
    expect(shopProblems('sassine', { ...ready, env: half })).toEqual([
      'shops/sassine/.env: fill in VITE_FIREBASE_API_KEY.',
      'shops/sassine/.env: fill in VITE_SHOP_NAME.',
    ]);
    expect(shopProblems('sassine', { ...ready, hasLogo: false })[0]).toMatch(/logo\.png is missing/);
  });

  it("needs the .firebaserc alias to be the .env's project", () => {
    expect(shopProblems('sassine', { ...ready, alias: undefined })[0]).toMatch(/no alias "sassine"/);
    expect(shopProblems('sassine', { ...ready, alias: 'example-other-project' })[0]).toMatch(
      /says sassine is example-other-project, but .* says sassine-maatouk/,
    );
  });

  it('refuses emulator projects, bad site addresses and bad shop names', () => {
    const demo = { ...READY, VITE_FIREBASE_PROJECT_ID: 'demo-barbershop' };
    expect(shopProblems('sassine', { ...ready, env: demo, alias: 'demo-barbershop' })[0]).toMatch(/emulator-only/);
    const site = { ...READY, VITE_SITE_URL: 'https://sassine-maatouk.web.app/' };
    expect(shopProblems('sassine', { ...ready, env: site })[0]).toMatch(/VITE_SITE_URL/);
    expect(shopProblems('Sassine!', ready)[0]).toMatch(/isn't a shop name/);
  });
});

describe('firebaseConfigFor', () => {
  const firebaseJson = readFileSync('firebase.json', 'utf8');

  it("puts the shop's sign-in domains in the Content-Security-Policy and drops the emulators", () => {
    const config = firebaseConfigFor(firebaseJson, { authDomain: 'sassine-maatouk.web.app', project: 'sassine-maatouk' }) as {
      hosting: { headers: { headers: { key: string; value: string }[] }[] };
      emulators?: unknown;
      firestore: { predeploy: string[] };
    };
    const csp = config.hosting.headers[0].headers.find((h) => h.key === 'Content-Security-Policy')!.value;
    expect(csp).toContain("frame-src 'self' https://sassine-maatouk.web.app https://sassine-maatouk.firebaseapp.com ");
    expect(JSON.stringify(config)).not.toMatch(/__[A-Z_]+__/);
    for (const locked of LOCKED_PROJECTS) expect(JSON.stringify(config)).not.toContain(locked);
    expect(config.emulators).toBeUndefined();
    // The predeploy guard stays.
    expect(config.firestore.predeploy).toEqual(['node scripts/deploy-guard.mjs']);
  });

  it('needs the placeholders', () => {
    expect(() => firebaseConfigFor('{}', { authDomain: 'a.web.app', project: 'a' })).toThrow(/needs/);
  });
});

describe('listShops and readShop', () => {
  const root = mkdtempSync(join(tmpdir(), 'shops-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('lists shop folders, never the template, and reads one', () => {
    for (const dir of ['_template', 'sassine', 'eddy', 'Not A Shop']) mkdirSync(join(root, 'shops', dir), { recursive: true });
    writeFileSync(join(root, 'shops', 'sassine', '.env'), Object.entries(READY).map(([k, v]) => `${k}=${v}`).join('\n'));
    writeFileSync(join(root, 'shops', 'sassine', 'logo.png'), 'png');
    writeFileSync(join(root, '.firebaserc'), JSON.stringify({ projects: { sassine: 'sassine-maatouk' } }));

    expect(listShops(root)).toEqual(['eddy', 'sassine']);
    const sassine = readShop('sassine', root);
    expect(sassine).toMatchObject({ alias: 'sassine-maatouk', hasLogo: true });
    expect(shopProblems('sassine', sassine)).toEqual([]);
    expect(readShop('eddy', root)).toMatchObject({ env: null, alias: undefined, hasLogo: false });
  });
});
