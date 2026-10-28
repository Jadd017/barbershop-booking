/**
 * Turns an image file the owner picked into the logo's data: URL, in the browser: drawn on a
 * canvas at most MAX_LOGO_SIDE px and encoded as WebP (JPEG where the browser can't make WebP),
 * shrunk by compressLogo (./logo.ts) until it's under MAX_LOGO_BYTES.
 */
import { compressLogo, isLogoDataUrl, LogoTooLargeError } from './logo';

/** Thrown when the file isn't an image the browser can read. */
export class NotAnImageError extends Error {
  constructor() {
    super('Not an image');
    this.name = 'NotAnImageError';
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image'))), type, quality),
  );
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * The logo for `file`, ready for settings/branding. NotAnImageError for a file the browser can't
 * read as an image, LogoTooLargeError if even the smallest version is too big.
 */
export async function logoFromFile(file: File): Promise<string> {
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(file);
  } catch {
    throw new NotAnImageError();
  }
  try {
    const canvas = document.createElement('canvas');
    const encoded = await compressLogo(image.width, image.height, async (width, height, quality) => {
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No canvas');
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);
      const webp = await toBlob(canvas, 'image/webp', quality);
      if (webp.type === 'image/webp') return webp;
      // JPEG has no transparency: put white behind the image instead of black.
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'source-over';
      return toBlob(canvas, 'image/jpeg', quality);
    });
    const url = await toDataUrl(encoded);
    if (!isLogoDataUrl(url)) throw new LogoTooLargeError();
    return url;
  } finally {
    image.close();
  }
}
