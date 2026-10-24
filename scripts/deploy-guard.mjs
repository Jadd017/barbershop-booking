// Runs before every `firebase deploy` (the predeploy hooks in firebase.json), however it was
// started: a bare `firebase deploy`, one with --project, or npm run deploy. A deploy is allowed
// only when scripts/deploy.mjs started it for a named shop (DEPLOY_SHOP) and the project Firebase
// is about to deploy to (GCLOUD_PROJECT, set by the Firebase CLI) is that shop's.
import { deployRefusal, shopAliases } from './deployTargets.mjs';

const project = process.env.GCLOUD_PROJECT;
const shop = process.env.DEPLOY_SHOP;

const refusal = !project
  ? 'the Firebase CLI did not say which project this deploy goes to.'
  : !shop
    ? `deploys go through \`npm run deploy -- <shop>\`, not \`firebase deploy\` (this one was going to ${project}).`
    : deployRefusal(shop, project, shopAliases());

if (refusal) {
  console.error(`\nDeploy refused: ${refusal}\nNothing was deployed.\n`);
  process.exit(1);
}
