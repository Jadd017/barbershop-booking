/**
 * 32 characters: A–Z without I and O, digits 2–9 (no 0 or 1),
 * so codes can't be misread when written down or read aloud.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

export function generateBookingCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  // 256 is a multiple of 32, so `% 32` picks every character with equal odds.
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}
