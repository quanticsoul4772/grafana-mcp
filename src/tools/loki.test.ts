import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRegistry } from '../tool-registry.js';
import { LokiService } from '../services/loki.js';
import { registerLokiTools } from './loki.js';

const mockService = {
  query: vi.fn(),
  getLabelNames: vi.fn(),
  getLabelValues: vi.fn(),
  getSeries: vi.fn(),
  getIndexStats: vi.fn(),
} as unknown as LokiService;

describe('Loki Tools', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new ToolRegistry();
    registerLokiTools(registry, mockService);
  });

  it('should register all 6 tools', () => {
    expect(registry.hasTool('query_loki')).toBe(true);
    expect(registry.hasTool('get_loki_labels')).toBe(true);
    expect(registry.hasTool('get_loki_label_values')).toBe(true);
    expect(registry.hasTool('get_loki_series')).toBe(true);
    expect(registry.hasTool('build_logql_query')).toBe(true);
    expect(registry.hasTool('get_loki_stats')).toBe(true);
  });

  // ─── query_loki ──────────────────────────────────────────────────────

  describe('query_loki', () => {
    it('should call query and format response with log entries', async () => {
      vi.mocked(mockService.query).mockResolvedValue({
        data: {
          result: [
            {
              stream: { job: 'nginx', level: 'error' },
              values: [
                ['1704067200000000000', 'Error: connection refused'],
              ],
            },
          ],
        },
      });

      const handler = registry.getHandler('query_loki')!;
      const result = await handler({
        params: {
          arguments: {
            query: '{job="nginx"}',
            datasourceUid: 'loki-1',
          },
        },
      });

      expect(mockService.query).toHaveBeenCalled();
      expect(result.content[0].text).toContain('Loki Query Results');
      expect(result.content[0].text).toContain('Error: connection refused');
    });

    it('should handle empty results', async () => {
      vi.mocked(mockService.query).mockResolvedValue({
        data: { result: [] },
      });

      const handler = registry.getHandler('query_loki')!;
      const result = await handler({
        params: {
          arguments: {
            query: '{job="nginx"}',
            datasourceUid: 'loki-1',
          },
        },
      });

      expect(result.content[0].text).toContain('No logs found');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.query).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('query_loki')!;
      const result = await handler({
        params: {
          arguments: {
            query: '{job="nginx"}',
            datasourceUid: 'loki-1',
          },
        },
      });
      expect(result.isError).toBe(true);
    });
  });

  // ─── get_loki_labels ─────────────────────────────────────────────────

  describe('get_loki_labels', () => {
    it('should call getLabelNames and format response', async () => {
      vi.mocked(mockService.getLabelNames).mockResolvedValue({
        data: ['job', 'level', 'namespace'],
      });

      const handler = registry.getHandler('get_loki_labels')!;
      const result = await handler({
        params: { arguments: { datasourceUid: 'loki-1' } },
      });

      expect(mockService.getLabelNames).toHaveBeenCalledWith('loki-1', undefined, undefined);
      expect(result.content[0].text).toContain('Loki Labels (3 total)');
      expect(result.content[0].text).toContain('- job');
      expect(result.content[0].text).toContain('- level');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.getLabelNames).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('get_loki_labels')!;
      const result = await handler({
        params: { arguments: { datasourceUid: 'loki-1' } },
      });
      expect(result.isError).toBe(true);
    });
  });

  // ─── get_loki_label_values ───────────────────────────────────────────

  describe('get_loki_label_values', () => {
    it('should call getLabelValues and format response', async () => {
      vi.mocked(mockService.getLabelValues).mockResolvedValue({
        data: ['nginx', 'grafana', 'prometheus'],
      });

      const handler = registry.getHandler('get_loki_label_values')!;
      const result = await handler({
        params: { arguments: { datasourceUid: 'loki-1', label: 'job' } },
      });

      expect(mockService.getLabelValues).toHaveBeenCalledWith('loki-1', 'job', undefined, undefined);
      expect(result.content[0].text).toContain('Values for label "job" (3 total)');
      expect(result.content[0].text).toContain('- nginx');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.getLabelValues).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('get_loki_label_values')!;
      const result = await handler({
        params: { arguments: { datasourceUid: 'loki-1', label: 'job' } },
      });
      expect(result.isError).toBe(true);
    });
  });

  // ─── get_loki_series ─────────────────────────────────────────────────

  describe('get_loki_series', () => {
    it('should call getSeries and format response', async () => {
      vi.mocked(mockService.getSeries).mockResolvedValue({
        data: [
          { job: 'nginx', level: 'error' },
          { job: 'grafana', level: 'info' },
        ],
      });

      const handler = registry.getHandler('get_loki_series')!;
      const result = await handler({
        params: {
          arguments: {
            datasourceUid: 'loki-1',
            match: ['{job="nginx"}'],
          },
        },
      });

      expect(mockService.getSeries).toHaveBeenCalledWith('loki-1', ['{job="nginx"}'], undefined, undefined);
      expect(result.content[0].text).toContain('Loki Series (2 total)');
      expect(result.content[0].text).toContain('job="nginx"');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.getSeries).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('get_loki_series')!;
      const result = await handler({
        params: {
          arguments: {
            datasourceUid: 'loki-1',
            match: ['{job="nginx"}'],
          },
        },
      });
      expect(result.isError).toBe(true);
    });
  });

  // ─── build_logql_query ───────────────────────────────────────────────

  describe('build_logql_query', () => {
    it('should build a basic stream selector query', async () => {
      const handler = registry.getHandler('build_logql_query')!;
      const result = await handler({
        params: {
          arguments: {
            labels: { job: 'nginx', level: 'error' },
          },
        },
      });

      expect(result.content[0].text).toContain('Built LogQL Query');
      expect(result.content[0].text).toContain('{job="nginx",level="error"}');
    });

    it('should build a query with filter and operation', async () => {
      const handler = registry.getHandler('build_logql_query')!;
      const result = await handler({
        params: {
          arguments: {
            labels: { job: 'nginx' },
            filter: 'timeout',
            operation: 'rate',
            timeWindow: '5m',
            filterType: 'contains',
          },
        },
      });

      expect(result.content[0].text).toContain('rate(');
      expect(result.content[0].text).toContain('[5m]');
      expect(result.content[0].text).toContain('timeout');
    });

    it('should build a query with regex filter', async () => {
      const handler = registry.getHandler('build_logql_query')!;
      const result = await handler({
        params: {
          arguments: {
            labels: { job: 'nginx' },
            filter: 'error.*timeout',
            filterType: 'regex',
          },
        },
      });

      expect(result.content[0].text).toContain('|~');
      expect(result.content[0].text).toContain('error.*timeout');
    });

    it('should handle errors', async () => {
      // build_logql_query is a pure function; to trigger an error, pass something that causes an exception
      // Since the handler catches errors, we can simulate by passing an input that causes an issue
      // Actually, this handler is pure and unlikely to error, but let's test the catch path
      const handler = registry.getHandler('build_logql_query')!;
      // Passing null as labels to cause Object.entries to throw
      const result = await handler({
        params: {
          arguments: {
            labels: null,
          },
        },
      });
      expect(result.isError).toBe(true);
    });
  });

  // ─── get_loki_stats ──────────────────────────────────────────────────

  describe('get_loki_stats', () => {
    it('should call getIndexStats and format response', async () => {
      vi.mocked(mockService.getIndexStats).mockResolvedValue({
        streams: 100,
        chunks: 5000,
        entries: 1000000,
      });

      const handler = registry.getHandler('get_loki_stats')!;
      const result = await handler({
        params: { arguments: { datasourceUid: 'loki-1' } },
      });

      expect(mockService.getIndexStats).toHaveBeenCalledWith('loki-1', '*');
      expect(result.content[0].text).toContain('Loki Statistics');
      expect(result.content[0].text).toContain('loki-1');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.getIndexStats).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('get_loki_stats')!;
      const result = await handler({
        params: { arguments: { datasourceUid: 'loki-1' } },
      });
      expect(result.isError).toBe(true);
    });
  });
});
