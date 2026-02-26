import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseRelativeTime, isRelativeTime } from './time.js';

describe('time utils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-26T05:00:00Z')); // epoch: 1772082000
  });
  afterEach(() => vi.useRealTimers());

  describe('isRelativeTime', () => {
    it('matches now-Xh', () => expect(isRelativeTime('now-1h')).toBe(true));
    it('matches now-Xm', () => expect(isRelativeTime('now-30m')).toBe(true));
    it('matches now-Xd', () => expect(isRelativeTime('now-7d')).toBe(true));
    it('matches now', () => expect(isRelativeTime('now')).toBe(true));
    it('rejects epoch', () => expect(isRelativeTime('1772082000')).toBe(false));
    it('rejects RFC3339', () => expect(isRelativeTime('2026-02-26T05:00:00Z')).toBe(false));
  });

  describe('parseRelativeTime', () => {
    it('returns now as current epoch', () => {
      expect(parseRelativeTime('now')).toBe('1772082000');
    });
    it('parses now-1h', () => {
      expect(parseRelativeTime('now-1h')).toBe('1772078400'); // -3600
    });
    it('parses now-30m', () => {
      expect(parseRelativeTime('now-30m')).toBe('1772080200'); // -1800
    });
    it('parses now-6h', () => {
      expect(parseRelativeTime('now-6h')).toBe('1772060400'); // -21600
    });
    it('parses now-7d', () => {
      expect(parseRelativeTime('now-7d')).toBe('1771477200'); // -604800
    });
    it('passes through epoch strings unchanged', () => {
      expect(parseRelativeTime('1772082000')).toBe('1772082000');
    });
    it('passes through RFC3339 unchanged', () => {
      expect(parseRelativeTime('2026-02-26T05:00:00Z')).toBe('2026-02-26T05:00:00Z');
    });
  });
});
