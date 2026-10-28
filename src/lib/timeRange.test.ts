/** Time ranges stay left to right in Arabic ("10:00–20:00", not "20:00–10:00"). */
import { afterEach, describe, expect, it } from 'vitest';
import i18n, { timeRange } from '../i18n';
import ar from '../locales/ar.json';
import { weeklyHoursSummary } from './schedule';

const LRI = '⁦';
const PDI = '⁩';

afterEach(() => i18n.changeLanguage('en'));

/** Every string in a locale file, however deeply nested. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  return value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];
}

describe('time ranges in Arabic', () => {
  it('timeRange is plain in English and in a left-to-right isolate in Arabic', async () => {
    expect(timeRange('10:00', '20:00')).toBe('10:00–20:00');
    await i18n.changeLanguage('ar');
    expect(timeRange('10:00', '20:00')).toBe(`${LRI}10:00–20:00${PDI}`);
  });

  it('the opening hours and breaks are isolated in Arabic', async () => {
    const day = { closed: false, start: '10:00', end: '20:00', breaks: [{ start: '14:00', end: '15:00' }] };
    await i18n.changeLanguage('ar');
    const [line] = weeklyHoursSummary(Array.from({ length: 7 }, () => day));
    expect(line).toContain(`${LRI}10:00–20:00${PDI}`);
    expect(line).toContain(`${LRI}14:00–15:00${PDI}`);
  });

  it('every {{a}}–{{b}} range in the Arabic strings is isolated', async () => {
    const ranges = strings(ar).flatMap((s) => [...s.matchAll(/.?\{\{\w+\}\}–\{\{\w+\}\}.?/gu)].map((m) => m[0]));
    expect(ranges.length).toBeGreaterThan(0);
    for (const range of ranges) expect(range).toMatch(new RegExp(`^${LRI}.*${PDI}$`, 'u'));
    await i18n.changeLanguage('ar');
    expect(i18n.t('header.openToday', { start: '10:00', end: '20:00' })).toContain(`${LRI}10:00–20:00${PDI}`);
  });
});
