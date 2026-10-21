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

/** "+96170123456" → "+961 70 123 456", "+9613123456" → "+961 3 123 456". */
export function formatLebanesePhone(phone: string): string {
  const local = phone.replace(/^\+961/, '');
  const prefixLength = local.length === 7 ? 1 : 2;
  return `+961 ${local.slice(0, prefixLength)} ${local.slice(prefixLength, -3)} ${local.slice(-3)}`;
}
