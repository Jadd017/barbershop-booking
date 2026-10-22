/** Shop details shown to customers: prices and the directions link. */

/** "$10", "$12.50". */
export function formatPrice(price: number): string {
  return `$${Number.isInteger(price) ? price : price.toFixed(2)}`;
}

/**
 * True for a link that's safe to put in an href: https, no spaces. Anything else (a
 * `javascript:` URL, a typo) is never linked. firestore.rules checks the same when saving.
 */
export function isSafeLink(url: string): boolean {
  return /^https:\/\/[^\s]+$/.test(url);
}
