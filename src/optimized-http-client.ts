import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import https from 'https';
import http from 'http';
import fs from 'fs';
import { Config, TLSConfig } from './types.js';
import { ResilientErrorHandler } from './retry-client.js';
import { performanceMonitor } from './performance-monitor.js';

/**
 * Memory-optimized cache with LRU eviction and size limits
 */
class OptimizedCache<T> {
  private cache = new Map<string, { data: T; expires: number; lastAccessed: number }>();
  private readonly maxSize: number;
  private readonly maxMemoryMB: number;

  constructor(maxSize = 1000, maxMemoryMB = 10) {
    this.maxSize = maxSize;
    this.maxMemoryMB = maxMemoryMB * 1024 * 1024; // Convert to bytes
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (entry.expires < Date.now()) {
      this.cache.delete(key);
      return null;
    }

    entry.lastAccessed = Date.now();
    return entry.data;
  }

  set(key: string, data: T, ttl: number): void {
    const expires = Date.now() + ttl;
    const lastAccessed = Date.now();

    this.cache.set(key, { data, expires, lastAccessed });
    this.evictIfNeeded();
  }

  private evictIfNeeded(): void {
    // Evict expired entries first
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expires < now) {
        this.cache.delete(key);
      }
    }

    // If still over size limit, evict LRU entries
    while (this.cache.size > this.maxSize) {
      let oldestKey = '';
      let oldestTime = Infinity;

      for (const [key, entry] of this.cache.entries()) {
        if (entry.lastAccessed < oldestTime) {
          oldestTime = entry.lastAccessed;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        this.cache.delete(oldestKey);
      } else {
        break;
      }
    }

    // Estimate memory usage and evict if needed
    const estimatedMemory = this.estimateMemoryUsage();
    if (estimatedMemory > this.maxMemoryMB) {
      this.evictLargestEntries();
    }
  }

  private estimateMemoryUsage(): number {
    // Rough estimation - in production, use more sophisticated memory profiling
    return this.cache.size * 2048; // Assume 2KB per entry average
  }

  private evictLargestEntries(): void {
    // Simple heuristic: remove 25% of entries
    const targetSize = Math.floor(this.cache.size * 0.75);
    
    const entries = Array.from(this.cache.entries()).sort((a, b) => 
      a[1].lastAccessed - b[1].lastAccessed,
    );

    for (let i = 0; i < this.cache.size - targetSize; i++) {
      this.cache.delete(entries[i][0]);
    }
  }

  clear(): void {
    this.cache.clear();
  }

  getStats(): { size: number; keys: string[]; hitRate?: number } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

/**
 * Optimized HTTP client with advanced performance features
 */
export class OptimizedGrafanaHttpClient {
  private client: AxiosInstance;
  private config: Config;
  private static tlsFileCache = new Map<string, Buffer>();
  private responseCache = new OptimizedCache<any>(1000, 50); // 1000 entries, 50MB max
  private resilientHandler: ResilientErrorHandler;
  private requestPool = new Set<string>(); // Track in-flight requests for deduplication

  // Performance optimizations
  private readonly CACHE_TTL = 60000; // 1 minute
  private readonly MAX_CONCURRENT_REQUESTS = 50;
  private activeRequests = 0;
  private requestQueue: Array<() => Promise<any>> = [];

  constructor(config: Config) {
    this.config = config;

    // Initialize resilient error handler with optimized settings
    this.resilientHandler = new ResilientErrorHandler(
      {
        maxRetries: 3,
        baseDelayMs: 500, // Reduced from 1000ms
        maxDelayMs: 5000, // Reduced from 10000ms
        exponentialBase: 1.5, // Gentler backoff
        retryableStatuses: [408, 429, 500, 502, 503, 504],
      },
      {
        failureThreshold: 3, // More sensitive circuit breaker
        timeoutMs: 30000, // 30 second timeout
      },
    );

    this.client = this.createOptimizedAxiosInstance();
    this.setupPerformanceMonitoring();
  }

