// Runs before every `firebase deploy` (the predeploy hooks in firebase.json), however it was
// started: a bare `firebase deploy`, one with --project, or npm run deploy. A deploy is allowed
// only when scripts/deploy.mjs started it for a named shop (DEPLOY_SHOP) and the project Firebase
// is about to deploy to (GCLOUD_PROJECT, set by the Firebase CLI) is that shop's; and only from
// the clean, frozen copy of the commit deploy.mjs checked (DEPLOY_COMMIT), which must be the
// multi-barber code, with a build (dist/) that has that shop's config and no other.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { bundleProblems, codeProblems, foreignValues, readBuild, uncommittedProblems } from './deployChecks.mjs';
import { deployRefusal, shopAliases } from './deployTargets.mjs';
import { readShop } from './shops.mjs';

const project = process.env.GCLOUD_PROJECT;
const shop = process.env.DEPLOY_SHOP;
const commit = process.env.DEPLOY_COMMIT;

const git = (args) => spawnSync('git', args, { encoding: 'utf8' }).stdout?.trim() ?? '';

function refusal() {
  if (!project) return 'the Firebase CLI did not say which project this deploy goes to.';
  if (!shop) return `deploys go through \`npm run deploy -- <shop>\`, not \`firebase deploy\` (this one was going to ${project}).`;
  const target = deployRefusal(shop, project, shopAliases());
  if (target) return target;
  if (!commit || git(['rev-parse', 'HEAD']) !== commit) {
    return `this isn't the copy of the commit \`npm run deploy\` checked (${commit?.slice(0, 7) ?? 'none'}).`;
  }
  const problems = [...uncommittedProblems(git(['status', '--porcelain'])), ...codeProblems('.')];
  // Hosting uploads dist/: it must be this shop's build.
  const configFile = `firebase.${shop}.json`;
  if (!existsSync(configFile)) return `${configFile} is missing: \`npm run deploy -- ${shop}\` writes it in its copy.`;
  const firebaseJson = JSON.parse(readFileSync(configFile, 'utf8'));
  if (firebaseJson.hosting) {
    const { env } = readShop(shop);
    problems.push(...bundleProblems(readBuild(firebaseJson.hosting.public), env, foreignValues('.', shop)));
  }
  return problems.length ? problems.join('\n  ') : null;
}

const reason = refusal();
if (reason) {
  console.error(`\nDeploy refused: ${reason}\nNothing was deployed.\n`);
  process.exit(1);
}
