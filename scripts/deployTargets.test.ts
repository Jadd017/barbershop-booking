import { describe, expect, it } from 'vitest';
import { deployRefusal, LOCKED_PROJECTS, shopAliases } from './deployTargets.mjs';
import { readShop } from './shops.mjs';

// Eddy's live project, as locked in deployTargets.mjs.
const LOCKED = LOCKED_PROJECTS[0];
const ALIASES = { sassine: 'example-shop-project', eddy: LOCKED, default: LOCKED };

describe('deployRefusal', () => {
  it('needs a named shop', () => {
    expect(deployRefusal(undefined, undefined, ALIASES)).toMatch(/name the shop/);
    expect(deployRefusal('', 'example-shop-project', ALIASES)).toMatch(/name the shop/);
  });

  it('never deploys to Eddy\'s live project, however it is named', () => {
    expect(LOCKED).toMatch(/^eddy-/);
    expect(deployRefusal('eddy', undefined, ALIASES)).toMatch(/locked/);
    expect(deployRefusal(LOCKED, undefined, ALIASES)).toMatch(/locked/);
    expect(deployRefusal('sassine', LOCKED, ALIASES)).toMatch(/locked/);
    expect(deployRefusal('default', undefined, ALIASES)).toMatch(/not a shop/);
  });

  it('refuses shops not in .firebaserc, and a project that is not the shop\'s', () => {
    expect(deployRefusal('nobody', undefined, ALIASES)).toMatch(/not a shop in \.firebaserc/);
    expect(deployRefusal('sassine', 'other-project', ALIASES)).toMatch(/but this deploy goes to/);
  });

  it("allows a named shop to its own project", () => {
    expect(deployRefusal('sassine', undefined, ALIASES)).toBeNull();
    expect(deployRefusal('sassine', 'example-shop-project', ALIASES)).toBeNull();
  });

  it(".firebaserc has only sassine, which deploys to its own project and nowhere else", () => {
    const aliases = shopAliases();
    // The project in shops/sassine/.env.
    const project = readShop('sassine').env!.VITE_FIREBASE_PROJECT_ID;
    expect(aliases).toEqual({ sassine: project });
    expect(deployRefusal('sassine', undefined, aliases)).toBeNull();
    expect(deployRefusal('sassine', project, aliases)).toBeNull();
    expect(deployRefusal('sassine', 'other-project', aliases)).toMatch(/but this deploy goes to/);
    expect(deployRefusal('sassine', LOCKED, aliases)).toMatch(/locked/);
    expect(deployRefusal('eddy', undefined, aliases)).toMatch(/locked|not a shop/);
    expect(deployRefusal(LOCKED, undefined, aliases)).toMatch(/locked/);
    expect(deployRefusal('default', undefined, aliases)).toMatch(/not a shop/);
  });
});
