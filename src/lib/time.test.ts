import { describe, expect, it } from 'vitest';
import { zonedInstant } from './time';

describe('zonedInstant', () => {
  it('uses Beirut summer time (UTC+3) before the last Sunday of October', () => {
    expect(zonedInstant('2026-10-22', '12:30', 'Asia/Beirut').toISOString()).toBe(
      '2026-10-22T09:30:00.000Z',
    );
  });

  it('uses Beirut winter time (UTC+2) after it', () => {
    expect(zonedInstant('2026-11-02', '12:30', 'Asia/Beirut').toISOString()).toBe(
      '2026-11-02T10:30:00.000Z',
    );
  });
});
