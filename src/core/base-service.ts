/**
 * Base service implementation providing common functionality
 */

import { IService, IHttpService, AsyncResult } from './interfaces.js';
import { GrafanaHttpClient } from '../http-client.js';
import type { GrafanaError } from '../types.js';

/**
 * Abstract base service with common functionality
 */
export abstract class BaseService implements IService {
  private _initialized = false;
  private _healthy = true;

  constructor(
    public readonly name: string,
    public readonly version = '1.0.0',
  ) {}

  get initialized(): boolean {
    return this._initialized;
  }

  get healthy(): boolean {
    return this._healthy;
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    if (this._initialized) {
      return;
    }

    try {
      await this.onInitialize();
      this._initialized = true;
      this._healthy = true;

    } catch (error) {
      this._healthy = false;

      throw error;
    }
  }

  /**
   * Cleanup service resources
   */
  async cleanup(): Promise<void> {
    await this.onCleanup();
    this._initialized = false;
  }

  /**
   * Check service health
   */
  async healthCheck(): Promise<boolean> {
    try {
      const isHealthy = await this.onHealthCheck();
      this._healthy = isHealthy;
      return isHealthy;
    } catch (_error) {
      this._healthy = false;

      return false;
    }
  }

  /**
   * Execute operation with error handling and result wrapping
   */
  protected async execute<T>(
    operation: () => Promise<T>,
    context?: string,
  ): AsyncResult<T> {
    try {
      const data = await operation();
      return { success: true, data };
    } catch (error) {
      const errorContext = context ? `${this.name}.${context}` : this.name;
      const wrappedError = this.wrapError(error, errorContext);

      return { success: false, error: wrappedError as unknown as Error };
    }
  }

  /**
   * Execute operation and return data or throw
   */
  protected async executeOrThrow<T>(
    operation: () => Promise<T>,
    context?: string,
  ): Promise<T> {
    const result = await this.execute(operation, context);
    if (!result.success) {
      throw result.error;
    }
    return result.data;
  }

  /**
   * Wrap and standardize errors
   */
  protected wrapError(error: unknown, context: string): GrafanaError {
    if (typeof error === 'object' && error !== null && 'message' in error && 'status' in error) {
      return error as GrafanaError;
    }

    if (error instanceof Error) {
      return {
        message: `${context}: ${error.message}`,
        error: error.message,
        status: 500,
      };
    }

    return {
      message: `${context}: Unknown error`,
      error: String(error),
      status: 500,
    };
  }

  // Abstract methods for subclasses to implement
  protected abstract onInitialize(): Promise<void>;
  protected abstract onCleanup(): Promise<void>;
  protected abstract onHealthCheck(): Promise<boolean>;
}

/**
 * Base service for HTTP-dependent services
 */
export abstract class BaseHttpService extends BaseService implements IHttpService {
  constructor(
    name: string,
    public readonly httpClient: GrafanaHttpClient,
    version = '1.0.0',
  ) {
    super(name, version);
  }

  protected async onHealthCheck(): Promise<boolean> {
    try {
      // Basic health check - try to make a simple API call
      await this.httpClient.get('/api/health');
      return true;
    } catch (_error) {
      return false;
    }
  }

  protected async onInitialize(): Promise<void> {
    // Default initialization for HTTP services
    const healthCheck = await this.healthCheck();
    if (!healthCheck) {
      throw new Error(`Failed to initialize ${this.name}: Health check failed`);
    }
  }

  protected async onCleanup(): Promise<void> {
    // Default cleanup for HTTP services
    // Subclasses can override for custom cleanup
  }
}