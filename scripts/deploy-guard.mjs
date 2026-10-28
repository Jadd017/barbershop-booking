// Runs before every `firebase deploy` from this branch (the predeploy hooks in firebase.json),
// however it was started: `npm run deploy`, a bare `firebase deploy`, or one with --project.
//
// This branch is Eddy's single-barber site, and it may only ever deploy to his project. On
// 2026-10-28 this code, built with his config, was deployed to another shop's project
// (sassine-barbershop) by mistake. The multi-barber code (main) deploys every other shop.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const EDDY = 'eddy-barbershop';
/** Projects this build must never contain: the other shops and the emulator. */
const OTHERS = ['sassine-barbershop', 'demo-barbershop'];

/** Every .js and .html file under `dir`, as one text. */
function readBuild(dir) {
  if (!existsSync(dir)) return '';
  return readdirSync(dir, { withFileTypes: true })
    .map((e) => {
      const path = join(dir, e.name);
      if (e.isDirectory()) return readBuild(path);
      return /\.(js|html)$/.test(e.name) ? readFileSync(path, 'utf8') : '';
    })
    .join('\n');
}

function refusal() {
  const project = process.env.GCLOUD_PROJECT;
  if (project !== EDDY) {
    return `this branch (eddy-single-barber) only deploys to ${EDDY}, and this deploy goes to ${project ?? 'an unknown project'}. Other shops deploy from main with \`npm run deploy -- <shop>\`.`;
  }
  // Hosting uploads dist/: it must be Eddy's build (a rules-only deploy may have none).
  const build = readBuild('dist');
  if (!build) return null;
  if (!build.includes(EDDY)) return `dist/ isn't built for ${EDDY}. Run \`npm run deploy\`, which builds it first.`;
  const other = OTHERS.find((p) => build.includes(p));
  if (other) return `dist/ contains ${other}: it isn't Eddy's build.`;
  return null;
}

const reason = refusal();
if (reason) {
  console.error(`\nDeploy refused: ${reason}\nNothing was deployed.\n`);
  process.exit(1);
}
