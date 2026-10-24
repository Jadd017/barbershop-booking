// `npm run deploy -- <shop> [--dry-run]`: builds the shop's site (vite --mode <shop>) and deploys
// it with the rules and indexes to that shop's Firebase project, and nowhere else.
//
// Refuses unless <shop> is named, is an alias in .firebaserc and isn't locked (deployTargets.mjs),
// and .env.<shop> exists. The predeploy guard (deploy-guard.mjs) checks again inside Firebase.
// The per-shop config file for firebase.json arrives in Phase 7 (docs/ARCHITECTURE.md, 3.3).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { deployRefusal, shopAliases } from './deployTargets.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const shop = args.find((a) => !a.startsWith('-'));

function refuse(reason) {
  console.error(`\nDeploy refused: ${reason}\nNothing was built or deployed.\n`);
  process.exit(1);
}

const aliases = shopAliases();
const refusal = deployRefusal(shop, undefined, aliases);
if (refusal) refuse(refusal);
if (!existsSync(`.env.${shop}`)) refuse(`.env.${shop} is missing: the shop's site config.`);

const project = aliases[shop];
const steps = [
  ['npx', 'vite', 'build', '--mode', shop],
  ['npx', 'firebase', 'deploy', '--project', project, '--only', 'hosting,firestore'],
];

console.log(`Deploying shop "${shop}" to Firebase project ${project}:`);
for (const step of steps) console.log(`  ${step.join(' ')}`);
if (dryRun) {
  console.log('(dry run: nothing was built or deployed)');
  process.exit(0);
}

for (const [command, ...rest] of steps) {
  const result = spawnSync(command, rest, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, DEPLOY_SHOP: shop },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
