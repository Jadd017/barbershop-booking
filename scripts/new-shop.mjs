// `npm run new-shop -- <shop> <project-id> ["Shop Name"]`: starts a new shop's config from
// shops/_template: shops/<shop>/.env with the project ID and its default domains filled in, and the
// shop's alias in .firebaserc. The rest (Firebase web config, logo) is filled in by hand; see the
// README, "Adding a new shop". Never overwrites an existing shop.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOCKED_PROJECTS } from './deployTargets.mjs';
import { SHOP_NAME, SHOPS_DIR, TEMPLATE } from './shops.mjs';

const [shop, project, ...nameWords] = process.argv.slice(2);
const name = nameWords.join(' ').trim();

function fail(message) {
  console.error(`\n${message}\nNothing was changed.\n`);
  process.exit(1);
}

if (!shop || !project) fail('Usage: npm run new-shop -- <shop> <project-id> ["Shop Name"]');
if (!SHOP_NAME.test(shop) || shop === TEMPLATE || shop === 'default') {
  fail(`"${shop}" can't be a shop name: lower-case letters, digits and dashes, starting with a letter.`);
}
// Firebase project IDs: 6–30 lower-case letters, digits and dashes.
if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project) || project.startsWith('demo-')) {
  fail(`"${project}" isn't a Firebase project ID (Project settings → General → Project ID).`);
}
if (LOCKED_PROJECTS.includes(project)) fail(`${project} is locked until its migration (Eddy's live site, which runs the single-barber code from the eddy-single-barber branch).`);

const dir = `${SHOPS_DIR}/${shop}`;
if (existsSync(dir)) fail(`${dir} already exists.`);

const rcText = existsSync('.firebaserc') ? readFileSync('.firebaserc', 'utf8') : '{"projects":{}}';
const rc = JSON.parse(rcText);
rc.projects ??= {};
if (rc.projects[shop]) fail(`.firebaserc already has an alias "${shop}" (${rc.projects[shop]}).`);

mkdirSync(dir, { recursive: true });
const env = readFileSync(join(SHOPS_DIR, TEMPLATE, '.env'), 'utf8')
  .replaceAll('<project-id>', project)
  .replace(/^VITE_FIREBASE_STORAGE_BUCKET=.*$/m, `VITE_FIREBASE_STORAGE_BUCKET=${project}.firebasestorage.app`)
  .replace(/^VITE_SHOP_NAME=.*$/m, `VITE_SHOP_NAME=${name || '<Shop Name>'}`);
writeFileSync(join(dir, '.env'), env);
if (existsSync(join(SHOPS_DIR, TEMPLATE, 'logo.png'))) copyFileSync(join(SHOPS_DIR, TEMPLATE, 'logo.png'), join(dir, 'logo.png'));

rc.projects[shop] = project;
writeFileSync('.firebaserc', `${JSON.stringify(rc, null, 2)}\n`);

console.log(`
Shop "${shop}" started (Firebase project ${project}):
  ${dir}/.env      fill in the values still in <angle brackets>
  ${dir}/logo.png  add the shop's logo (PNG, square looks best, under 100 KB ideally)
  .firebaserc        alias ${shop} → ${project}

Next (README, "Adding a new shop"):
  npm run setup-shop -- ${shop} --key <path to the admin key> --username <owner> --owner-name "<his name>"
  npm run deploy -- ${shop}
`);