  private createOptimizedAxiosInstance(): AxiosInstance {
    const axiosConfig: AxiosRequestConfig = {
      baseURL: this.config.GRAFANA_URL,
      timeout: Math.min(this.config.GRAFANA_TIMEOUT, 10000), // Cap timeout at 10s
      headers: {
        Authorization: `Bearer ${this.config.GRAFANA_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate', // Enable compression
        'Connection': 'keep-alive',
      },
      // Optimized agents with connection pooling
      httpAgent: new http.Agent({
        keepAlive: true,
        maxSockets: 10,
        maxFreeSockets: 5,
        timeout: 5000,
        keepAliveMsecs: 30000,
      }),
      httpsAgent: new https.Agent({
        keepAlive: true,
        maxSockets: 10,
        maxFreeSockets: 5,
        timeout: 5000,
        keepAliveMsecs: 30000,
        rejectUnauthorized: true,
      }),
      // Response compression
      decompress: true,
    };

    // Configure TLS if needed
    if (this.config.GRAFANA_TLS_CERT_FILE || this.config.GRAFANA_TLS_KEY_FILE) {
      const tlsConfig = this.createTLSConfig();
      if (tlsConfig) {
        axiosConfig.httpsAgent = this.createOptimizedHttpsAgent(tlsConfig);
      }
    }

    const client = axios.create(axiosConfig);

    // Add optimized interceptors
    this.addOptimizedInterceptors(client);

    return client;
  }

  private createTLSConfig(): TLSConfig | undefined {
    if (
      !this.config.GRAFANA_TLS_CERT_FILE &&
      !this.config.GRAFANA_TLS_KEY_FILE &&
      !this.config.GRAFANA_TLS_CA_FILE &&
      !this.config.GRAFANA_TLS_SKIP_VERIFY
    ) {
      return undefined;
    }

    return {
      certFile: this.config.GRAFANA_TLS_CERT_FILE,
      keyFile: this.config.GRAFANA_TLS_KEY_FILE,
      caFile: this.config.GRAFANA_TLS_CA_FILE,
      skipVerify: this.config.GRAFANA_TLS_SKIP_VERIFY,
    };
  }

  private createOptimizedHttpsAgent(tlsConfig: TLSConfig): https.Agent {
    const agentOptions: https.AgentOptions = {
      rejectUnauthorized: !tlsConfig.skipVerify,
      keepAlive: true,
      maxSockets: 10,
      maxFreeSockets: 5,
      timeout: 5000,
      keepAliveMsecs: 30000,
    };

    try {
      // Use cached TLS files
      if (tlsConfig.certFile && tlsConfig.keyFile) {
        agentOptions.cert = this.loadTLSFile(tlsConfig.certFile);
        agentOptions.key = this.loadTLSFile(tlsConfig.keyFile);
      }

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

  private loadTLSFile(filepath: string): Buffer {
    if (!OptimizedGrafanaHttpClient.tlsFileCache.has(filepath)) {
      if (!fs.existsSync(filepath)) {
        throw new Error(`TLS file not found: ${filepath}`);
      }
      OptimizedGrafanaHttpClient.tlsFileCache.set(filepath, fs.readFileSync(filepath));
    }
    return OptimizedGrafanaHttpClient.tlsFileCache.get(filepath)!;
  }

  private addOptimizedInterceptors(client: AxiosInstance): void {
    // Request interceptor with performance monitoring
    client.interceptors.request.use(
      (config) => {
        performanceMonitor.startTimer(`http-${config.method}-${config.url}`);
        
        // Track concurrent requests
        this.activeRequests++;
        
        return config;
      },
      (error) => Promise.reject(error),
    );

    // Response interceptor with metrics and caching
    client.interceptors.response.use(
      (response) => {
        const timerName = `http-${response.config.method}-${response.config.url}`;
        const duration = performanceMonitor.endTimer(timerName);
        
        // Record request metrics
        performanceMonitor.recordRequest({
          method: response.config.method?.toUpperCase() || 'GET',
          url: response.config.url || '',
          duration,
          status: response.status,
          cacheHit: false,
          timestamp: Date.now(),
        });

        this.activeRequests--;
        this.processRequestQueue();

        return response;
      },
      (error: AxiosError) => {
        const timerName = `http-${error.config?.method}-${error.config?.url}`;
        const duration = performanceMonitor.endTimer(timerName);
        
        // Record error metrics
        performanceMonitor.recordRequest({
          method: error.config?.method?.toUpperCase() || 'GET',
          url: error.config?.url || '',
          duration,
          status: error.response?.status || 0,
          cacheHit: false,
          timestamp: Date.now(),
        });

        this.activeRequests--;
        this.processRequestQueue();

        return Promise.reject(error);
      },
    );
  }

  private setupPerformanceMonitoring(): void {
    performanceMonitor.on('performance-alert', (alerts: string[]) => {
      console.warn('[Performance Alert]', alerts);
    });
  }

  private processRequestQueue(): void {
    if (this.activeRequests < this.MAX_CONCURRENT_REQUESTS && this.requestQueue.length > 0) {
      const nextRequest = this.requestQueue.shift();
      if (nextRequest) {
        nextRequest();
      }
    }
  }

  private async executeRequest<T>(operation: () => Promise<T>): Promise<T> {
    if (this.activeRequests >= this.MAX_CONCURRENT_REQUESTS) {
      // Queue the request
      return new Promise((resolve, reject) => {
        this.requestQueue.push(async () => {
          try {
            const result = await operation();
            resolve(result);
          } catch (error) {
            reject(error);
          }
        });
      });
    }

    return operation();
  }

  /**
   * Optimized GET request with deduplication and caching
   */
  async get<T = any>(url: string, params?: Record<string, any>, useCache = true): Promise<T> {
    const cacheKey = this.generateCacheKey(url, params);
    
    // Check cache first
    if (useCache) {
      const cached = this.responseCache.get(cacheKey);
      if (cached) {
        performanceMonitor.recordRequest({
          method: 'GET',
          url,
          duration: 0,
          status: 200,
          cacheHit: true,
          timestamp: Date.now(),
        });
        return cached;
      }
    }

    // Deduplicate in-flight requests
    if (this.requestPool.has(cacheKey)) {
      // Wait for ongoing request to complete
      return new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
          if (!this.requestPool.has(cacheKey)) {
            clearInterval(checkInterval);
            // Try cache again
            const cached = this.responseCache.get(cacheKey);
            if (cached) {
              resolve(cached);
            } else {
              // If not in cache, make new request
              this.get(url, params, useCache).then(resolve).catch(reject);
            }
          }
        }, 10);

        // Timeout after 30 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          reject(new Error('Request deduplication timeout'));
        }, 30000);
      });
    }

    this.requestPool.add(cacheKey);

    try {
      const result = await this.executeRequest(async () => {
        return this.resilientHandler.executeWithResilience(
          async () => {
            const response = await this.client.get<T>(url, { params });
            return response.data;
          },
          `GET ${url}`,
        );
      });

      if (useCache) {
        this.responseCache.set(cacheKey, result, this.CACHE_TTL);
      }

      return result;
    } finally {
      this.requestPool.delete(cacheKey);
    }
  }

  /**
   * Optimized POST request
   */
  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.executeRequest(async () => {
      return this.resilientHandler.executeWithResilience(
        async () => {
          const response = await this.client.post<T>(url, data, config);
          return response.data;
        },
        `POST ${url}`,
      );
    });
  }

  private generateCacheKey(url: string, params?: Record<string, any>): string {
    const paramString = params ? JSON.stringify(params) : '';
    return `${url}:${paramString}`;
  }

  /**
   * Get comprehensive performance metrics
   */
  getPerformanceMetrics(): {
    cache: ReturnType<OptimizedCache<any>['getStats']>;
    activeRequests: number;
    queueLength: number;
    performance: ReturnType<typeof performanceMonitor.getCurrentMetrics>;
  } {
    return {
      cache: this.responseCache.getStats(),
      activeRequests: this.activeRequests,
      queueLength: this.requestQueue.length,
      performance: performanceMonitor.getCurrentMetrics(),
    };
  }

  /**
   * Optimize cache and connections
   */
  optimize(): void {
    // Clear expired cache entries
    this.responseCache.clear();
    
    // Clear TLS cache if not used recently
    if (OptimizedGrafanaHttpClient.tlsFileCache.size > 10) {
      OptimizedGrafanaHttpClient.tlsFileCache.clear();
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.responseCache.clear();
    OptimizedGrafanaHttpClient.tlsFileCache.clear();
    this.requestQueue.length = 0;
    this.requestPool.clear();
    performanceMonitor.cleanup();
  }
}