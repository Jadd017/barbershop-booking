// `npm run deploy -- <shop> [--dry-run | --build-only]`: deploys one shop's site, with the security
// rules and indexes, to that shop's Firebase project, and nowhere else (README, "Adding a new shop").
//
// 1. Refuses unless <shop> is named, is an alias in .firebaserc for a project that isn't locked
//    (deployTargets.mjs: Eddy's live project), and its config in shops/<shop>/ is complete; and
//    unless everything is committed and no VITE_ variable is set in the environment.
// 2. Shows the shop, the Firebase project and the commit, and asks you to type the project ID.
// 3. Makes a frozen copy of that commit (a git worktree in the temp folder) and does everything
//    else there, so switching branches or editing files in this folder meanwhile changes nothing.
//    The copy has only committed files: no .env.local. It must be the multi-barber code.
// 4. Runs lint, the unit tests and the rules + data-layer tests (emulators); stops if any fail.
// 5. Builds the shop's site (vite build --mode <shop>, from shops/<shop>/.env only), then checks
//    the build has the shop's Firebase config and nothing from any other config (other shops,
//    Eddy's .env.local, the emulator).
// 6. Deploys hosting, rules and indexes in one `firebase deploy` with the shop's own config
//    (firebase.<shop>.json: firebase.json with its sign-in domains in the Content-Security-Policy).
//    The predeploy guard (deploy-guard.mjs) checks the project, the commit and the build again.
// 7. Removes the copy.
//
// --dry-run checks and shows all of that without running anything. --build-only does steps 3–5
// and stops before deploying (no confirmation needed).
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import {
  bundleProblems,
  codeProblems,
  envLeakProblems,
  foreignValues,
  readBuild,
  shopDirFiles,
  uncommittedProblems,
} from './deployChecks.mjs';
import { deployRefusal, shopAliases } from './deployTargets.mjs';
import { firebaseConfigFor, readShop, shopProblems } from './shops.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const buildOnly = args.includes('--build-only');
const shop = args.find((a) => !a.startsWith('-'));
const repo = process.cwd();

/** A reason to stop that's already been explained (as opposed to a bug). */
class Refusal extends Error {}

function refuse(reason) {
  console.error(`\nDeploy refused: ${reason}\nNothing was deployed.\n`);
  process.exit(1);
}

/** Runs git in `cwd` and returns its output (refuses if git fails). */
function git(gitArgs, cwd = repo) {
  const result = spawnSync('git', gitArgs, { cwd, encoding: 'utf8' });
  if (result.status !== 0) refuse(`git ${gitArgs.join(' ')} failed: ${(result.stderr || '').trim()}`);
  return result.stdout.trim();
}

const aliases = shopAliases();
const refusal = deployRefusal(shop, undefined, aliases);
if (refusal) refuse(refusal);
const config = readShop(shop);
const problems = shopProblems(shop, config);
if (problems.length) refuse(`shop "${shop}" isn't ready:\n  - ${problems.join('\n  - ')}`);
const shellLeaks = envLeakProblems({ processEnv: process.env, shopDir: config.dir, shopDirFiles: [] });
if (shellLeaks.length) refuse(shellLeaks.join('\n  '));
const uncommitted = uncommittedProblems(git(['status', '--porcelain']));
if (uncommitted.length) refuse(uncommitted[0]);

const commit = git(['rev-parse', 'HEAD']);
const branch = git(['branch', '--show-current']) || '(detached)';
const subject = git(['log', '-1', '--format=%s']);
const project = aliases[shop];
const { env } = config;
const configFile = `firebase.${shop}.json`;

/** True if something listens on 127.0.0.1:`port` (the emulators from `npm run emu`). */
function listening(port) {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    socket.once('connect', () => (socket.destroy(), resolve(true)));
    socket.once('error', () => resolve(false));
  });
}

