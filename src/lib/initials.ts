/**
 * The letters in a barber's initials circle: the first letter of his first and last name
 * ("Karim Haddad" → "KH"), or of his only name ("Eddy" → "E"). "?" for an empty name.
 */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  // Array.from splits by character, not UTF-16 unit, so names in any script keep whole letters.
  const first = Array.from(words[0])[0];
  const last = words.length > 1 ? Array.from(words[words.length - 1])[0] : '';
  return (first + last).toLocaleUpperCase();
}
