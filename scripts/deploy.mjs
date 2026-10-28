// `npm run deploy -- <shop> [--dry-run]`: deploys one shop's site, with the security rules and
// indexes, to that shop's Firebase project, and nowhere else (README, "Adding a new shop").
//
// 1. Refuses unless <shop> is named, is an alias in .firebaserc for a project that isn't locked
//    (deployTargets.mjs: Eddy's live project), and its config in shops/<shop>/ is complete.
// 2. Shows the shop and the Firebase project, and asks you to type the project ID.
// 3. Runs lint, the unit tests and the rules + data-layer tests (emulators); stops if any fail.
// 4. Builds the shop's site (vite build --mode <shop>).
// 5. Deploys hosting, rules and indexes in one `firebase deploy` with the shop's own config
//    (firebase.<shop>.json: firebase.json with its sign-in domains in the Content-Security-Policy),
//    then deletes that file. The predeploy guard (deploy-guard.mjs) checks the project again.
//
// --dry-run checks and shows all of that without running anything.
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { createInterface } from 'node:readline/promises';
import { deployRefusal, shopAliases } from './deployTargets.mjs';
import { firebaseConfigFor, readShop, shopProblems } from './shops.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const shop = args.find((a) => !a.startsWith('-'));

function refuse(reason) {
  console.error(`\nDeploy refused: ${reason}\nNothing was tested, built or deployed.\n`);
  process.exit(1);
}

const aliases = shopAliases();
const refusal = deployRefusal(shop, undefined, aliases);
if (refusal) refuse(refusal);
const config = readShop(shop);
const problems = shopProblems(shop, config);
if (problems.length) refuse(`shop "${shop}" isn't ready:\n  - ${problems.join('\n  - ')}`);

const project = aliases[shop];
const { env } = config;
const configFile = `firebase.${shop}.json`;
const firebaseConfig = firebaseConfigFor(readFileSync('firebase.json', 'utf8'), {
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  project,
});

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

const steps = [
  { label: 'lint', cmd: ['npm', 'run', 'lint'] },
  { label: 'unit tests', cmd: ['npm', 'test'] },
  emulatorTests,
  { label: 'type-check', cmd: ['npx', 'tsc', '-b'] },
  { label: `build ${shop}`, cmd: ['npx', 'vite', 'build', '--mode', shop] },
  {
    label: `deploy to ${project}`,
    cmd: ['npx', 'firebase', 'deploy', '--project', project, '--config', configFile, '--only', 'hosting,firestore'],
    env: { DEPLOY_SHOP: shop },
    deploy: true,
  },
];

console.log(`
Shop:              ${shop} (first name "${env.VITE_SHOP_NAME}")
Firebase project:  ${project}
Site:              ${env.VITE_SITE_URL}
Sign-in domain:    ${env.VITE_FIREBASE_AUTH_DOMAIN}
Deploys:           the site (Hosting) + security rules + indexes (Firestore)

Steps:`);
steps.forEach((s, i) => {
  console.log(`  ${i + 1}. ${s.label}: ${s.cmd.join(' ')}`);
  if (s === emulatorTests && emulatorsRunning) {
    console.log("     (this wipes the running emulators' data; `npm run seed` brings the demo shop back)");
  }
});

if (dryRun) {
  const csp = firebaseConfig.hosting.headers[0].headers.find((h) => h.key === 'Content-Security-Policy').value;
  console.log(`\n${configFile} would have frame-src: ${csp.match(/frame-src[^;]*/)[0]}`);
  console.log('\n(dry run: nothing was tested, built or deployed)\n');
  process.exit(0);
}

if (!process.stdin.isTTY) refuse('deploying needs you to confirm in a terminal.');
const rl = createInterface({ input: process.stdin, output: process.stdout });
const typed = (await rl.question(`\nType the project ID (${project}) to deploy, anything else to stop: `)).trim();
rl.close();
if (typed !== project) refuse('not confirmed.');

const run = ({ label, cmd: [command, ...rest], env: extra }) => {
  console.log(`\n== ${label} ==`);
  const result = spawnSync(command, rest, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...extra },
  });
  return result.status === 0;
};

for (const step of steps) {
  if (step.deploy) writeFileSync(configFile, `${JSON.stringify(firebaseConfig, null, 2)}\n`);
  let ok;
  try {
    ok = run(step);
  } finally {
    if (step.deploy) rmSync(configFile, { force: true });
  }
  if (!ok) {
    console.error(`\nStopped: "${step.label}" failed.${step.deploy ? '' : ' Nothing was deployed.'}\n`);
    process.exit(1);
  }
}
console.log(`\nDeployed ${shop} to ${project}: ${env.VITE_SITE_URL}\n`);
