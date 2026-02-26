import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenBucketRateLimiter } from './rate-limiter.js';

describe('TokenBucketRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should have initial tokens available', () => {
    const limiter = new TokenBucketRateLimiter(10, 5);
    expect(limiter.getAvailableTokens()).toBe(10);
  });

  it('should allow acquiring when tokens are available', () => {
    const limiter = new TokenBucketRateLimiter(5, 1);
    expect(limiter.tryAcquire()).toBe(true);
  });

  it('should deplete tokens on acquire', () => {
    const limiter = new TokenBucketRateLimiter(3, 1);

    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);
  });

  it('should return false when no tokens remain', () => {
    const limiter = new TokenBucketRateLimiter(1, 0);

    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);
    expect(limiter.tryAcquire()).toBe(false);
  });

  it('should refill tokens over time', () => {
    const limiter = new TokenBucketRateLimiter(10, 5); // 5 tokens per second

    // Drain all tokens
    for (let i = 0; i < 10; i++) {
      limiter.tryAcquire();
    }
    expect(limiter.tryAcquire()).toBe(false);

    // Advance 1 second => 5 tokens refilled
    vi.advanceTimersByTime(1000);
    expect(limiter.getAvailableTokens()).toBeCloseTo(5, 0);
    expect(limiter.tryAcquire()).toBe(true);
  });

  it('should respect the burst limit (maxTokens cap)', () => {
    const limiter = new TokenBucketRateLimiter(5, 100); // high refill rate

    // Advance a long time — tokens should still cap at maxTokens
    vi.advanceTimersByTime(10_000);
    expect(limiter.getAvailableTokens()).toBe(5);
  });

  it('should partially refill tokens based on elapsed time', () => {
    const limiter = new TokenBucketRateLimiter(10, 10); // 10 tokens/sec

    // Drain all
    for (let i = 0; i < 10; i++) {
      limiter.tryAcquire();
    }
    expect(limiter.getAvailableTokens()).toBeCloseTo(0, 0);

    // Advance 500ms => 5 tokens
    vi.advanceTimersByTime(500);
    expect(limiter.getAvailableTokens()).toBeCloseTo(5, 0);
  });

  it('should use default constructor values', () => {
    const limiter = new TokenBucketRateLimiter();
    // Default: 100 max tokens, 10/sec refill
    expect(limiter.getAvailableTokens()).toBe(100);

    // Drain all 100
    for (let i = 0; i < 100; i++) {
      expect(limiter.tryAcquire()).toBe(true);
    }
    expect(limiter.tryAcquire()).toBe(false);

    // After 1 second, 10 should be available
    vi.advanceTimersByTime(1000);
    expect(limiter.getAvailableTokens()).toBeCloseTo(10, 0);
  });
});
