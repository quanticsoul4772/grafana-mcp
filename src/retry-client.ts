// import { categorizeError } from "./security-utils.js";

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  exponentialBase: number;
  retryableStatuses: number[];
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  exponentialBase: 2,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
};

/**
 * Retry decorator with exponential backoff for HTTP operations
 */
export class RetryableHttpClient {
  constructor(private options: RetryOptions = DEFAULT_RETRY_OPTIONS) {}

  /**
   * Execute operation with retry logic
   */
  async withRetry<T>(
    operation: () => Promise<T>,
    operationName = 'HTTP request',
    customOptions?: Partial<RetryOptions>,
  ): Promise<T> {
    const opts = { ...this.options, ...customOptions };
    let lastError: any;

    for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        // Don't retry on the last attempt
        if (attempt > opts.maxRetries) {
          break;
        }

        // Check if error is retryable
        if (!this.isRetryableError(error, opts)) {
          break;
        }

        // Calculate delay with exponential backoff and jitter
        const delay = this.calculateDelay(attempt, opts);
        
        if (this.options.maxRetries > 1) {
          console.warn(
            `${operationName} failed (attempt ${attempt}/${opts.maxRetries + 1}), retrying in ${delay}ms...`,
            this.getErrorMessage(error),
          );
        }

        await this.sleep(delay);
      }
    }

    // If we get here, all retries failed
    throw lastError;
  }

  /**
   * Determine if an error should trigger a retry
   */
  private isRetryableError(error: any, options: RetryOptions): boolean {
    // Network errors are retryable
    if (error?.code === 'ETIMEDOUT' || error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND') {
      return true;
    }

    // HTTP status code errors
    if (error?.response?.status) {
      return options.retryableStatuses.includes(error.response.status);
    }

    // Axios timeout errors
    if (error?.code === 'ECONNABORTED') {
      return true;
    }

    return false;
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  private calculateDelay(attempt: number, options: RetryOptions): number {
    const exponentialDelay = options.baseDelayMs * Math.pow(options.exponentialBase, attempt - 1);
    
    // Add jitter (±25% randomization)
    const jitter = exponentialDelay * 0.25 * (Math.random() - 0.5);
    const delayWithJitter = exponentialDelay + jitter;
    
    // Cap at max delay
    return Math.min(delayWithJitter, options.maxDelayMs);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Extract safe error message for logging
   */
  private getErrorMessage(error: any): string {
    if (error?.response?.status) {
      return `HTTP ${error.response.status}`;
    }
    if (error?.code) {
      return error.code;
    }
    return error?.message || 'Unknown error';
  }
}

/**
 * Circuit breaker pattern for preventing cascade failures
 */
export class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime: number | null = null;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private failureThreshold = 5,
    private timeoutMs = 60000,
  ) {}

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>, operationName = 'operation'): Promise<T> {
    if (this.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error(`Circuit breaker is OPEN for ${operationName}. Cooling down...`);
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = 'CLOSED';
  }

  /**
   * Handle failed operation
   */
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  /**
   * Check if we should attempt to reset the circuit breaker
   */
  private shouldAttemptReset(): boolean {
    return this.lastFailureTime !== null && 
           (Date.now() - this.lastFailureTime) > this.timeoutMs;
  }

  /**
   * Get current circuit breaker state
   */
  getState(): { 
    state: string; 
    failureCount: number; 
    lastFailureTime: number | null;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
    };
  }

  /**
   * Reset circuit breaker manually
   */
  reset(): void {
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = 'CLOSED';
  }
}

/**
 * Enhanced error handling with categorization and resilience patterns
 */
export class ResilientErrorHandler {
  private circuitBreaker: CircuitBreaker;
  private retryClient: RetryableHttpClient;

  constructor(
    retryOptions?: Partial<RetryOptions>,
    circuitBreakerOptions?: {
      failureThreshold?: number;
      timeoutMs?: number;
      monitoringPeriodMs?: number;
    },
  ) {
    this.retryClient = new RetryableHttpClient({ ...DEFAULT_RETRY_OPTIONS, ...retryOptions });
    this.circuitBreaker = new CircuitBreaker(
      circuitBreakerOptions?.failureThreshold,
      circuitBreakerOptions?.timeoutMs,
    );
  }

  /**
   * Execute operation with full resilience patterns
   */
  async executeWithResilience<T>(
    operation: () => Promise<T>,
    operationName = 'operation',
    customRetryOptions?: Partial<RetryOptions>,
  ): Promise<T> {
    return this.circuitBreaker.execute(async () => {
      return this.retryClient.withRetry(operation, operationName, customRetryOptions);
    }, operationName);
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerState() {
    return this.circuitBreaker.getState();
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }
}