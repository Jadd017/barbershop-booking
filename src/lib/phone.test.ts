import { describe, expect, it } from 'vitest';
import { formatLebanesePhone, normalizeLebanesePhone } from './phone';

describe('normalizeLebanesePhone', () => {
  it('accepts common ways of typing a Lebanese mobile', () => {
    expect(normalizeLebanesePhone('03 123 456')).toBe('+9613123456');
    expect(normalizeLebanesePhone('70-123-456')).toBe('+96170123456');
    expect(normalizeLebanesePhone('+961 81 123456')).toBe('+96181123456');
    expect(normalizeLebanesePhone('0096176123456')).toBe('+96176123456');
  });

  it('rejects landlines and malformed numbers', () => {
    expect(normalizeLebanesePhone('+961 1 234567')).toBeNull();
    expect(normalizeLebanesePhone('7012345')).toBeNull();
    expect(normalizeLebanesePhone('abc')).toBeNull();
  });
});

describe('formatLebanesePhone', () => {
  it('groups digits for reading', () => {
    expect(formatLebanesePhone('+96170123456')).toBe('+961 70 123 456');
    expect(formatLebanesePhone('+9613123456')).toBe('+961 3 123 456');
  });
});
