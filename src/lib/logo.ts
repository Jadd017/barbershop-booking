/**
 * The shop's logo: shrunk in the browser and kept as a small data: URL in settings/branding
 * (no Firebase Storage on the free plan). See docs/ARCHITECTURE.md, 4.2.
 *
 * The search for a size that fits is here, with the encoding passed in, so it can be tested
 * without a browser. The page passes an encoder that draws the image on a canvas.
 */
import { MAX_LOGO_BYTES, MAX_LOGO_DATA_URL_LENGTH, MAX_LOGO_SIDE } from '../config';

/** Thrown when even the smallest, lowest-quality version is over MAX_LOGO_BYTES. */
export class LogoTooLargeError extends Error {
  constructor() {
    super('Logo too large even after compression');
    this.name = 'LogoTooLargeError';
  }
}

/** Encodes the image scaled to `width` × `height` at `quality` (0–1). */
export type LogoEncoder<T extends { size: number }> = (
  width: number,
  height: number,
  quality: number,
) => Promise<T>;

/** Tried in turn at each size, best first. */
const QUALITIES = [0.85, 0.7, 0.55, 0.4];

/** Each smaller size is this much of the last. */
const SHRINK = 0.75;

/** Below this longest side a logo is no longer worth showing. */
const MIN_SIDE = 64;

/** `width` × `height` scaled down (never up) so the longest side is at most `max`. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * The first encoding under MAX_LOGO_BYTES: at most MAX_LOGO_SIDE px, lowering the quality
 * before the size. Throws LogoTooLargeError if nothing down to MIN_SIDE px fits.
 */
export async function compressLogo<T extends { size: number }>(
  width: number,
  height: number,
  encode: LogoEncoder<T>,
): Promise<T> {
  let lastWidth = 0;
  for (let side = MAX_LOGO_SIDE; side >= MIN_SIDE; side = Math.floor(side * SHRINK)) {
    const size = fitWithin(width, height, side);
    // A small image keeps its size until `side` drops below it: don't encode it twice.
    if (size.width === lastWidth) continue;
    lastWidth = size.width;
    for (const quality of QUALITIES) {
      const encoded = await encode(size.width, size.height, quality);
      if (encoded.size <= MAX_LOGO_BYTES) return encoded;
    }
  }
  throw new LogoTooLargeError();
}

const LOGO_DATA_URL = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/;

/**
 * True for a logo settings/branding accepts: a WebP, JPEG or PNG data: URL of at most
 * MAX_LOGO_DATA_URL_LENGTH characters. firestore.rules checks the same when saving.
 */
export function isLogoDataUrl(value: string): boolean {
  return value.length <= MAX_LOGO_DATA_URL_LENGTH && LOGO_DATA_URL.test(value);
}
