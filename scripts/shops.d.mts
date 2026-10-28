// Types for shops.mjs, which vite.config.ts imports.

export declare const SHOPS_DIR: string;
export declare const TEMPLATE: string;
export declare const SHOP_NAME: RegExp;
export declare const REQUIRED_ENV: string[];
export declare const CSP_PLACEHOLDERS: { authDomain: string; project: string };

export interface ShopConfig {
  shop: string;
  dir: string;
  env: Record<string, string> | null;
  alias: string | undefined;
  logoPath: string;
  hasLogo: boolean;
}

export declare function listShops(root?: string): string[];
export declare function parseEnv(text: string): Record<string, string>;
export declare function shopProblems(
  shop: string,
  config: Pick<ShopConfig, 'env' | 'alias' | 'hasLogo'>,
): string[];
export declare function readShop(shop: string, root?: string): ShopConfig;
export declare function firebaseConfigFor(
  firebaseJsonText: string,
  domains: { authDomain: string; project: string },
): Record<string, unknown>;
