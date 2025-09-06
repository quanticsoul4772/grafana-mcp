import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrometheusService } from './prometheus.js';
import { GrafanaHttpClient } from '../http-client.js';

// Mock the http client
const mockHttpClient = {
  get: vi.fn(),
} as unknown as GrafanaHttpClient;

describe('PrometheusService', () => {
  let service: PrometheusService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PrometheusService(mockHttpClient);
  });

  describe('query', () => {
    it('should execute range query with all parameters', async () => {
      const mockResult = {
        status: 'success',
        data: {
          resultType: 'matrix',
          result: [
            {
              metric: { __name__: 'up', job: 'prometheus' },
              values: [
                [1609459200, '1'],
                [1609459260, '1'],
              ],
            },
          ],
        },
      };

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockResult);

      const result = await service.query({
        datasourceUid: 'prom-uid',
        query: 'up',
        start: '2021-01-01T00:00:00Z',
        end: '2021-01-01T01:00:00Z',
        step: '1m',
      });

      expect(result).toEqual(mockResult);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/prom-uid/api/v1/query_range',
        {
          query: 'up',
          start: '2021-01-01T00:00:00Z',
          end: '2021-01-01T01:00:00Z',
          step: '1m',
        }
      );
    });

    it('should execute instant query', async () => {
      const mockResult = {
        status: 'success',
        data: {
          resultType: 'vector',
          result: [
            {
              metric: { __name__: 'up', job: 'prometheus' },
              value: [1609459200, '1'],
            },
          ],
        },
      };

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockResult);

      const result = await service.query({
        datasourceUid: 'prom-uid',
        query: 'up',
        start: '2021-01-01T00:00:00Z',
        instant: true,
      });

      expect(result).toEqual(mockResult);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/prom-uid/api/v1/query',
        {
          query: 'up',
          time: '2021-01-01T00:00:00Z',
        }
      );
    });

    it('should execute range query without optional parameters', async () => {
      const mockResult = { status: 'success', data: { result: [] } };

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockResult);

      await service.query({
        datasourceUid: 'prom-uid',
        query: 'up',
      });

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/prom-uid/api/v1/query_range',
        {
          query: 'up',
        }
      );
    });
  });

  describe('instantQuery', () => {
    it('should execute instant query with time', async () => {
      const mockResult = { status: 'success', data: { result: [] } };

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockResult);

      await service.instantQuery('prom-uid', 'up', '2021-01-01T00:00:00Z');

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/prom-uid/api/v1/query',
        {
          query: 'up',
          time: '2021-01-01T00:00:00Z',
        }
      );
    });

    it('should execute instant query without time', async () => {
      const mockResult = { status: 'success', data: { result: [] } };

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockResult);

      await service.instantQuery('prom-uid', 'up');

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/prom-uid/api/v1/query',
        {
          query: 'up',
        }
      );
    });
  });
});