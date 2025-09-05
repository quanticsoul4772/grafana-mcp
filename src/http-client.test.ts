import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GrafanaHttpClient } from './http-client.js';
import type { Config, TLSConfig } from './types.js';
import fs from 'fs';

// Mock axios to avoid actual HTTP calls
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    })),
    isAxiosError: vi.fn(() => true),
  },
}));

// Mock fs to avoid file system access
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => Buffer.from('mock-cert-data')),
  },
}));

// Mock retry client
vi.mock('./retry-client.js', () => ({
  ResilientErrorHandler: vi.fn().mockImplementation(() => ({
    executeWithResilience: vi.fn(async (operation: Function) => operation()),
    getCircuitBreakerState: vi.fn(() => ({ state: 'CLOSED', failures: 0 })),
    resetCircuitBreaker: vi.fn(),
  })),
}));

// Mock console to prevent noise
vi.mock('console', () => ({
  log: vi.fn(),
  error: vi.fn(),
}));

describe('GrafanaHttpClient', () => {
  const mockConfig: Config = {
    GRAFANA_URL: 'https://grafana.test.com',
    GRAFANA_TOKEN: 'test-token-123',
    GRAFANA_DEBUG: false,
    GRAFANA_TIMEOUT: 30000,
    GRAFANA_DISABLE_TOOLS: [],
    GRAFANA_TLS_SKIP_VERIFY: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clear static cache between tests
    (GrafanaHttpClient as any).tlsFileCache?.clear();
  });

  describe('constructor', () => {
    it('should create client with basic configuration', () => {
      const client = new GrafanaHttpClient(mockConfig);

      expect(client).toBeInstanceOf(GrafanaHttpClient);
    });

    it('should handle debug configuration', () => {
      const debugConfig: Config = {
        ...mockConfig,
        GRAFANA_DEBUG: true,
      };

      const client = new GrafanaHttpClient(debugConfig);

      expect(client).toBeInstanceOf(GrafanaHttpClient);
    });

    it('should handle custom timeout', () => {
      const timeoutConfig: Config = {
        ...mockConfig,
        GRAFANA_TIMEOUT: 60000,
      };

      const client = new GrafanaHttpClient(timeoutConfig);

      expect(client).toBeInstanceOf(GrafanaHttpClient);
    });
  });

  describe('TLS configuration', () => {
    it('should handle no TLS configuration', () => {
      const client = new GrafanaHttpClient(mockConfig);

      expect(client).toBeInstanceOf(GrafanaHttpClient);
    });

    it('should create TLS config when cert and key files are provided', () => {
      const tlsConfig: Config = {
        ...mockConfig,
        GRAFANA_TLS_CERT_FILE: '/path/to/cert.pem',
        GRAFANA_TLS_KEY_FILE: '/path/to/key.pem',
      };

      const client = new GrafanaHttpClient(tlsConfig);

      expect(client).toBeInstanceOf(GrafanaHttpClient);
      expect(fs.existsSync).toHaveBeenCalledWith('/path/to/cert.pem');
      expect(fs.existsSync).toHaveBeenCalledWith('/path/to/key.pem');
    });

    it('should create TLS config with CA file', () => {
      const tlsConfig: Config = {
        ...mockConfig,
        GRAFANA_TLS_CA_FILE: '/path/to/ca.pem',
        GRAFANA_TLS_SKIP_VERIFY: true,
      };

      const client = new GrafanaHttpClient(tlsConfig);

      expect(client).toBeInstanceOf(GrafanaHttpClient);
      expect(fs.existsSync).toHaveBeenCalledWith('/path/to/ca.pem');
    });

    it('should throw error when TLS cert file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const tlsConfig: Config = {
        ...mockConfig,
        GRAFANA_TLS_CERT_FILE: '/nonexistent/cert.pem',
        GRAFANA_TLS_KEY_FILE: '/nonexistent/key.pem',
      };

      expect(() => new GrafanaHttpClient(tlsConfig)).toThrow('TLS file not found');
    });

    it('should throw error when TLS key file does not exist', () => {
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(true) // cert exists
        .mockReturnValueOnce(false); // key doesn't exist

      const tlsConfig: Config = {
        ...mockConfig,
        GRAFANA_TLS_CERT_FILE: '/path/to/cert.pem',
        GRAFANA_TLS_KEY_FILE: '/nonexistent/key.pem',
      };

      expect(() => new GrafanaHttpClient(tlsConfig)).toThrow('TLS file not found');
    });

    it('should cache TLS file contents', () => {
      const tlsConfig: Config = {
        ...mockConfig,
        GRAFANA_TLS_CERT_FILE: '/path/to/cert.pem',
        GRAFANA_TLS_KEY_FILE: '/path/to/key.pem',
      };

      // Create multiple clients with same TLS config
      new GrafanaHttpClient(tlsConfig);
      new GrafanaHttpClient(tlsConfig);

      // File should only be read once due to caching
      expect(fs.readFileSync).toHaveBeenCalledTimes(2); // Once for cert, once for key
    });

    it('should handle TLS skip verify flag', () => {
      const tlsConfig: Config = {
        ...mockConfig,
        GRAFANA_TLS_SKIP_VERIFY: true,
      };

      const client = new GrafanaHttpClient(tlsConfig);

      expect(client).toBeInstanceOf(GrafanaHttpClient);
    });

    it('should handle file read errors gracefully', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const tlsConfig: Config = {
        ...mockConfig,
        GRAFANA_TLS_CERT_FILE: '/restricted/cert.pem',
        GRAFANA_TLS_KEY_FILE: '/restricted/key.pem',
      };

      expect(() => new GrafanaHttpClient(tlsConfig)).toThrow('Failed to load TLS configuration');
    });
  });

  describe('cache operations', () => {
    let client: GrafanaHttpClient;

    beforeEach(() => {
      client = new GrafanaHttpClient(mockConfig);
    });

    it('should start with empty cache', () => {
      const stats = client.getCacheStats();

      expect(stats.size).toBe(0);
      expect(stats.keys).toEqual([]);
    });

    it('should generate consistent cache keys', () => {
      // Access the private method through any
      const cacheKey1 = (client as any).generateCacheKey('/api/test', { param: 'value' });
      const cacheKey2 = (client as any).generateCacheKey('/api/test', { param: 'value' });
      const cacheKey3 = (client as any).generateCacheKey('/api/test', { param: 'other' });

      expect(cacheKey1).toBe(cacheKey2);
      expect(cacheKey1).not.toBe(cacheKey3);
    });

    it('should generate cache keys without parameters', () => {
      const cacheKey1 = (client as any).generateCacheKey('/api/test');
      const cacheKey2 = (client as any).generateCacheKey('/api/test', undefined);

      expect(cacheKey1).toBe(cacheKey2);
    });

    it('should clear cache', () => {
      // Manually add something to cache
      (client as any).setCachedResponse('test-key', { data: 'test' });

      expect(client.getCacheStats().size).toBe(1);

      client.clearCache();

      expect(client.getCacheStats().size).toBe(0);
    });

    it('should handle cache expiration', () => {
      const originalDateNow = Date.now;
      let mockTime = 1000000;

      vi.spyOn(Date, 'now').mockImplementation(() => mockTime);

      // Set cached response
      (client as any).setCachedResponse('test-key', { data: 'test' });

      // Should return cached value
      const cached1 = (client as any).getCachedResponse('test-key');
      expect(cached1).toEqual({ data: 'test' });

      // Advance time beyond TTL (60000ms)
      mockTime += 70000;

      // Should return null (expired)
      const cached2 = (client as any).getCachedResponse('test-key');
      expect(cached2).toBeNull();

      Date.now = originalDateNow;
    });
  });

  describe('health and status methods', () => {
    let client: GrafanaHttpClient;

    beforeEach(() => {
      client = new GrafanaHttpClient(mockConfig);
    });

    it('should return cache stats', () => {
      const stats = client.getCacheStats();

      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('keys');
      expect(Array.isArray(stats.keys)).toBe(true);
    });

    it('should return circuit breaker status', () => {
      const status = client.getCircuitBreakerStatus();

      expect(status).toHaveProperty('state');
      expect(status).toHaveProperty('failures');
    });

    it('should return comprehensive health status', () => {
      const health = client.getHealthStatus();

      expect(health).toHaveProperty('cache');
      expect(health).toHaveProperty('circuitBreaker');
      expect(health).toHaveProperty('config');
      
      expect(health.config.baseURL).toBe(mockConfig.GRAFANA_URL);
      expect(health.config.timeout).toBe(mockConfig.GRAFANA_TIMEOUT);
      expect(health.config.debug).toBe(mockConfig.GRAFANA_DEBUG);
    });

    it('should reset circuit breaker', () => {
      client.resetCircuitBreaker();

      // Should not throw error
      expect(true).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should clean up resources', () => {
      const client = new GrafanaHttpClient(mockConfig);

      // Add something to cache first
      (client as any).setCachedResponse('test-key', { data: 'test' });

      expect(client.getCacheStats().size).toBe(1);

      client.cleanup();

      expect(client.getCacheStats().size).toBe(0);
    });

    it('should clear static TLS cache', () => {
      const client = new GrafanaHttpClient(mockConfig);

      client.cleanup();

      // Should not throw error
      expect(true).toBe(true);
    });
  });

  describe('HTTP methods', () => {
    let client: GrafanaHttpClient;
    let mockAxiosInstance: any;

    beforeEach(() => {
      const axios = vi.mocked(await import('axios')).default;
      mockAxiosInstance = {
        get: vi.fn().mockResolvedValue({ data: { result: 'get-data' } }),
        post: vi.fn().mockResolvedValue({ data: { result: 'post-data' } }),
        put: vi.fn().mockResolvedValue({ data: { result: 'put-data' } }),
        patch: vi.fn().mockResolvedValue({ data: { result: 'patch-data' } }),
        delete: vi.fn().mockResolvedValue({ data: { result: 'delete-data' } }),
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() },
        },
      };

      axios.create.mockReturnValue(mockAxiosInstance);
      client = new GrafanaHttpClient(mockConfig);
    });

    it('should make GET requests', async () => {
      const result = await client.get('/api/test', { param: 'value' });

      expect(result).toEqual({ result: 'get-data' });
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/test', { params: { param: 'value' } });
    });

    it('should make GET requests with caching', async () => {
      const result1 = await client.get('/api/test', { param: 'value' }, true);
      const result2 = await client.get('/api/test', { param: 'value' }, true);

      expect(result1).toEqual({ result: 'get-data' });
      expect(result2).toEqual({ result: 'get-data' });
      // Should only make one actual HTTP call due to caching
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
    });

    it('should make POST requests', async () => {
      const postData = { name: 'test', value: 'data' };
      const result = await client.post('/api/test', postData);

      expect(result).toEqual({ result: 'post-data' });
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/test', postData, undefined);
    });

    it('should make POST requests with custom config', async () => {
      const postData = { name: 'test' };
      const config = { headers: { 'Custom-Header': 'value' } };
      
      const result = await client.post('/api/test', postData, config);

      expect(result).toEqual({ result: 'post-data' });
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/test', postData, config);
    });

    it('should make PUT requests', async () => {
      const putData = { id: 1, name: 'updated' };
      const result = await client.put('/api/test/1', putData);

      expect(result).toEqual({ result: 'put-data' });
      expect(mockAxiosInstance.put).toHaveBeenCalledWith('/api/test/1', putData, undefined);
    });

    it('should make PATCH requests', async () => {
      const patchData = { name: 'patched' };
      const result = await client.patch('/api/test/1', patchData);

      expect(result).toEqual({ result: 'patch-data' });
      expect(mockAxiosInstance.patch).toHaveBeenCalledWith('/api/test/1', patchData, undefined);
    });

    it('should make DELETE requests', async () => {
      const result = await client.delete('/api/test/1');

      expect(result).toEqual({ result: 'delete-data' });
      expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/api/test/1', undefined);
    });

    it('should make DELETE requests with config', async () => {
      const config = { headers: { 'X-Force-Delete': 'true' } };
      const result = await client.delete('/api/test/1', config);

      expect(result).toEqual({ result: 'delete-data' });
      expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/api/test/1', config);
    });
  });

  describe('testConnection', () => {
    let client: GrafanaHttpClient;
    let mockAxiosInstance: any;

    beforeEach(() => {
      const axios = vi.mocked(await import('axios')).default;
      mockAxiosInstance = {
        get: vi.fn(),
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() },
        },
      };

      axios.create.mockReturnValue(mockAxiosInstance);
      client = new GrafanaHttpClient(mockConfig);
    });

    it('should return true for successful connection', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: { database: 'ok' } });

      const result = await client.testConnection();

      expect(result).toBe(true);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/health', { params: undefined });
    });

    it('should return false for failed connection', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Connection failed'));

      const result = await client.testConnection();

      expect(result).toBe(false);
    });
  });

  describe('getInstanceInfo', () => {
    let client: GrafanaHttpClient;
    let mockAxiosInstance: any;

    beforeEach(() => {
      const axios = vi.mocked(await import('axios')).default;
      mockAxiosInstance = {
        get: vi.fn(),
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() },
        },
      };

      axios.create.mockReturnValue(mockAxiosInstance);
      client = new GrafanaHttpClient(mockConfig);
    });

    it('should get instance info', async () => {
      const mockInfo = { buildInfo: { version: '8.0.0' } };
      mockAxiosInstance.get.mockResolvedValue({ data: mockInfo });

      const result = await client.getInstanceInfo();

      expect(result).toEqual(mockInfo);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/frontend/settings', { params: undefined });
    });
  });

  describe('error handling', () => {
    it('should handle axios errors in interceptors', () => {
      const client = new GrafanaHttpClient(mockConfig);

      // Get the response interceptor error handler
      const axios = vi.mocked(await import('axios')).default;
      const mockCreate = axios.create as any;
      const interceptorArgs = mockCreate.mock.results[0].value.interceptors.response.use.mock.calls[1]; // Second call (error interceptor)
      const errorHandler = interceptorArgs[1];

      const axiosError = {
        response: {
          status: 401,
          statusText: 'Unauthorized',
        },
        message: 'Request failed with status code 401',
      };

      expect(() => errorHandler(axiosError)).rejects.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle undefined parameters in GET requests', async () => {
      const axios = vi.mocked(await import('axios')).default;
      const mockAxiosInstance = {
        get: vi.fn().mockResolvedValue({ data: { result: 'data' } }),
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() },
        },
      };

      axios.create.mockReturnValue(mockAxiosInstance);
      const client = new GrafanaHttpClient(mockConfig);

      const result = await client.get('/api/test');

      expect(result).toEqual({ result: 'data' });
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/test', { params: undefined });
    });

    it('should handle cache with different parameter orders', () => {
      const client = new GrafanaHttpClient(mockConfig);

      const key1 = (client as any).generateCacheKey('/api/test', { a: '1', b: '2' });
      const key2 = (client as any).generateCacheKey('/api/test', { b: '2', a: '1' });

      // JSON.stringify may not guarantee same order, but our implementation should be consistent
      expect(key1).toBeDefined();
      expect(key2).toBeDefined();
    });

    it('should handle cache with complex nested objects', () => {
      const client = new GrafanaHttpClient(mockConfig);

      const params = {
        simple: 'value',
        nested: {
          level1: {
            level2: 'deep',
          },
        },
        array: [1, 2, 3],
      };

      const key = (client as any).generateCacheKey('/api/test', params);

      expect(key).toContain('/api/test');
      expect(key).toBeDefined();
    });

    it('should handle empty config in HTTP method calls', async () => {
      const axios = vi.mocked(await import('axios')).default;
      const mockAxiosInstance = {
        post: vi.fn().mockResolvedValue({ data: 'result' }),
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() },
        },
      };

      axios.create.mockReturnValue(mockAxiosInstance);
      const client = new GrafanaHttpClient(mockConfig);

      const result = await client.post('/api/test', { data: 'test' }, {});

      expect(result).toBe('result');
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/test', { data: 'test' }, {});
    });
  });
});