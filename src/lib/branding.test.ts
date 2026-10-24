/** Initials circles, logo compression and brand colors. */
import { describe, expect, it } from 'vitest';
import { MAX_LOGO_BYTES, MAX_LOGO_DATA_URL_LENGTH } from '../config';
import {
  brandingErrors,
  contrastRatio,
  contrastWarnings,
  isHexColor,
  lighten,
  themeVariables,
} from './colors';
import { initials } from './initials';
import { LogoTooLargeError, compressLogo, fitWithin, isLogoDataUrl } from './logo';
import { DEFAULT_COLORS } from './shopDoc';

describe('initials', () => {
  it('uses the first and last name', () => {
    expect(initials('Karim Haddad')).toBe('KH');
    expect(initials('  jean   paul  sarkis ')).toBe('JS');
  });

  it('uses one letter for a single name, and ? for none', () => {
    expect(initials('Eddy')).toBe('E');
    expect(initials('   ')).toBe('?');
  });

  it('keeps letters whole in any script', () => {
    expect(initials('سامي خوري')).toBe('سخ');
  });
});

describe('fitWithin', () => {
  it('scales the longest side down to the limit, keeping the shape', () => {
    expect(fitWithin(2048, 1024, 512)).toEqual({ width: 512, height: 256 });
    expect(fitWithin(600, 1200, 512)).toEqual({ width: 256, height: 512 });
  });

  it('never scales up', () => {
    expect(fitWithin(300, 200, 512)).toEqual({ width: 300, height: 200 });
  });
});

/** An encoder whose output size is bytesPerPixel × pixels × quality, recording each call. */
function fakeEncoder(bytesPerPixel: number) {
  const calls: [number, number, number][] = [];
  const encode = async (width: number, height: number, quality: number) => {
    calls.push([width, height, quality]);
    return { size: Math.round(width * height * bytesPerPixel * quality), width, quality };
  };
  return { calls, encode };
}

describe('compressLogo', () => {
  it('keeps the first try when it already fits: 512px, best quality', async () => {
    const { calls, encode } = fakeEncoder(0.1);
    const result = await compressLogo(4000, 3000, encode);
    expect(result).toMatchObject({ width: 512, quality: 0.85 });
    expect(calls).toHaveLength(1);
  });

  it('lowers the quality before the size', async () => {
    // 512 × 384 × 0.8 × q is under 100 KB from q = 0.55.
    const { encode } = fakeEncoder(0.8);
    const result = await compressLogo(4000, 3000, encode);
    expect(result).toMatchObject({ width: 512, quality: 0.55 });
    expect(result.size).toBeLessThanOrEqual(MAX_LOGO_BYTES);
  });

  it('shrinks when no quality is enough', async () => {
    const { encode } = fakeEncoder(2);
    const result = await compressLogo(512, 512, encode);
    expect(result.width).toBeLessThan(512);
    expect(result.size).toBeLessThanOrEqual(MAX_LOGO_BYTES);
  });

  it("doesn't encode a small image twice at the same size", async () => {
    const { calls, encode } = fakeEncoder(100);
    await expect(compressLogo(100, 100, encode)).rejects.toBeInstanceOf(LogoTooLargeError);
    const sizes = calls.map(([w, h]) => `${w}x${h}`);
    expect(sizes.filter((s) => s === '100x100')).toHaveLength(4); // once per quality
  });

  it('gives up when even the smallest version is too big', async () => {
    const { encode } = fakeEncoder(1000);
    await expect(compressLogo(512, 512, encode)).rejects.toBeInstanceOf(LogoTooLargeError);
  });
});

describe('isLogoDataUrl', () => {
  it('accepts small WebP, JPEG and PNG data URLs', () => {
    expect(isLogoDataUrl('data:image/webp;base64,UklGRg==')).toBe(true);
    expect(isLogoDataUrl('data:image/jpeg;base64,/9j/4A==')).toBe(true);
    expect(isLogoDataUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
  });

  it('refuses other types, other URLs and anything too long', () => {
    expect(isLogoDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
    expect(isLogoDataUrl('https://example.com/logo.png')).toBe(false);
    expect(isLogoDataUrl('data:image/png;base64,<script>')).toBe(false);
    const prefix = 'data:image/png;base64,';
    expect(isLogoDataUrl(prefix + 'A'.repeat(MAX_LOGO_DATA_URL_LENGTH - prefix.length))).toBe(true);
    expect(isLogoDataUrl(prefix + 'A'.repeat(MAX_LOGO_DATA_URL_LENGTH))).toBe(false);
  });

  it('fits a 100 KB image', () => {
    const base64Length = Math.ceil(MAX_LOGO_BYTES / 3) * 4;
    expect('data:image/webp;base64,'.length + base64Length).toBeLessThanOrEqual(
      MAX_LOGO_DATA_URL_LENGTH,
    );
  });
});

describe('colors', () => {
  it('checks the #RRGGBB format', () => {
    expect(isHexColor('#B8893C')).toBe(true);
    expect(isHexColor('#b8893c')).toBe(true);
    expect(isHexColor('#B8893')).toBe(false);
    expect(isHexColor('red')).toBe(false);
  });

  it('measures contrast like WCAG', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1);
  });

  it("doesn't warn about today's colors, but does about unreadable ones", () => {
    expect(contrastWarnings(DEFAULT_COLORS)).toEqual([]);
    expect(contrastWarnings({ dark: '#777777', accent: '#787878', light: '#888888' })).toHaveLength(2);
  });

  it('checks the logo and colors before saving', () => {
    expect(brandingErrors({ logo: null, colors: DEFAULT_COLORS })).toEqual([]);
    expect(brandingErrors({ logo: 'https://x.com/a.png', colors: { ...DEFAULT_COLORS, dark: 'black' } }))
      .toEqual([
        'The logo must be a WebP, JPEG or PNG image under 100 KB.',
        'Colors must be like #1E1B18.',
      ]);
  });
});

describe('theme colors', () => {
  it('lightens towards white', () => {
    expect(lighten('#000000', 0.5)).toBe('#808080');
    expect(lighten('#B8893C', 0)).toBe('#B8893C');
    expect(lighten('#B8893C', 1)).toBe('#FFFFFF');
  });

  it("maps the shop's colors onto the theme variables", () => {
    expect(themeVariables({ dark: '#101010', accent: '#000000', light: '#FAFAFA' })).toEqual({
      '--color-charcoal': '#101010',
      '--color-brass': '#000000',
      '--color-brass-light': '#595959',
      '--color-cream': '#FAFAFA',
    });
  });
});
