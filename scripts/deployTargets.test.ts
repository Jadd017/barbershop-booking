import { describe, expect, it } from 'vitest';
import { deployRefusal, shopAliases } from './deployTargets.mjs';

const ALIASES = { sassine: 'sassine-maatouk', eddy: 'eddy-barbershop', default: 'eddy-barbershop' };

describe('deployRefusal', () => {
  it('needs a named shop', () => {
    expect(deployRefusal(undefined, undefined, ALIASES)).toMatch(/name the shop/);
    expect(deployRefusal('', 'sassine-maatouk', ALIASES)).toMatch(/name the shop/);
  });

  it('never deploys to Eddy\'s live project, however it is named', () => {
    expect(deployRefusal('eddy', undefined, ALIASES)).toMatch(/locked/);
    expect(deployRefusal('eddy-barbershop', undefined, ALIASES)).toMatch(/locked/);
    expect(deployRefusal('sassine', 'eddy-barbershop', ALIASES)).toMatch(/locked/);
    expect(deployRefusal('default', undefined, ALIASES)).toMatch(/not a shop/);
  });

  it('refuses shops not in .firebaserc, and a project that is not the shop\'s', () => {
    expect(deployRefusal('nobody', undefined, ALIASES)).toMatch(/not a shop in \.firebaserc/);
    expect(deployRefusal('sassine', 'other-project', ALIASES)).toMatch(/but this deploy goes to/);
  });

  it("allows a named shop to its own project", () => {
    expect(deployRefusal('sassine', undefined, ALIASES)).toBeNull();
    expect(deployRefusal('sassine', 'sassine-maatouk', ALIASES)).toBeNull();
  });

  it('this branch has no shops yet, so nothing can be deployed', () => {
    const aliases = shopAliases();
    expect(aliases).toEqual({});
    expect(deployRefusal('sassine', undefined, aliases)).toMatch(/shops: none yet/);
  });
});
