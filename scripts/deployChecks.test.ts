import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  bundleProblems,
  codeProblems,
  envLeakProblems,
  foreignValues,
  MULTI_BARBER_FILES,
  readBuild,
  uncommittedProblems,
} from './deployChecks.mjs';

const temp = mkdtempSync(join(tmpdir(), 'deploy-checks-'));
afterAll(() => rmSync(temp, { recursive: true, force: true }));

/** Writes `files` (path → text) under a new folder in `temp`, and returns it. */
function folder(name: string, files: Record<string, string>): string {
  const root = join(temp, name);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const SASSINE = {
  VITE_FIREBASE_API_KEY: 'AIzaSassineKey000000000000000000000000',
  VITE_FIREBASE_AUTH_DOMAIN: 'sassine-barbershop.web.app',
  VITE_FIREBASE_PROJECT_ID: 'sassine-barbershop',
  VITE_FIREBASE_APP_ID: '1:111:web:sassine',
};
// What Eddy's .env.local holds (made-up values in the same shape).
const EDDY_LOCAL = {
  VITE_FIREBASE_API_KEY: 'AIzaEddyKey0000000000000000000000000000',
  VITE_FIREBASE_AUTH_DOMAIN: 'eddy-barbershop.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'eddy-barbershop',
  VITE_FIREBASE_APP_ID: '1:222:web:eddy',
};
const envText = (env: Record<string, string>) => Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n');

describe('uncommittedProblems', () => {
  it('passes a clean tree', () => {
    expect(uncommittedProblems('')).toEqual([]);
    expect(uncommittedProblems('\n')).toEqual([]);
  });

  it('refuses any change, listing it', () => {
    const [problem] = uncommittedProblems(' M src/App.tsx\n?? notes.txt\n');
    expect(problem).toMatch(/uncommitted changes/);
    expect(problem).toContain('M src/App.tsx');
    expect(problem).toContain('?? notes.txt');
  });
});

describe('codeProblems', () => {
  it('passes this repository (the multi-barber code)', () => {
    expect(codeProblems('.')).toEqual([]);
  });

  it("refuses the single-barber code: no deploy scripts, no indexes, the old rules", () => {
    // What the folder held during the 2026-10-28 build: Eddy's code after a branch switch.
    const single = folder('single-barber', {
      'firestore.rules': 'service cloud.firestore { match /slots/{slotId} {} }',
      'src/lib/settingsDoc.ts': '',
      'vite.config.ts': '',
    });
    const problems = codeProblems(single);
    expect(problems).toHaveLength(MULTI_BARBER_FILES.length + 1);
    expect(problems.join('\n')).toMatch(/isn't the multi-barber code/);
    expect(problems.join('\n')).toMatch(/isn't the multi-barber rules/);
  });
});

describe('envLeakProblems', () => {
  it("passes a shop folder with only its .env and logo, and no VITE_ variables", () => {
    const problems = envLeakProblems({
      processEnv: { PATH: '/bin', DEPLOY_SHOP: 'sassine' },
      shopDir: 'shops/sassine',
      shopDirFiles: ['.env', 'logo.png'],
    });
    expect(problems).toEqual([]);
  });

  it('refuses VITE_ variables in the environment (Vite builds them in, over the .env files)', () => {
    const problems = envLeakProblems({
      processEnv: { VITE_FIREBASE_PROJECT_ID: 'eddy-barbershop' },
      shopDir: 'shops/sassine',
      shopDirFiles: ['.env'],
    });
    expect(problems).toEqual([expect.stringMatching(/VITE_FIREBASE_PROJECT_ID is set in the environment/)]);
  });

  it("refuses the shop's .env.local (App Check debug token) and .env.<mode> files", () => {
    const problems = envLeakProblems({
      processEnv: {},
      shopDir: 'shops/sassine',
      shopDirFiles: ['.env', '.env.local', '.env.sassine', 'logo.png'],
    });
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('shops/sassine/.env.local');
    expect(problems[1]).toContain('shops/sassine/.env.sassine');
  });
});

describe('foreignValues', () => {
  const root = folder('repo', {
    'shops/sassine/.env': envText(SASSINE),
    'shops/other/.env': envText({ ...SASSINE, VITE_FIREBASE_PROJECT_ID: 'other-shop', VITE_FIREBASE_API_KEY: 'AIzaOther' }),
    'shops/_template/.env': 'VITE_FIREBASE_PROJECT_ID=<project-id>',
    '.env.local': envText(EDDY_LOCAL),
    '.env.emulator': 'VITE_FIREBASE_PROJECT_ID=demo-barbershop\nVITE_FIREBASE_API_KEY=demo-api-key',
  });

  it("lists every other config's identifying values, and none of the shop's own", () => {
    const foreign = foreignValues(root, 'sassine');
    expect(foreign).toEqual(
      expect.arrayContaining([
        'other-shop',
        'AIzaOther',
        ...Object.values(EDDY_LOCAL),
        'demo-barbershop',
        'demo-api-key',
      ]),
    );
    for (const own of Object.values(SASSINE)) expect(foreign).not.toContain(own);
    expect(foreign.some((v) => v.includes('<'))).toBe(false);
  });

  it("includes env files from outside the copy (this folder's .env.local)", () => {
    const copy = folder('copy', { 'shops/sassine/.env': envText(SASSINE) });
    expect(foreignValues(copy, 'sassine')).not.toContain(EDDY_LOCAL.VITE_FIREBASE_API_KEY);
    expect(foreignValues(copy, 'sassine', [envText(EDDY_LOCAL)])).toContain(EDDY_LOCAL.VITE_FIREBASE_API_KEY);
  });

  it("always includes Eddy's locked project and the emulator's", () => {
    const foreign = foreignValues('.', 'sassine');
    expect(foreign).toContain('eddy-barbershop');
    expect(foreign).toContain('demo-barbershop');
    expect(foreign).not.toContain('sassine-barbershop');
  });
});

describe('bundleProblems', () => {
  const foreign = ['eddy-barbershop', EDDY_LOCAL.VITE_FIREBASE_API_KEY, 'demo-barbershop'];
  const sassineBundle = `const c={apiKey:\`${SASSINE.VITE_FIREBASE_API_KEY}\`,projectId:\`sassine-barbershop\`,appId:\`${SASSINE.VITE_FIREBASE_APP_ID}\`}`;

  it("passes the shop's own build", () => {
    expect(bundleProblems(sassineBundle, SASSINE, foreign)).toEqual([]);
  });

  it("refuses Eddy's build for Sassine (what went live on 2026-10-28)", () => {
    const eddyBundle = `<title>Eddy's Barbershop</title>const c={apiKey:\`${EDDY_LOCAL.VITE_FIREBASE_API_KEY}\`,projectId:\`eddy-barbershop\`}`;
    const problems = bundleProblems(eddyBundle, SASSINE, foreign);
    expect(problems.filter((p) => /doesn't contain the shop's/.test(p))).toHaveLength(3);
    expect(problems).toContain('the build contains "eddy-barbershop", which belongs to another config.');
    // API keys are only shown by their start.
    expect(problems.join('\n')).toContain('"AIzaEddy…"');
    expect(problems.join('\n')).not.toContain(EDDY_LOCAL.VITE_FIREBASE_API_KEY);
  });

  it("refuses a build that mixes in another config's value", () => {
    const problems = bundleProblems(`${sassineBundle};const e="demo-barbershop"`, SASSINE, foreign);
    expect(problems).toEqual(['the build contains "demo-barbershop", which belongs to another config.']);
  });
});

describe('readBuild', () => {
  it('reads index.html and every .js file under dist/, nothing else', () => {
    const dist = folder('dist', {
      'index.html': '<html>page</html>',
      'assets/index-abc.js': 'code1',
      'assets/chunk/x.js': 'code2',
      'assets/style.css': 'css',
      'og-image.png': 'png',
    });
    const text = readBuild(dist);
    for (const part of ['page', 'code1', 'code2']) expect(text).toContain(part);
    expect(text).not.toContain('css');
    expect(text).not.toContain('png');
    expect(readBuild(join(temp, 'missing'))).toBe('');
  });
});
