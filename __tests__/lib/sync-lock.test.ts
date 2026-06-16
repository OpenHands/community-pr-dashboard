import { secondsUntilNextSync } from '@/lib/sync-policy';

describe('secondsUntilNextSync', () => {
  const now = new Date('2026-01-01T00:05:00.000Z');

  it('allows sync when there is no previous successful sync', () => {
    expect(secondsUntilNextSync(null, now, 300)).toBe(0);
  });

  it('returns remaining cooldown seconds when the last sync is recent', () => {
    expect(
      secondsUntilNextSync('2026-01-01T00:02:30.000Z', now, 300)
    ).toBe(150);
  });

  it('allows sync after the cooldown window expires', () => {
    expect(
      secondsUntilNextSync('2026-01-01T00:00:00.000Z', now, 300)
    ).toBe(0);
  });

  it('ignores malformed timestamps instead of blocking refresh forever', () => {
    expect(secondsUntilNextSync('not-a-date', now, 300)).toBe(0);
  });
});
