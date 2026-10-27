// Which Firebase project a deploy may go to. Used by scripts/deploy.mjs (`npm run deploy`) and by
// scripts/deploy-guard.mjs, which firebase.json runs before every `firebase deploy`, however it
// was started.
import { readFileSync } from 'node:fs';

/**
 * Projects nothing on this branch may ever deploy to. Eddy's live site runs the single-barber
 * code from `main`; this branch's rules would break it. Remove a project from here only in the
 * deliberate commit that migrates it (docs/ARCHITECTURE.md, 9.3).
 */
export const LOCKED_PROJECTS = ['eddy-barbershop'];

/** The shop aliases in .firebaserc (shop name → project ID). */
export function shopAliases(rcText = readFileSync('.firebaserc', 'utf8')) {
  return JSON.parse(rcText).projects ?? {};
}

/**
 * Why deploying `shop` (as named on the command line) to `project` isn't allowed, or null if it
 * is: the shop must be named, must be an alias in .firebaserc other than "default", must point at
 * `project`, and the project must not be locked.
 */
export function deployRefusal(shop, project, aliases) {
  if (!shop) return 'name the shop: npm run deploy -- <shop> (README, "Adding a new shop").';
  if (shop === 'default') return '"default" is not a shop. Name the shop explicitly.';
  if (LOCKED_PROJECTS.includes(shop) || LOCKED_PROJECTS.includes(project)) {
    return `${project ?? shop} is locked on this branch (Eddy's live site). See LOCKED_PROJECTS in scripts/deployTargets.mjs.`;
  }
  const target = aliases[shop];
  if (!target) {
    const known = Object.keys(aliases).filter((a) => a !== 'default');
    return `"${shop}" is not a shop in .firebaserc (shops: ${known.length ? known.join(', ') : 'none yet'}).`;
  }
  if (LOCKED_PROJECTS.includes(target)) {
    return `"${shop}" points at ${target}, which is locked on this branch (Eddy's live site).`;
  }
  if (project !== undefined && project !== target) {
    return `shop "${shop}" is ${target}, but this deploy goes to ${project}.`;
  }
  return null;
}