// The emulator tests start their own emulators, unless `npm run emu` already runs them (then they
// run against those, which wipes their data: `npm run seed` brings the demo shop back).
const emulatorsRunning = (await listening(8080)) && (await listening(9099));
const emulatorTests = emulatorsRunning
  ? { label: 'rules + data-layer tests (on the running emulators)', cmd: ['npx', 'vitest', 'run', '--config', 'vitest.rules.config.ts'], env: { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' } }
  : { label: 'rules + data-layer tests (emulators)', cmd: ['npm', 'run', 'test:emu'] };

const build = { label: `build ${shop}`, cmd: ['npx', 'vite', 'build', '--mode', shop] };
const deploy = {
  label: `deploy to ${project}`,
  cmd: ['npx', 'firebase', 'deploy', '--project', project, '--config', configFile, '--only', 'hosting,firestore'],
  env: { DEPLOY_SHOP: shop, DEPLOY_COMMIT: commit },
};
const steps = [
  { label: 'lint', cmd: ['npm', 'run', 'lint'] },
  { label: 'unit tests', cmd: ['npm', 'test'] },
  emulatorTests,
  { label: 'type-check', cmd: ['npx', 'tsc', '-b'] },
  build,
  ...(buildOnly ? [] : [deploy]),
];

console.log(`
Shop:              ${shop} (first name "${env.VITE_SHOP_NAME}")
Firebase project:  ${project}
Site:              ${env.VITE_SITE_URL}
Sign-in domain:    ${env.VITE_FIREBASE_AUTH_DOMAIN}
Code:              ${commit.slice(0, 7)} on ${branch}: ${subject}
                   (built from a frozen copy of this commit; changes to this folder don't affect it)
Deploys:           ${buildOnly ? 'nothing (--build-only)' : 'the site (Hosting) + security rules + indexes (Firestore)'}

Steps:`);
steps.forEach((s, i) => {
  console.log(`  ${i + 1}. ${s.label}: ${s.cmd.join(' ')}`);
  if (s === emulatorTests && emulatorsRunning) {
    console.log("     (this wipes the running emulators' data; `npm run seed` brings the demo shop back)");
  }
  if (s === build) console.log("     then: check the build has this shop's config and no other");
});

if (dryRun) {
  const firebaseConfig = firebaseConfigFor(readFileSync('firebase.json', 'utf8'), {
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    project,
  });
  const csp = firebaseConfig.hosting.headers[0].headers.find((h) => h.key === 'Content-Security-Policy').value;
  console.log(`\n${configFile} would have frame-src: ${csp.match(/frame-src[^;]*/)[0]}`);
  console.log('\n(dry run: nothing was tested, built or deployed)\n');
  process.exit(0);
}

if (!buildOnly) {
  if (!process.stdin.isTTY) refuse('deploying needs you to confirm in a terminal.');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const typed = (await rl.question(`\nType the project ID (${project}) to deploy, anything else to stop: `)).trim();
  rl.close();
  if (typed !== project) refuse('not confirmed.');
}

// The frozen copy. node_modules is linked from this folder (git doesn't change it).
const copy = mkdtempSync(join(tmpdir(), `deploy-${shop}-`));
rmSync(copy, { recursive: true });
git(['worktree', 'add', '--detach', copy, commit]);
const modulesLink = join(copy, 'node_modules');
let deploying = false;
let exitCode = 1;
try {
  symlinkSync(resolve(repo, 'node_modules'), modulesLink, 'junction');
  console.log(`\nFrozen copy of ${commit.slice(0, 7)}: ${copy}`);

  const copyProblems = [...codeProblems(copy), ...shopProblems(shop, readShop(shop, copy))];
  if (readShop(shop, copy).env?.VITE_FIREBASE_PROJECT_ID !== project) copyProblems.push(`the copy's ${shop} isn't ${project}.`);
  copyProblems.push(
    ...envLeakProblems({ processEnv: {}, shopDir: `shops/${shop}`, shopDirFiles: shopDirFiles(copy, shop) }),
  );
  if (copyProblems.length) throw new Refusal(copyProblems.join('\n  '));

  // Without VITE_ variables (none are set, checked above) and with this deploy's commit.
  const run = ({ label, cmd: [command, ...rest], env: extra }) => {
    console.log(`\n== ${label} ==`);
    const result = spawnSync(command, rest, {
      cwd: copy,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, ...extra },
    });
    return result.status === 0;
  };

  for (const step of steps) {
    if (step === deploy) {
      const firebaseConfig = firebaseConfigFor(readFileSync(join(copy, 'firebase.json'), 'utf8'), {
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
        project,
      });
      writeFileSync(join(copy, configFile), `${JSON.stringify(firebaseConfig, null, 2)}\n`);
    }
    deploying = step === deploy;
    if (!run(step)) throw new Refusal(`"${step.label}" failed.`);
    deploying = false;
    if (step === build) {
      // This folder's .env.local (Eddy's live config) isn't in the copy, but its values mustn't
      // be in the build either.
      const local = join(repo, '.env.local');
      const extra = existsSync(local) ? [readFileSync(local, 'utf8')] : [];
      const found = bundleProblems(readBuild(join(copy, 'dist')), env, foreignValues(copy, shop, extra));
      if (found.length) throw new Refusal(`the build isn't ${shop}'s:\n  - ${found.join('\n  - ')}`);
      console.log(`\nThe build has ${shop}'s config (${project}) and nothing from any other.`);
    }
  }
  console.log(
    buildOnly
      ? `\nBuilt and checked ${shop} (${commit.slice(0, 7)}); nothing was deployed (--build-only).\n`
      : `\nDeployed ${shop} (${commit.slice(0, 7)}) to ${project}: ${env.VITE_SITE_URL}\n`,
  );
  exitCode = 0;
} catch (err) {
  if (!(err instanceof Refusal)) throw err;
  const outcome = deploying
    ? 'The deploy itself failed: check the Firebase console for what, if anything, was released.'
    : 'Nothing was deployed.';
  console.error(`\nStopped: ${err.message}\n${outcome}\n`);
} finally {
  // The link first, on its own: removing the copy must never reach this folder's node_modules.
  try {
    if (lstatSync(modulesLink).isSymbolicLink()) unlinkSync(modulesLink);
  } catch {
    // Not there (yet).
  }
  if (existsSync(modulesLink)) {
    console.error(`Left the copy in place: ${modulesLink} is still linked. Remove the link, then the folder.`);
  } else {
    spawnSync('git', ['worktree', 'remove', '--force', copy], { cwd: repo });
    rmSync(copy, { recursive: true, force: true });
    spawnSync('git', ['worktree', 'prune'], { cwd: repo });
  }
}
process.exit(exitCode);
