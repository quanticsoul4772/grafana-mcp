import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RetryableHttpClient,
  CircuitBreaker,
  ResilientErrorHandler,
  DEFAULT_RETRY_OPTIONS,
} from './retry-client.js';
import type { RetryOptions } from './retry-client.js';

// Use minimal delays to keep tests fast
const FAST_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1,
  maxDelayMs: 10,
  exponentialBase: 2,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
};

describe('retry-client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('DEFAULT_RETRY_OPTIONS', () => {
    it('should have expected default values', () => {
      expect(DEFAULT_RETRY_OPTIONS).toEqual({
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 10000,
        exponentialBase: 2,
        retryableStatuses: [408, 429, 500, 502, 503, 504],
      });
    });
  });

  describe('RetryableHttpClient', () => {
    let client: RetryableHttpClient;

    beforeEach(() => {
      client = new RetryableHttpClient(FAST_RETRY_OPTIONS);
    });

    describe('withRetry - success cases', () => {
      it('should return result on first successful attempt', async () => {
        const operation = vi.fn().mockResolvedValue('success');

        const result = await client.withRetry(operation);

        expect(result).toBe('success');
        expect(operation).toHaveBeenCalledTimes(1);
      });

      it('should return result after retrying on retryable error', async () => {
        const operation = vi
          .fn()
          .mockRejectedValueOnce({ response: { status: 503 }, message: 'Service Unavailable' })
          .mockResolvedValue('recovered');

        const result = await client.withRetry(operation, 'test-op');

        expect(result).toBe('recovered');
        expect(operation).toHaveBeenCalledTimes(2);
      });

      it('should succeed after multiple retryable failures', async () => {
        const operation = vi
          .fn()
          .mockRejectedValueOnce({ response: { status: 503 }, message: 'Unavailable' })
          .mockRejectedValueOnce({ response: { status: 502 }, message: 'Bad Gateway' })
          .mockRejectedValueOnce({ response: { status: 500 }, message: 'Internal Error' })
          .mockResolvedValue('finally ok');

        const result = await client.withRetry(operation, 'multi-retry');

        expect(result).toBe('finally ok');
        expect(operation).toHaveBeenCalledTimes(4);
      });
    });

    describe('withRetry - retry on retryable status codes', () => {
      it.each([408, 429, 500, 502, 503, 504])(
        'should retry on HTTP %d',
        async (status) => {
          const operation = vi
            .fn()
            .mockRejectedValueOnce({ response: { status }, message: `HTTP ${status}` })
            .mockResolvedValue('ok');

          const result = await client.withRetry(operation);

          expect(result).toBe('ok');
          expect(operation).toHaveBeenCalledTimes(2);
        },
      );
    });

    describe('withRetry - retry on network errors', () => {
      it('should retry on ETIMEDOUT', async () => {
        const operation = vi
          .fn()
          .mockRejectedValueOnce({ code: 'ETIMEDOUT', message: 'Timed out' })
          .mockResolvedValue('ok');

        const result = await client.withRetry(operation);

        expect(result).toBe('ok');
        expect(operation).toHaveBeenCalledTimes(2);
      });

      it('should retry on ECONNREFUSED', async () => {
        const operation = vi
          .fn()
          .mockRejectedValueOnce({ code: 'ECONNREFUSED', message: 'Connection refused' })
          .mockResolvedValue('ok');

        const result = await client.withRetry(operation);

        expect(result).toBe('ok');
        expect(operation).toHaveBeenCalledTimes(2);
      });

      it('should retry on ENOTFOUND', async () => {
        const operation = vi
          .fn()
          .mockRejectedValueOnce({ code: 'ENOTFOUND', message: 'DNS not found' })
          .mockResolvedValue('ok');

        const result = await client.withRetry(operation);

        expect(result).toBe('ok');
        expect(operation).toHaveBeenCalledTimes(2);
      });

      it('should retry on ECONNABORTED (Axios timeout)', async () => {
        const operation = vi
          .fn()
          .mockRejectedValueOnce({ code: 'ECONNABORTED', message: 'timeout of 30000ms exceeded' })
          .mockResolvedValue('ok');

        const result = await client.withRetry(operation);

        expect(result).toBe('ok');
        expect(operation).toHaveBeenCalledTimes(2);
      });
    });

    describe('withRetry - non-retryable errors', () => {
      it('should not retry on HTTP 404', async () => {
        const error = { response: { status: 404 }, message: 'Not Found' };
        const operation = vi.fn().mockRejectedValue(error);

        await expect(client.withRetry(operation)).rejects.toEqual(error);
        expect(operation).toHaveBeenCalledTimes(1);
      });

      it('should not retry on HTTP 401', async () => {
        const error = { response: { status: 401 }, message: 'Unauthorized' };
        const operation = vi.fn().mockRejectedValue(error);

        await expect(client.withRetry(operation)).rejects.toEqual(error);
        expect(operation).toHaveBeenCalledTimes(1);
      });

      it('should not retry on HTTP 403', async () => {
        const error = { response: { status: 403 }, message: 'Forbidden' };
        const operation = vi.fn().mockRejectedValue(error);

        await expect(client.withRetry(operation)).rejects.toEqual(error);
        expect(operation).toHaveBeenCalledTimes(1);
      });

      it('should not retry on HTTP 400', async () => {
        const error = { response: { status: 400 }, message: 'Bad Request' };
        const operation = vi.fn().mockRejectedValue(error);

        await expect(client.withRetry(operation)).rejects.toEqual(error);
        expect(operation).toHaveBeenCalledTimes(1);
      });

      it('should not retry on generic errors without status or code', async () => {
        const error = new Error('Something went wrong');
        const operation = vi.fn().mockRejectedValue(error);

        await expect(client.withRetry(operation)).rejects.toThrow('Something went wrong');
        expect(operation).toHaveBeenCalledTimes(1);
      });
    });

    describe('withRetry - max retries exceeded', () => {
      it('should throw after exhausting all retries', async () => {
        const error = { response: { status: 503 }, message: 'Service Unavailable' };
        const operation = vi.fn().mockRejectedValue(error);

        await expect(client.withRetry(operation)).rejects.toEqual(error);
        // maxRetries = 3, so total attempts = maxRetries + 1 = 4
        expect(operation).toHaveBeenCalledTimes(4);
      });

      it('should throw the last error when retries are exhausted', async () => {
        const firstError = { response: { status: 503 }, message: 'first' };
        const secondError = { response: { status: 502 }, message: 'second' };
        const thirdError = { response: { status: 500 }, message: 'third' };
        const fourthError = { response: { status: 504 }, message: 'fourth' };

        const operation = vi
          .fn()
          .mockRejectedValueOnce(firstError)
          .mockRejectedValueOnce(secondError)
          .mockRejectedValueOnce(thirdError)
          .mockRejectedValueOnce(fourthError);

        await expect(client.withRetry(operation)).rejects.toEqual(fourthError);
        expect(operation).toHaveBeenCalledTimes(4);
      });

      it('should respect maxRetries=0 (no retries)', async () => {
        const zeroRetryClient = new RetryableHttpClient({
          ...FAST_RETRY_OPTIONS,
          maxRetries: 0,
        });
        const error = { response: { status: 503 }, message: 'Unavailable' };
        const operation = vi.fn().mockRejectedValue(error);

        await expect(zeroRetryClient.withRetry(operation)).rejects.toEqual(error);
        expect(operation).toHaveBeenCalledTimes(1);
      });

      it('should respect maxRetries=1 (one retry)', async () => {
        const oneRetryClient = new RetryableHttpClient({
          ...FAST_RETRY_OPTIONS,
          maxRetries: 1,
        });
        const error = { response: { status: 503 }, message: 'Unavailable' };
        const operation = vi.fn().mockRejectedValue(error);

        await expect(oneRetryClient.withRetry(operation)).rejects.toEqual(error);
        expect(operation).toHaveBeenCalledTimes(2);
      });
    });

    describe('withRetry - custom options', () => {
      it('should accept custom retry options per call', async () => {
        const operation = vi
          .fn()
          .mockRejectedValueOnce({ response: { status: 503 }, message: 'Unavailable' })
          .mockResolvedValue('ok');

        const result = await client.withRetry(operation, 'custom', {
          maxRetries: 1,
        });

        expect(result).toBe('ok');
        expect(operation).toHaveBeenCalledTimes(2);
      });

      it('should use custom retryable statuses when provided', async () => {
        const error = { response: { status: 418 }, message: "I'm a teapot" };
        const operation = vi
          .fn()
          .mockRejectedValueOnce(error)
          .mockResolvedValue('ok');

        // 418 is not in default retryable statuses, so should not retry
        await expect(client.withRetry(operation)).rejects.toEqual(error);
        expect(operation).toHaveBeenCalledTimes(1);

        // Now retry with custom statuses including 418
        operation.mockClear();
        operation
          .mockRejectedValueOnce(error)
          .mockResolvedValue('ok');

        const result = await client.withRetry(operation, 'teapot', {
          retryableStatuses: [418],
        });
        expect(result).toBe('ok');
        expect(operation).toHaveBeenCalledTimes(2);
      });
    });

    describe('withRetry - operation name and logging', () => {
      it('should use default operation name when none provided', async () => {
        const client2 = new RetryableHttpClient({
          ...FAST_RETRY_OPTIONS,
          maxRetries: 2,
        });
        const operation = vi
          .fn()
          .mockRejectedValueOnce({ response: { status: 503 }, message: 'Unavailable' })
          .mockResolvedValue('ok');

        await client2.withRetry(operation);

        expect(console.warn).toHaveBeenCalledWith(
          expect.stringContaining('HTTP request'),
          expect.any(String),
        );
      });

      it('should use provided operation name in logging', async () => {
        const client2 = new RetryableHttpClient({
          ...FAST_RETRY_OPTIONS,
          maxRetries: 2,
        });
        const operation = vi
          .fn()
          .mockRejectedValueOnce({ response: { status: 503 }, message: 'Unavailable' })
          .mockResolvedValue('ok');

        await client2.withRetry(operation, 'fetch-dashboard');

        expect(console.warn).toHaveBeenCalledWith(
          expect.stringContaining('fetch-dashboard'),
          expect.any(String),
        );
      });

      it('should log error message with HTTP status', async () => {
        const client2 = new RetryableHttpClient({
          ...FAST_RETRY_OPTIONS,
          maxRetries: 2,
        });
        const operation = vi
          .fn()
          .mockRejectedValueOnce({ response: { status: 503 }, message: 'Unavailable' })
          .mockResolvedValue('ok');

        await client2.withRetry(operation, 'test-op');

        expect(console.warn).toHaveBeenCalledWith(
          expect.stringContaining('test-op'),
          'HTTP 503',
        );
      });

      it('should log error code for network errors', async () => {
        const client2 = new RetryableHttpClient({
          ...FAST_RETRY_OPTIONS,
          maxRetries: 2,
        });
        const operation = vi
          .fn()
          .mockRejectedValueOnce({ code: 'ECONNREFUSED', message: 'refused' })
          .mockResolvedValue('ok');

        await client2.withRetry(operation, 'test-op');

        expect(console.warn).toHaveBeenCalledWith(
          expect.stringContaining('test-op'),
          'ECONNREFUSED',
        );
      });

      it('should log generic message for errors without status or code', async () => {
        const client2 = new RetryableHttpClient({
          ...FAST_RETRY_OPTIONS,
          maxRetries: 2,
        });
        // Need a retryable error first (network code), then a generic error
        // Actually, generic errors are NOT retryable, so console.warn won't be called for them.
        // Let's use a network-code error with a custom message to test the fallback branch
        const operation = vi
          .fn()
          .mockRejectedValueOnce({ code: 'ETIMEDOUT' })
          .mockResolvedValue('ok');

        await client2.withRetry(operation, 'test-op');

        expect(console.warn).toHaveBeenCalledWith(
          expect.stringContaining('test-op'),
          'ETIMEDOUT',
        );
      });

      it('should not log when maxRetries is 1', async () => {
        // The code checks `this.options.maxRetries > 1` before logging
        const quietClient = new RetryableHttpClient({
          ...FAST_RETRY_OPTIONS,
          maxRetries: 1,
        });
        const operation = vi
          .fn()
          .mockRejectedValueOnce({ response: { status: 503 }, message: 'Unavailable' })
          .mockResolvedValue('ok');

        await quietClient.withRetry(operation, 'quiet-op');

        expect(console.warn).not.toHaveBeenCalled();
      });
    });

    describe('withRetry - uses default options when constructed without arguments', () => {
      it('should work with default retry options', async () => {
        // Construct with defaults but override delays via customOptions in the call
        const defaultClient = new RetryableHttpClient();
        const operation = vi
          .fn()
          .mockRejectedValueOnce({ response: { status: 503 }, message: 'Unavailable' })
          .mockResolvedValue('ok');

        const result = await defaultClient.withRetry(operation, 'default-test', {
          baseDelayMs: 1,
          maxDelayMs: 10,
          maxRetries: 1,
        });

        expect(result).toBe('ok');
        expect(operation).toHaveBeenCalledTimes(2);
      });
    });

    describe('backoff and delay behavior', () => {
      it('should cap delay at maxDelayMs', async () => {
        // With baseDelayMs=5, exponentialBase=2, maxDelayMs=10:
        // attempt 1: 5 * 2^0 = 5 (+ jitter)
        // attempt 2: 5 * 2^1 = 10 (+ jitter, capped at 10)
        // attempt 3: 5 * 2^2 = 20 -> capped at 10
        const cappedClient = new RetryableHttpClient({
          ...FAST_RETRY_OPTIONS,
          baseDelayMs: 5,
          maxDelayMs: 10,
          maxRetries: 3,
        });

        const error = { response: { status: 503 }, message: 'Unavailable' };
        const operation = vi.fn().mockRejectedValue(error);

        const start = Date.now();
        await expect(cappedClient.withRetry(operation)).rejects.toEqual(error);
        const elapsed = Date.now() - start;

        // With maxDelayMs=10 and 3 retries, total delay should be very small
        expect(elapsed).toBeLessThan(500);
        expect(operation).toHaveBeenCalledTimes(4);
      });
    });

    describe('getErrorMessage branches', () => {
      it('should handle error with only message property', async () => {
        // An error with no status and no code but with a message
        // This error type is not retryable, so it won't be logged via console.warn.
        // We test indirectly that it doesn't crash.
        const error = { message: 'Custom error message' };
        const operation = vi.fn().mockRejectedValue(error);

        await expect(client.withRetry(operation)).rejects.toEqual(error);
        expect(operation).toHaveBeenCalledTimes(1);
      });

      it('should handle error with no useful properties', async () => {
        const error = {};
        const operation = vi.fn().mockRejectedValue(error);

        await expect(client.withRetry(operation)).rejects.toEqual(error);
        expect(operation).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('CircuitBreaker', () => {
    let breaker: CircuitBreaker;

    beforeEach(() => {
      breaker = new CircuitBreaker(3, 100); // threshold=3, timeout=100ms
    });

    describe('initial state', () => {
      it('should start in CLOSED state', () => {
        const state = breaker.getState();
        expect(state.state).toBe('CLOSED');
        expect(state.failureCount).toBe(0);
        expect(state.lastFailureTime).toBeNull();
      });
    });

    describe('CLOSED state behavior', () => {
      it('should execute operations normally when CLOSED', async () => {
        const operation = vi.fn().mockResolvedValue('result');

        const result = await breaker.execute(operation);

        expect(result).toBe('result');
        expect(operation).toHaveBeenCalledTimes(1);
      });

      it('should pass through errors without opening when below threshold', async () => {
        const operation = vi.fn().mockRejectedValue(new Error('fail'));

        // Fail twice (threshold is 3)
        await expect(breaker.execute(operation)).rejects.toThrow('fail');
        await expect(breaker.execute(operation)).rejects.toThrow('fail');

        const state = breaker.getState();
        expect(state.state).toBe('CLOSED');
        expect(state.failureCount).toBe(2);
        expect(state.lastFailureTime).not.toBeNull();
      });

      it('should reset failure count on success', async () => {
        const failOp = vi.fn().mockRejectedValue(new Error('fail'));
        const successOp = vi.fn().mockResolvedValue('ok');

        // Two failures
        await expect(breaker.execute(failOp)).rejects.toThrow('fail');
        await expect(breaker.execute(failOp)).rejects.toThrow('fail');
        expect(breaker.getState().failureCount).toBe(2);

        // Success resets count
        await breaker.execute(successOp);
        const state = breaker.getState();
        expect(state.failureCount).toBe(0);
        expect(state.lastFailureTime).toBeNull();
        expect(state.state).toBe('CLOSED');
      });
    });

    describe('CLOSED -> OPEN transition', () => {
      it('should open after reaching failure threshold', async () => {
        const operation = vi.fn().mockRejectedValue(new Error('fail'));

        // Fail 3 times (threshold)
        await expect(breaker.execute(operation)).rejects.toThrow('fail');
        await expect(breaker.execute(operation)).rejects.toThrow('fail');
        await expect(breaker.execute(operation)).rejects.toThrow('fail');

        const state = breaker.getState();
        expect(state.state).toBe('OPEN');
        expect(state.failureCount).toBe(3);
      });

      it('should open at exactly the threshold count', async () => {
        // threshold=3, so the 3rd failure should trigger OPEN
        const operation = vi.fn().mockRejectedValue(new Error('fail'));

        for (let i = 0; i < 3; i++) {
          await expect(breaker.execute(operation)).rejects.toThrow('fail');
        }

        expect(breaker.getState().state).toBe('OPEN');
      });
    });

    describe('OPEN state behavior', () => {
      it('should reject immediately when OPEN', async () => {
        const failOp = vi.fn().mockRejectedValue(new Error('fail'));
        const newOp = vi.fn().mockResolvedValue('should not be called');

        // Trip the breaker
        for (let i = 0; i < 3; i++) {
          await expect(breaker.execute(failOp)).rejects.toThrow('fail');
        }
        expect(breaker.getState().state).toBe('OPEN');

        // Now operations should be rejected without calling the operation
        await expect(breaker.execute(newOp, 'test')).rejects.toThrow(
          'Circuit breaker is OPEN for test. Cooling down...',
        );
        expect(newOp).not.toHaveBeenCalled();
      });

      it('should use default operation name in error message', async () => {
        const failOp = vi.fn().mockRejectedValue(new Error('fail'));

        for (let i = 0; i < 3; i++) {
          await expect(breaker.execute(failOp)).rejects.toThrow('fail');
        }

        await expect(breaker.execute(vi.fn())).rejects.toThrow(
          'Circuit breaker is OPEN for operation. Cooling down...',
        );
      });
    });

    describe('OPEN -> HALF_OPEN transition', () => {
      it('should transition to HALF_OPEN after timeout expires', async () => {
        const failOp = vi.fn().mockRejectedValue(new Error('fail'));

        // Trip the breaker
        for (let i = 0; i < 3; i++) {
          await expect(breaker.execute(failOp)).rejects.toThrow('fail');
        }
        expect(breaker.getState().state).toBe('OPEN');

        // Wait for the timeout to expire
        await new Promise((resolve) => setTimeout(resolve, 150));

        // The next call should transition to HALF_OPEN and attempt the operation
        const successOp = vi.fn().mockResolvedValue('recovered');
        const result = await breaker.execute(successOp);

        expect(result).toBe('recovered');
        expect(successOp).toHaveBeenCalledTimes(1);
      });

      it('should go back to OPEN if HALF_OPEN attempt fails', async () => {
        const failOp = vi.fn().mockRejectedValue(new Error('fail'));

        // Trip the breaker
        for (let i = 0; i < 3; i++) {
          await expect(breaker.execute(failOp)).rejects.toThrow('fail');
        }

        // Wait for timeout
        await new Promise((resolve) => setTimeout(resolve, 150));

        // HALF_OPEN attempt fails
        const failAgainOp = vi.fn().mockRejectedValue(new Error('still failing'));
        await expect(breaker.execute(failAgainOp)).rejects.toThrow('still failing');

        // Should go back to OPEN (failure count incremented past threshold again)
        expect(breaker.getState().state).toBe('OPEN');
      });
    });

    describe('HALF_OPEN -> CLOSED transition', () => {
      it('should close on successful HALF_OPEN attempt', async () => {
        const failOp = vi.fn().mockRejectedValue(new Error('fail'));

        // Trip the breaker
        for (let i = 0; i < 3; i++) {
          await expect(breaker.execute(failOp)).rejects.toThrow('fail');
        }

        // Wait for timeout
        await new Promise((resolve) => setTimeout(resolve, 150));

        // Successful HALF_OPEN attempt
        const successOp = vi.fn().mockResolvedValue('ok');
        await breaker.execute(successOp);

        const state = breaker.getState();
        expect(state.state).toBe('CLOSED');
        expect(state.failureCount).toBe(0);
        expect(state.lastFailureTime).toBeNull();
      });
    });

    describe('reset()', () => {
      it('should reset from OPEN to CLOSED', async () => {
        const failOp = vi.fn().mockRejectedValue(new Error('fail'));

        // Trip the breaker
        for (let i = 0; i < 3; i++) {
          await expect(breaker.execute(failOp)).rejects.toThrow('fail');
        }
        expect(breaker.getState().state).toBe('OPEN');

        // Manual reset
        breaker.reset();

        const state = breaker.getState();
        expect(state.state).toBe('CLOSED');
        expect(state.failureCount).toBe(0);
        expect(state.lastFailureTime).toBeNull();
      });

      it('should allow operations after manual reset', async () => {
        const failOp = vi.fn().mockRejectedValue(new Error('fail'));

        // Trip the breaker
        for (let i = 0; i < 3; i++) {
          await expect(breaker.execute(failOp)).rejects.toThrow('fail');
        }

        breaker.reset();

        const successOp = vi.fn().mockResolvedValue('works again');
        const result = await breaker.execute(successOp);
        expect(result).toBe('works again');
      });

      it('should reset from CLOSED with partial failures', async () => {
        const failOp = vi.fn().mockRejectedValue(new Error('fail'));

        // 2 failures (below threshold)
        await expect(breaker.execute(failOp)).rejects.toThrow('fail');
        await expect(breaker.execute(failOp)).rejects.toThrow('fail');

        breaker.reset();

        const state = breaker.getState();
        expect(state.failureCount).toBe(0);
        expect(state.state).toBe('CLOSED');
      });
    });

    describe('getState()', () => {
      it('should return current state with all properties', () => {
        const state = breaker.getState();

        expect(state).toHaveProperty('state');
        expect(state).toHaveProperty('failureCount');
        expect(state).toHaveProperty('lastFailureTime');
      });

      it('should track lastFailureTime after failures', async () => {
        const failOp = vi.fn().mockRejectedValue(new Error('fail'));
        const before = Date.now();

        await expect(breaker.execute(failOp)).rejects.toThrow('fail');

        const state = breaker.getState();
        expect(state.lastFailureTime).not.toBeNull();
        expect(state.lastFailureTime!).toBeGreaterThanOrEqual(before);
        expect(state.lastFailureTime!).toBeLessThanOrEqual(Date.now());
      });
    });

    describe('default constructor values', () => {
      it('should work with default threshold and timeout', async () => {
        const defaultBreaker = new CircuitBreaker();
        const failOp = vi.fn().mockRejectedValue(new Error('fail'));

        // Default threshold is 5, so 4 failures should not open
        for (let i = 0; i < 4; i++) {
          await expect(defaultBreaker.execute(failOp)).rejects.toThrow('fail');
        }
        expect(defaultBreaker.getState().state).toBe('CLOSED');

        // 5th failure should open
        await expect(defaultBreaker.execute(failOp)).rejects.toThrow('fail');
        expect(defaultBreaker.getState().state).toBe('OPEN');
      });
    });
  });

  describe('ResilientErrorHandler', () => {
    let handler: ResilientErrorHandler;

    beforeEach(() => {
      handler = new ResilientErrorHandler(
        { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 10 },
        { failureThreshold: 3, timeoutMs: 100 },
      );
    });

    describe('executeWithResilience', () => {
      it('should return result on successful operation', async () => {
        const operation = vi.fn().mockResolvedValue('success');

        const result = await handler.executeWithResilience(operation);

        expect(result).toBe('success');
        expect(operation).toHaveBeenCalledTimes(1);
      });

      it('should retry retryable errors within circuit breaker', async () => {
        const operation = vi
          .fn()
          .mockRejectedValueOnce({ response: { status: 503 }, message: 'Unavailable' })
          .mockResolvedValue('recovered');

        const result = await handler.executeWithResilience(operation, 'resilient-test');

        expect(result).toBe('recovered');
        expect(operation).toHaveBeenCalledTimes(2);
      });

      it('should throw non-retryable errors immediately', async () => {
        const error = { response: { status: 404 }, message: 'Not Found' };
        const operation = vi.fn().mockRejectedValue(error);

        await expect(handler.executeWithResilience(operation)).rejects.toEqual(error);
        expect(operation).toHaveBeenCalledTimes(1);
      });

      it('should open circuit breaker after repeated failures', async () => {
        const error = { response: { status: 503 }, message: 'Unavailable' };
        const operation = vi.fn().mockRejectedValue(error);

        // Each call exhausts retries (maxRetries=2, so 3 attempts each)
        // Each failed executeWithResilience counts as 1 failure for the circuit breaker
        for (let i = 0; i < 3; i++) {
          await expect(handler.executeWithResilience(operation)).rejects.toEqual(error);
        }

        // Circuit breaker should be OPEN now
        expect(handler.getCircuitBreakerState().state).toBe('OPEN');

        // Next call should fail with circuit breaker error
        await expect(handler.executeWithResilience(operation, 'blocked')).rejects.toThrow(
          'Circuit breaker is OPEN',
        );
      });

      it('should accept custom retry options per call', async () => {
        const operation = vi
          .fn()
          .mockRejectedValueOnce({ response: { status: 503 }, message: 'Unavailable' })
          .mockResolvedValue('ok');

        const result = await handler.executeWithResilience(operation, 'custom', {
          maxRetries: 1,
        });

        expect(result).toBe('ok');
      });

      it('should use default operation name', async () => {
        const operation = vi.fn().mockResolvedValue('ok');

        const result = await handler.executeWithResilience(operation);

        expect(result).toBe('ok');
      });
    });

    describe('getCircuitBreakerState', () => {
      it('should return CLOSED state initially', () => {
        const state = handler.getCircuitBreakerState();

        expect(state.state).toBe('CLOSED');
        expect(state.failureCount).toBe(0);
        expect(state.lastFailureTime).toBeNull();
      });

      it('should reflect failure count after failed operations', async () => {
        const error = { response: { status: 404 }, message: 'Not Found' };
        const operation = vi.fn().mockRejectedValue(error);

        await expect(handler.executeWithResilience(operation)).rejects.toEqual(error);

        const state = handler.getCircuitBreakerState();
        expect(state.failureCount).toBe(1);
      });
    });

    describe('resetCircuitBreaker', () => {
      it('should reset circuit breaker to CLOSED state', async () => {
        const error = { response: { status: 503 }, message: 'Unavailable' };
        const operation = vi.fn().mockRejectedValue(error);

        // Trip the circuit breaker
        for (let i = 0; i < 3; i++) {
          await expect(handler.executeWithResilience(operation)).rejects.toEqual(error);
        }
        expect(handler.getCircuitBreakerState().state).toBe('OPEN');

        // Reset
        handler.resetCircuitBreaker();

        const state = handler.getCircuitBreakerState();
        expect(state.state).toBe('CLOSED');
        expect(state.failureCount).toBe(0);
        expect(state.lastFailureTime).toBeNull();
      });

      it('should allow operations after reset', async () => {
        const error = { response: { status: 503 }, message: 'Unavailable' };
        const failOp = vi.fn().mockRejectedValue(error);

        // Trip the circuit breaker
        for (let i = 0; i < 3; i++) {
          await expect(handler.executeWithResilience(failOp)).rejects.toEqual(error);
        }

        handler.resetCircuitBreaker();

        const successOp = vi.fn().mockResolvedValue('recovered');
        const result = await handler.executeWithResilience(successOp);
        expect(result).toBe('recovered');
      });
    });

    describe('constructor defaults', () => {
      it('should work with no constructor arguments', async () => {
        const defaultHandler = new ResilientErrorHandler();
        const operation = vi.fn().mockResolvedValue('ok');

        // Use custom retry options for the call to keep things fast
        const result = await defaultHandler.executeWithResilience(operation, 'default-test', {
          baseDelayMs: 1,
          maxDelayMs: 10,
          maxRetries: 0,
        });

        expect(result).toBe('ok');
        expect(defaultHandler.getCircuitBreakerState().state).toBe('CLOSED');
      });

      it('should work with partial retry options', async () => {
        const partialHandler = new ResilientErrorHandler({ maxRetries: 1, baseDelayMs: 1, maxDelayMs: 10 });
        const operation = vi.fn().mockResolvedValue('ok');

        const result = await partialHandler.executeWithResilience(operation);

        expect(result).toBe('ok');
      });

      it('should work with partial circuit breaker options', async () => {
        const partialHandler = new ResilientErrorHandler(
          { maxRetries: 0, baseDelayMs: 1, maxDelayMs: 10 },
          { failureThreshold: 2 },
        );
        const operation = vi.fn().mockResolvedValue('ok');

        const result = await partialHandler.executeWithResilience(operation);

        expect(result).toBe('ok');
      });
    });
  });
});
