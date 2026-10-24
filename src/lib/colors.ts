/**
 * The shop's colors (settings/branding): format checks, and contrast warnings so the owner doesn't
 * pick colors customers can't read. Same thresholds as WCAG AA (docs/DEVELOPMENT.md, "Look").
 */
import type { BrandColors, Branding } from '../types';
import { isLogoDataUrl } from './logo';

/** "#RRGGBB". firestore.rules checks the same. */
export function isHexColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

/** Relative luminance of a "#RRGGBB" color (WCAG 2). */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio of two "#RRGGBB" colors, from 1 (same) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Hard-to-read pairs, as messages for the owner (saving is still allowed): text on the page
 * background needs 4.5:1, the accent on the dark header (buttons, highlights) 3:1.
 */
export function contrastWarnings(colors: BrandColors): string[] {
  const warnings: string[] = [];
  if (contrastRatio(colors.dark, colors.light) < 4.5) {
    warnings.push('Text will be hard to read on the background: pick a darker or lighter color.');
  }
  if (contrastRatio(colors.accent, colors.dark) < 3) {
    warnings.push('The accent color is hard to see on the dark color.');
  }
  return warnings;
}

/** What's wrong with `branding`; empty if it can be saved. */
export function brandingErrors(branding: Branding): string[] {
  const errors: string[] = [];
  if (branding.logo !== null && !isLogoDataUrl(branding.logo)) {
    errors.push('The logo must be a WebP, JPEG or PNG image under 100 KB.');
  }
  const { dark, accent, light } = branding.colors;
  if (![dark, accent, light].every(isHexColor)) {
    errors.push('Colors must be like #1E1B18.');
  }
  return errors;
}
