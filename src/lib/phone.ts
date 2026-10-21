/**
 * Lebanese mobile numbers: "3" + 6 digits (old 03 numbers) or
 * 70/71/76/78/79/81 + 6 digits, after the +961 country code.
 */
const LEBANESE_MOBILE = /^(3\d{6}|(70|71|76|78|79|81)\d{6})$/;

/**
 * Accepts the common ways people type a Lebanese mobile number
 * ("03 123 456", "70-123456", "+961 70 123456", "0096170123456")
 * and returns it as "+961XXXXXXXX", or null if it isn't valid.
 */
export function normalizeLebanesePhone(input: string): string | null {
  let digits = input.replace(/[\s\-().]/g, '');
  if (digits.startsWith('+961')) digits = digits.slice(4);
  else if (digits.startsWith('00961')) digits = digits.slice(5);
  else if (digits.startsWith('961') && digits.length > 8) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);

  return LEBANESE_MOBILE.test(digits) ? `+961${digits}` : null;
}
