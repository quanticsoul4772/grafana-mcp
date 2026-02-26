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
        },
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
        },
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
        },
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
        },
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
        },
      );
    });
  });

  describe('rangeQuery', () => {
    it('should execute range query with required time range params', async () => {
      const mockResult = {
        status: 'success',
        data: {
          resultType: 'matrix',
          result: [
            {
              metric: { __name__: 'http_requests_total' },
              values: [[1609459200, '100']],
            },
          ],
        },
      };

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockResult);

      const result = await service.rangeQuery({
        datasourceUid: 'prom-uid',
        query: 'http_requests_total',
        start: '2021-01-01T00:00:00Z',
        end: '2021-01-01T01:00:00Z',
      });

      expect(result).toEqual(mockResult);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/prom-uid/api/v1/query_range',
        {
          query: 'http_requests_total',
          start: '2021-01-01T00:00:00Z',
          end: '2021-01-01T01:00:00Z',
        },
      );
    });

    it('should execute range query with optional step parameter', async () => {
      const mockResult = { status: 'success', data: { result: [] } };

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockResult);

      await service.rangeQuery({
        datasourceUid: 'prom-uid',
        query: 'rate(http_requests_total[5m])',
        start: '2021-01-01T00:00:00Z',
        end: '2021-01-01T01:00:00Z',
        step: '30s',
      });

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/prom-uid/api/v1/query_range',
        {
          query: 'rate(http_requests_total[5m])',
          start: '2021-01-01T00:00:00Z',
          end: '2021-01-01T01:00:00Z',
          step: '30s',
        },
      );
    });
  });

  describe('getMetricMetadata', () => {
    it('should fetch metadata for all metrics', async () => {
      const mockMetadata = {
        http_requests_total: [
          { type: 'counter', help: 'Total HTTP requests', unit: '' },
        ],
        up: [{ type: 'gauge', help: 'Target is up', unit: '' }],
      };

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockMetadata);

      const result = await service.getMetricMetadata('prom-uid');

      expect(result).toEqual(mockMetadata);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/prom-uid/api/v1/metadata',
        {},
      );
    });

    it('should fetch metadata for a specific metric', async () => {
      const mockMetadata = {
        up: [{ type: 'gauge', help: 'Target is up', unit: '' }],
      };

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockMetadata);

      const result = await service.getMetricMetadata('prom-uid', 'up');

      expect(result).toEqual(mockMetadata);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/prom-uid/api/v1/metadata',
        { metric: 'up' },
      );
    });
  });

  describe('getMetricNames', () => {
    it('should fetch all metric names', async () => {
      const mockResponse = {
        data: ['up', 'http_requests_total', 'process_cpu_seconds_total'],
      };

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockResponse);

      const result = await service.getMetricNames('prom-uid');

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/prom-uid/api/v1/label/__name__/values',
      );
    });
  });

  describe('getLabelNames', () => {
    it('should fetch all label names without matchers', async () => {
      const mockResponse = {
        data: ['__name__', 'instance', 'job'],
      };

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockResponse);

      const result = await service.getLabelNames('prom-uid');

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/prom-uid/api/v1/labels',
        {},
      );
    });

    it('should fetch label names with match selectors', async () => {
      const mockResponse = { data: ['instance', 'job'] };

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockResponse);

      const result = await service.getLabelNames('prom-uid', ['up']);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/prom-uid/api/v1/labels',
        { 'match[]': ['up'] },
      );
    });

    it('should pass empty params when match array is empty', async () => {
      const mockResponse = { data: ['__name__'] };

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockResponse);

      await service.getLabelNames('prom-uid', []);

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/prom-uid/api/v1/labels',
        {},
      );
    });
  });

  describe('getLabelValues', () => {
    it('should fetch values for a specific label', async () => {
      const mockResponse = {
        data: ['prometheus', 'node-exporter', 'grafana'],
      };

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockResponse);

      const result = await service.getLabelValues('prom-uid', 'job');

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/prom-uid/api/v1/label/job/values',
        {},
      );
    });

    it('should fetch label values with match selectors', async () => {
      const mockResponse = { data: ['localhost:9090'] };

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockResponse);

      const result = await service.getLabelValues('prom-uid', 'instance', [
        'up{job="prometheus"}',
      ]);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/prom-uid/api/v1/label/instance/values',
        { 'match[]': ['up{job="prometheus"}'] },
      );
    });

    it('should URL-encode special characters in label name', async () => {
      const mockResponse = { data: ['value1'] };

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockResponse);

      await service.getLabelValues('prom-uid', 'label with spaces');

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/prom-uid/api/v1/label/label%20with%20spaces/values',
        {},
      );
    });
  });

  describe('findSeries', () => {
    it('should find series matching label selectors', async () => {
      const mockResponse = {
        data: [
          { __name__: 'up', job: 'prometheus', instance: 'localhost:9090' },
          { __name__: 'up', job: 'node', instance: 'localhost:9100' },
        ],
      };

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockResponse);

      const result = await service.findSeries('prom-uid', ['up']);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/prom-uid/api/v1/series',
        { 'match[]': ['up'] },
      );
    });

    it('should find series with time range parameters', async () => {
      const mockResponse = { data: [] };

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockResponse);

      await service.findSeries(
        'prom-uid',
        ['up', 'http_requests_total'],
        '2021-01-01T00:00:00Z',
        '2021-01-01T01:00:00Z',
      );

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/prom-uid/api/v1/series',
        {
          'match[]': ['up', 'http_requests_total'],
          start: '2021-01-01T00:00:00Z',
          end: '2021-01-01T01:00:00Z',
        },
      );
    });

    it('should find series without optional time range', async () => {
      const mockResponse = { data: [] };

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockResponse);

      await service.findSeries('prom-uid', ['{job="prometheus"}']);

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/prom-uid/api/v1/series',
        { 'match[]': ['{job="prometheus"}'] },
      );
    });
  });

  describe('getTargets', () => {
    it('should fetch all targets without state filter', async () => {
      const mockResponse = {
        data: {
          activeTargets: [
            {
              discoveredLabels: { job: 'prometheus' },
              health: 'up',
              scrapeUrl: 'http://localhost:9090/metrics',
            },
          ],
          droppedTargets: [],
        },
      };

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockResponse);

      const result = await service.getTargets('prom-uid');

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/prom-uid/api/v1/targets',
        {},
      );
    });

    it('should fetch targets filtered by active state', async () => {
      const mockResponse = { data: { activeTargets: [], droppedTargets: [] } };

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockResponse);

      await service.getTargets('prom-uid', 'active');

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/prom-uid/api/v1/targets',
        { state: 'active' },
      );
    });

    it('should fetch targets filtered by dropped state', async () => {
      const mockResponse = { data: { activeTargets: [], droppedTargets: [] } };

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockResponse);

      await service.getTargets('prom-uid', 'dropped');

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/prom-uid/api/v1/targets',
        { state: 'dropped' },
      );
    });
  });

  describe('getAlertingRules', () => {
    it('should fetch all alerting rules without type filter', async () => {
      const mockResponse = {
        data: {
          groups: [
            {
              name: 'example',
              rules: [
                {
                  name: 'HighErrorRate',
                  query: 'rate(errors_total[5m]) > 0.5',
                  type: 'alerting',
                },
              ],
            },
          ],
        },
      };

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockResponse);

      const result = await service.getAlertingRules('prom-uid');

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/prom-uid/api/v1/rules',
        {},
      );
    });

    it('should fetch alerting rules filtered by alert type', async () => {
      const mockResponse = { data: { groups: [] } };

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockResponse);

      await service.getAlertingRules('prom-uid', 'alert');

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/prom-uid/api/v1/rules',
        { type: 'alert' },
      );
    });

    it('should fetch rules filtered by record type', async () => {
      const mockResponse = { data: { groups: [] } };

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockResponse);

      await service.getAlertingRules('prom-uid', 'record');

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/prom-uid/api/v1/rules',
        { type: 'record' },
      );
    });
  });

  describe('getAlerts', () => {
    it('should fetch all alerts', async () => {
      const mockResponse = {
        data: {
          alerts: [
            {
              labels: { alertname: 'HighErrorRate', severity: 'critical' },
              state: 'firing',
              value: '0.8',
            },
          ],
        },
      };

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockResponse);

      const result = await service.getAlerts('prom-uid');

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/prom-uid/api/v1/alerts',
      );
    });
  });

  describe('getConfig', () => {
    it('should fetch Prometheus configuration', async () => {
      const mockResponse = {
        data: {
          yaml: 'global:\n  scrape_interval: 15s\n',
        },
      };

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockResponse);

      const result = await service.getConfig('prom-uid');

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/prom-uid/api/v1/status/config',
      );
    });
  });

  describe('getFlags', () => {
    it('should fetch Prometheus flags', async () => {
      const mockResponse = {
        data: {
          'storage.tsdb.retention.time': '15d',
          'web.listen-address': '0.0.0.0:9090',
        },
      };

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockResponse);

      const result = await service.getFlags('prom-uid');

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/prom-uid/api/v1/status/flags',
      );
    });
  });

  describe('getRuntimeInfo', () => {
    it('should fetch Prometheus runtime information', async () => {
      const mockResponse = {
        data: {
          startTime: '2021-01-01T00:00:00Z',
          CWD: '/prometheus',
          goroutineCount: 42,
          GOMAXPROCS: 4,
        },
      };

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockResponse);

      const result = await service.getRuntimeInfo('prom-uid');

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/prom-uid/api/v1/status/runtimeinfo',
      );
    });
  });

  describe('getBuildInfo', () => {
    it('should fetch Prometheus build information', async () => {
      const mockResponse = {
        data: {
          version: '2.32.1',
          revision: 'abc123',
          branch: 'HEAD',
          goVersion: 'go1.17.5',
        },
      };

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockResponse);

      const result = await service.getBuildInfo('prom-uid');

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/prom-uid/api/v1/status/buildinfo',
      );
    });
  });

  describe('isPrometheusDatasource', () => {
    it('should return true when datasource responds to config endpoint', async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue({
        data: { yaml: '' },
      });

      const result = await service.isPrometheusDatasource('prom-uid');

      expect(result).toBe(true);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/prom-uid/api/v1/status/config',
      );
    });

    it('should return false when datasource config endpoint throws', async () => {
      vi.mocked(mockHttpClient.get).mockRejectedValue(
        new Error('Not a Prometheus datasource'),
      );

      const result = await service.isPrometheusDatasource('not-prom-uid');

      expect(result).toBe(false);
    });
  });

  describe('parseQuery', () => {
    it('should return valid for a simple metric name', () => {
      const result = service.parseQuery('up');

      expect(result).toEqual({ isValid: true });
    });

    it('should return valid for a query with balanced braces', () => {
      const result = service.parseQuery('http_requests_total{job="prometheus"}');

      expect(result).toEqual({ isValid: true });
    });

    it('should return valid for a complex query with balanced braces', () => {
      const result = service.parseQuery(
        'rate(http_requests_total{job="prometheus", status=~"5.."}[5m])',
      );

      expect(result).toEqual({ isValid: true });
    });

    it('should return invalid for an empty query', () => {
      const result = service.parseQuery('');

      expect(result).toEqual({ isValid: false, error: 'Query is empty' });
    });

    it('should return invalid for a whitespace-only query', () => {
      const result = service.parseQuery('   ');

      expect(result).toEqual({ isValid: false, error: 'Query is empty' });
    });

    it('should return invalid for unmatched opening brace', () => {
      const result = service.parseQuery('up{job="prometheus"');

      expect(result).toEqual({
        isValid: false,
        error: 'Unmatched braces in query',
      });
    });

    it('should return invalid for unmatched closing brace', () => {
      const result = service.parseQuery('up}');

      expect(result).toEqual({
        isValid: false,
        error: 'Unmatched braces in query',
      });
    });
  });

  describe('formatTime', () => {
    it('should return string time values as-is', () => {
      const result = service.formatTime('2021-01-01T00:00:00Z');

      expect(result).toBe('2021-01-01T00:00:00Z');
    });

    it('should return relative time strings as-is', () => {
      const result = service.formatTime('-1h');

      expect(result).toBe('-1h');
    });

    it('should convert numeric timestamps to strings', () => {
      const result = service.formatTime(1609459200);

      expect(result).toBe('1609459200');
    });

    it('should convert Date objects to Unix timestamp strings', () => {
      const date = new Date('2021-01-01T00:00:00Z');
      const result = service.formatTime(date);

      expect(result).toBe('1609459200');
    });
  });

  describe('calculateDefaultStep', () => {
    it('should calculate step for a 1-hour range', () => {
      const result = service.calculateDefaultStep(
        '2021-01-01T00:00:00Z',
        '2021-01-01T01:00:00Z',
      );

      // 3600s / 250 = 14.4s, but min is 15s
      expect(result).toBe('15s');
    });

    it('should calculate step for a 24-hour range', () => {
      const result = service.calculateDefaultStep(
        '2021-01-01T00:00:00Z',
        '2021-01-02T00:00:00Z',
      );

      // 86400s / 250 = 345.6s -> floor = 345s
      expect(result).toBe('345s');
    });

    it('should enforce minimum step of 15 seconds for very short ranges', () => {
      const result = service.calculateDefaultStep(
        '2021-01-01T00:00:00Z',
        '2021-01-01T00:01:00Z',
      );

      // 60s / 250 = 0.24s -> floor = 0, but min is 15s
      expect(result).toBe('15s');
    });

    it('should calculate step for a 7-day range', () => {
      const result = service.calculateDefaultStep(
        '2021-01-01T00:00:00Z',
        '2021-01-08T00:00:00Z',
      );

      // 604800s / 250 = 2419.2s -> floor = 2419s
      expect(result).toBe('2419s');
    });
  });
});