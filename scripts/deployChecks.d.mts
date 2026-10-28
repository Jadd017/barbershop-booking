// Types for deployChecks.mjs, which vite.config.ts imports (and its tests).

export declare const MULTI_BARBER_FILES: string[];
export declare const IDENTIFYING_KEYS: string[];

export declare function uncommittedProblems(porcelain: string): string[];
export declare function codeProblems(dir: string): string[];
export declare function envLeakProblems(input: {
  processEnv: Record<string, string | undefined>;
  shopDir: string;
  shopDirFiles: string[];
}): string[];
export declare function shopDirFiles(root: string, shop: string): string[];
export declare function foreignValues(root: string, shop: string, extraEnvTexts?: string[]): string[];
export declare function bundleProblems(bundle: string, env: Record<string, string>, foreign: string[]): string[];
export declare function readBuild(distDir: string): string;
