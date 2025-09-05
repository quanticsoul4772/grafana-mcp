import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import https from 'https';
import http from 'http';
import fs from 'fs';
import { Config, HttpClientConfig, TLSConfig, GrafanaError } from './types.js';
import {
  sanitizeHeaders,
  categorizeError,
  formatUserError,
  formatInternalError,
  safeStringify,
} from './security-utils.js';
import { ResilientErrorHandler } from './retry-client.js';

/**
 * HTTP client for Grafana API with authentication, TLS support, and error handling
 */
export class GrafanaHttpClient {
  private client: AxiosInstance;
  private config: Config;
  private static tlsFileCache = new Map<string, Buffer>();
  private responseCache = new Map<string, { data: any; expires: number }>();
  private readonly CACHE_TTL = 60000; // 1 minute cache TTL
  private resilientHandler: ResilientErrorHandler;

  constructor(config: Config) {
    this.config = config;

    // Initialize resilient error handler
    this.resilientHandler = new ResilientErrorHandler(
      {
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 10000,
        exponentialBase: 2,
        retryableStatuses: [408, 429, 500, 502, 503, 504],
      },
      {
        failureThreshold: 5,
        timeoutMs: 60000, // 1 minute circuit breaker timeout
      },
    );

    const httpConfig: HttpClientConfig = {
      baseURL: config.GRAFANA_URL,
      timeout: config.GRAFANA_TIMEOUT,
      headers: {
        Authorization: `Bearer ${config.GRAFANA_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      debug: config.GRAFANA_DEBUG,
      tlsConfig: this.createTLSConfig(config),
    };

    this.client = this.createAxiosInstance(httpConfig);
  }

  /**
   * Create TLS configuration from environment variables
   */
  private createTLSConfig(config: Config): TLSConfig | undefined {
    if (
      !config.GRAFANA_TLS_CERT_FILE &&
      !config.GRAFANA_TLS_KEY_FILE &&
      !config.GRAFANA_TLS_CA_FILE &&
      !config.GRAFANA_TLS_SKIP_VERIFY
    ) {
      return undefined;
    }

    return {
      certFile: config.GRAFANA_TLS_CERT_FILE,
      keyFile: config.GRAFANA_TLS_KEY_FILE,
      caFile: config.GRAFANA_TLS_CA_FILE,
      skipVerify: config.GRAFANA_TLS_SKIP_VERIFY,
    };
  }

  /**
   * Create Axios instance with TLS and debugging configuration
   */
  private createAxiosInstance(config: HttpClientConfig): AxiosInstance {
    const axiosConfig: AxiosRequestConfig = {
      baseURL: config.baseURL,
      timeout: config.timeout,
      headers: config.headers,
      // Add connection pooling for better performance
      httpAgent: new http.Agent({
        keepAlive: true,
        maxSockets: 10,
        maxFreeSockets: 5,
        timeout: config.timeout,
      }),
    };

    // Configure TLS if needed
    if (config.tlsConfig) {
      const httpsAgent = this.createHttpsAgent(config.tlsConfig);
      axiosConfig.httpsAgent = httpsAgent;
    }

    const client = axios.create(axiosConfig);

    // Add debug logging if enabled
    if (config.debug) {
      this.addDebugInterceptors(client);
    }

    // Add error handling
    this.addErrorInterceptors(client);

    return client;
  }

  /**
   * Load TLS file with caching to avoid repeated file reads
   */
  private loadTLSFile(filepath: string): Buffer {
    if (!GrafanaHttpClient.tlsFileCache.has(filepath)) {
      if (!fs.existsSync(filepath)) {
        throw new Error(`TLS file not found: ${filepath}`);
      }
      GrafanaHttpClient.tlsFileCache.set(filepath, fs.readFileSync(filepath));
    }
    return GrafanaHttpClient.tlsFileCache.get(filepath)!;
  }

  /**
   * Create HTTPS agent with custom TLS configuration
   */
  private createHttpsAgent(tlsConfig: TLSConfig): https.Agent {
    const agentOptions: https.AgentOptions = {
      rejectUnauthorized: !tlsConfig.skipVerify,
      keepAlive: true,
      maxSockets: 10,
      maxFreeSockets: 5,
    };

    try {
      // Load client certificate if provided (with caching)
      if (tlsConfig.certFile && tlsConfig.keyFile) {
        agentOptions.cert = this.loadTLSFile(tlsConfig.certFile);
        agentOptions.key = this.loadTLSFile(tlsConfig.keyFile);
      }

      // Load CA certificate if provided (with caching)
      if (tlsConfig.caFile) {
        agentOptions.ca = this.loadTLSFile(tlsConfig.caFile);
      }
    } catch (error) {
      throw new Error(
        `Failed to load TLS configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    return new https.Agent(agentOptions);
  }

  /**
   * Add debug logging interceptors
   */
  private addDebugInterceptors(client: AxiosInstance): void {
    // Request interceptor
    client.interceptors.request.use(
      (config) => {
        console.log(
          `[Grafana HTTP] ${config.method?.toUpperCase()} ${config.url}`,
        );
        if (config.data) {
          console.log(
            '[Grafana HTTP] Request body:',
            safeStringify(config.data),
          );
        }
        if (config.params) {
          console.log(
            '[Grafana HTTP] Query params:',
            safeStringify(config.params),
          );
        }
        if (config.headers) {
          console.log(
            '[Grafana HTTP] Headers:',
            safeStringify(
              sanitizeHeaders(config.headers as Record<string, any>),
            ),
          );
        }
        return config;
      },
      (error) => {
        console.error('[Grafana HTTP] Request error:', error);
        return Promise.reject(error);
      },
    );

    // Response interceptor
    client.interceptors.response.use(
      (response) => {
        console.log(`[Grafana HTTP] ${response.status} ${response.statusText}`);
        if (this.config.GRAFANA_DEBUG && response.data) {
          // Only log response data if it's not too large and sanitize it
          const responseStr = safeStringify(response.data);
          if (responseStr.length < 5000) {
            console.log('[Grafana HTTP] Response:', responseStr);
          } else {
            console.log(
              '[Grafana HTTP] Response: [Large response body - truncated for security]',
            );
          }
        }
        return response;
      },
      (error) => {
        if (axios.isAxiosError(error)) {
          console.error(
            `[Grafana HTTP] ${error.response?.status} ${error.response?.statusText}`,
          );
          if (error.response?.data) {
            console.error(
              '[Grafana HTTP] Error response:',
              safeStringify(error.response.data),
            );
          }
        }
        return Promise.reject(error);
      },
    );
  }

  /**
   * Add error handling interceptors
   */
  private addErrorInterceptors(client: AxiosInstance): void {
    client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        // Categorize the error for safe handling
        const categorizedError = categorizeError(error, 'HTTP Client');

        // Log the internal error details for debugging
        console.error(
          '[Grafana HTTP] Error:',
          formatInternalError(categorizedError),
        );

        // Create a Grafana error with safe user message
        const grafanaError: GrafanaError = {
          message: formatUserError(categorizedError),
          status: error.response?.status,
        };

        // Only include safe error details
        grafanaError.error = categorizedError.publicMessage;

        return Promise.reject(grafanaError);
      },
    );
  }

