import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRegistry } from '../tool-registry.js';
import { PrometheusService } from '../services/prometheus.js';
import { registerPrometheusTools } from './prometheus.js';

const mockService = {
  query: vi.fn(),
  getMetricMetadata: vi.fn(),
  getLabelNames: vi.fn(),
  getLabelValues: vi.fn(),
  findSeries: vi.fn(),
} as unknown as PrometheusService;

describe('Prometheus Tools', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new ToolRegistry();
    registerPrometheusTools(registry, mockService);
  });

  it('should register the standard tools', () => {
    expect(registry.hasTool('query_prometheus')).toBe(true);
    expect(registry.hasTool('get_prometheus_metadata')).toBe(true);
    expect(registry.hasTool('get_prometheus_labels')).toBe(true);
    expect(registry.hasTool('get_prometheus_label_values')).toBe(true);
    expect(registry.hasTool('get_prometheus_series')).toBe(true);
    // build_prometheus_query is registered via registerExtendedTool
    expect(registry.hasTool('build_prometheus_query')).toBe(true);
  });

  // ─── query_prometheus ────────────────────────────────────────────────

  describe('query_prometheus', () => {
    it('should call query and format instant query response', async () => {
      vi.mocked(mockService.query).mockResolvedValue({
        data: {
          resultType: 'vector',
          result: [
            {
              metric: { __name__: 'up', job: 'prometheus' },
              value: [1704067200, '1'],
            },
          ],
        },
      });

      const handler = registry.getHandler('query_prometheus')!;
      const result = await handler({
        params: {
          arguments: {
            query: 'up',
            datasourceUid: 'prom-1',
          },
        },
      });

      expect(mockService.query).toHaveBeenCalled();
      expect(result.content[0].text).toContain('Prometheus Query Results');
      expect(result.content[0].text).toContain('up');
      expect(result.content[0].text).toContain('vector');
    });

    it('should handle range query results', async () => {
      vi.mocked(mockService.query).mockResolvedValue({
        data: {
          resultType: 'matrix',
          result: [
            {
              metric: { __name__: 'up', job: 'prometheus' },
              values: [
                [1704067200, '1'],
                [1704067260, '1'],
              ],
            },
          ],
        },
      });

      const handler = registry.getHandler('query_prometheus')!;
      const result = await handler({
        params: {
          arguments: {
            query: 'up[5m]',
            datasourceUid: 'prom-1',
          },
        },
      });

      expect(result.content[0].text).toContain('matrix');
    });

    it('should handle empty results', async () => {
      vi.mocked(mockService.query).mockResolvedValue({
        data: { resultType: 'vector', result: [] },
      });

      const handler = registry.getHandler('query_prometheus')!;
      const result = await handler({
        params: {
          arguments: {
            query: 'nonexistent_metric',
            datasourceUid: 'prom-1',
          },
        },
      });

      expect(result.content[0].text).toContain('No results found');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.query).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('query_prometheus')!;
      const result = await handler({
        params: {
          arguments: {
            query: 'up',
            datasourceUid: 'prom-1',
          },
        },
      });
      expect(result.isError).toBe(true);
    });
  });

  // ─── get_prometheus_metadata ─────────────────────────────────────────

  describe('get_prometheus_metadata', () => {
    it('should call getMetricMetadata and format response', async () => {
      vi.mocked(mockService.getMetricMetadata).mockResolvedValue({
        up: { type: 'gauge', help: 'Indicates if target is up' },
        process_cpu_seconds_total: {
          type: 'counter',
          help: 'Total CPU time spent',
        },
      });

      const handler = registry.getHandler('get_prometheus_metadata')!;
      const result = await handler({
        params: { arguments: { datasourceUid: 'prom-1' } },
      });

      expect(mockService.getMetricMetadata).toHaveBeenCalledWith('prom-1');
      expect(result.content[0].text).toContain('Prometheus Metadata (2 metrics)');
      expect(result.content[0].text).toContain('up');
      expect(result.content[0].text).toContain('gauge');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.getMetricMetadata).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('get_prometheus_metadata')!;
      const result = await handler({
        params: { arguments: { datasourceUid: 'prom-1' } },
      });
      expect(result.isError).toBe(true);
    });
  });

  // ─── get_prometheus_labels ───────────────────────────────────────────

  describe('get_prometheus_labels', () => {
    it('should call getLabelNames and format response', async () => {
      vi.mocked(mockService.getLabelNames).mockResolvedValue({
        data: ['__name__', 'job', 'instance'],
      });

      const handler = registry.getHandler('get_prometheus_labels')!;
      const result = await handler({
        params: { arguments: { datasourceUid: 'prom-1' } },
      });

      expect(mockService.getLabelNames).toHaveBeenCalledWith('prom-1');
      expect(result.content[0].text).toContain('Prometheus Labels (3 total)');
      expect(result.content[0].text).toContain('- job');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.getLabelNames).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('get_prometheus_labels')!;
      const result = await handler({
        params: { arguments: { datasourceUid: 'prom-1' } },
      });
      expect(result.isError).toBe(true);
    });
  });

  // ─── get_prometheus_label_values ─────────────────────────────────────

  describe('get_prometheus_label_values', () => {
    it('should call getLabelValues and format response', async () => {
      vi.mocked(mockService.getLabelValues).mockResolvedValue({
        data: ['prometheus', 'grafana', 'node'],
      });

      const handler = registry.getHandler('get_prometheus_label_values')!;
      const result = await handler({
        params: { arguments: { datasourceUid: 'prom-1', label: 'job' } },
      });

      expect(mockService.getLabelValues).toHaveBeenCalledWith('prom-1', 'job');
      expect(result.content[0].text).toContain('Values for label "job" (3 total)');
      expect(result.content[0].text).toContain('- prometheus');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.getLabelValues).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('get_prometheus_label_values')!;
      const result = await handler({
        params: { arguments: { datasourceUid: 'prom-1', label: 'job' } },
      });
      expect(result.isError).toBe(true);
    });
  });

  // ─── get_prometheus_series ───────────────────────────────────────────

  describe('get_prometheus_series', () => {
    it('should call findSeries and format response', async () => {
      vi.mocked(mockService.findSeries).mockResolvedValue({
        data: [
          { __name__: 'up', job: 'prometheus' },
          { __name__: 'up', job: 'grafana' },
        ],
      });

      const handler = registry.getHandler('get_prometheus_series')!;
      const result = await handler({
        params: {
          arguments: {
            datasourceUid: 'prom-1',
            match: ['{job="prometheus"}'],
          },
        },
      });

      expect(mockService.findSeries).toHaveBeenCalledWith(
        'prom-1',
        ['{job="prometheus"}'],
        undefined,
        undefined,
      );
      expect(result.content[0].text).toContain('Prometheus Series (2 total)');
      expect(result.content[0].text).toContain('job="prometheus"');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.findSeries).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('get_prometheus_series')!;
      const result = await handler({
        params: {
          arguments: {
            datasourceUid: 'prom-1',
            match: ['{job="x"}'],
          },
        },
      });
      expect(result.isError).toBe(true);
    });
  });

  // ─── build_prometheus_query ──────────────────────────────────────────

  describe('build_prometheus_query', () => {
    it('should build a basic metric query', async () => {
      const handler = registry.getHandler('build_prometheus_query')!;
      const result = await handler({
        params: {
          arguments: {
            metric: 'up',
          },
        },
      });

      expect(result.content[0].text).toContain('Built Prometheus Query');
      expect(result.content[0].text).toContain('`up`');
    });

    it('should build a query with filters and function', async () => {
      const handler = registry.getHandler('build_prometheus_query')!;
      const result = await handler({
        params: {
          arguments: {
            metric: 'http_requests_total',
            filters: { job: 'api', method: 'GET' },
            function: 'rate',
            timeWindow: '5m',
          },
        },
      });

      expect(result.content[0].text).toContain('rate(');
      expect(result.content[0].text).toContain('http_requests_total');
      expect(result.content[0].text).toContain('[5m]');
    });

    it('should build a query with aggregation function', async () => {
      const handler = registry.getHandler('build_prometheus_query')!;
      const result = await handler({
        params: {
          arguments: {
            metric: 'up',
            function: 'sum',
          },
        },
      });

      expect(result.content[0].text).toContain('sum(up)');
    });

    it('should handle errors', async () => {
      const handler = registry.getHandler('build_prometheus_query')!;
      // Pass an object with a filters getter that throws to trigger the catch path
      const badArgs = {
        metric: 'up',
        get filters() {
          throw new Error('Unexpected error');
        },
      };
      const result = await handler({
        params: {
          arguments: badArgs,
        },
      });
      expect(result.isError).toBe(true);
    });
  });
});