  /**
   * Get cached response if available and not expired
   */
  private getCachedResponse<T>(cacheKey: string): T | null {
    const cached = this.responseCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return cached.data as T;
    }
    if (cached) {
      this.responseCache.delete(cacheKey);
    }
    return null;
  }

  /**
   * Cache response with TTL
   */
  private setCachedResponse(cacheKey: string, data: any): void {
    this.responseCache.set(cacheKey, {
      data,
      expires: Date.now() + this.CACHE_TTL,
    });
  }

  /**
   * Generate cache key from URL and parameters
   */
  private generateCacheKey(url: string, params?: Record<string, any>): string {
    const paramString = params ? JSON.stringify(params) : '';
    return `${url}:${paramString}`;
  }

  /**
   * Make a GET request with optional caching and resilience
   */
  async get<T = any>(url: string, params?: Record<string, any>, useCache = false): Promise<T> {
    if (useCache) {
      const cacheKey = this.generateCacheKey(url, params);
      const cached = this.getCachedResponse<T>(cacheKey);
      if (cached) {
        return cached;
      }

      const result = await this.resilientHandler.executeWithResilience(
        async () => {
          const response = await this.client.get<T>(url, { params });
          return response.data;
        },
        `GET ${url}`,
      );

      this.setCachedResponse(cacheKey, result);
      return result;
    }

    return this.resilientHandler.executeWithResilience(
      async () => {
        const response = await this.client.get<T>(url, { params });
        return response.data;
      },
      `GET ${url}`,
    );
  }

  /**
   * Make a POST request
   */
  async post<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await this.client.post<T>(url, data, config);
    return response.data;
  }

  /**
   * Make a PUT request
   */
  async put<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await this.client.put<T>(url, data, config);
    return response.data;
  }

  /**
   * Make a DELETE request
   */
  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<T>(url, config);
    return response.data;
  }

  /**
   * Make a PATCH request
   */
  async patch<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await this.client.patch<T>(url, data, config);
    return response.data;
  }

  /**
   * Clear response cache
   */
  clearCache(): void {
    this.responseCache.clear();
  }

  /**
   * Clean up resources and connections
   */
  cleanup(): void {
    this.clearCache();
    // Clear static TLS file cache when appropriate
    GrafanaHttpClient.tlsFileCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.responseCache.size,
      keys: Array.from(this.responseCache.keys()),
    };
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus() {
    return this.resilientHandler.getCircuitBreakerState();
  }

  /**
   * Reset circuit breaker manually
   */
  resetCircuitBreaker(): void {
    this.resilientHandler.resetCircuitBreaker();
  }

  /**
   * Get comprehensive health status
   */
  getHealthStatus(): {
    cache: { size: number; keys: string[] };
    circuitBreaker: ReturnType<ResilientErrorHandler['getCircuitBreakerState']>;
    config: { baseURL: string; timeout: number; debug: boolean };
  } {
    return {
      cache: this.getCacheStats(),
      circuitBreaker: this.getCircuitBreakerStatus(),
      config: {
        baseURL: this.config.GRAFANA_URL,
        timeout: this.config.GRAFANA_TIMEOUT,
        debug: this.config.GRAFANA_DEBUG,
      },
    };
  }

  /**
   * Test connection to Grafana API
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.get('/api/health');
      return true;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Get Grafana instance information
   */
  async getInstanceInfo(): Promise<any> {
    return this.get('/api/frontend/settings');
  }
}
