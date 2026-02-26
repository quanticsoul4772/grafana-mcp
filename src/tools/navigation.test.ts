import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRegistry } from '../tool-registry.js';
import { NavigationService } from '../services/navigation.js';
import { registerNavigationTools } from './navigation.js';

const mockService = {
  generateDeepLink: vi.fn(),
  generateDashboardLink: vi.fn(),
  generatePanelLink: vi.fn(),
  generateExploreLink: vi.fn(),
  generatePrometheusExploreLink: vi.fn(),
  generateLokiExploreLink: vi.fn(),
  getTimeRangePresets: vi.fn(),
  validateTimeRange: vi.fn(),
  parseTimeRange: vi.fn(),
} as unknown as NavigationService;

describe('Navigation Tools', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new ToolRegistry();
    registerNavigationTools(registry, mockService);
  });

  it('should register all 8 tools', () => {
    expect(registry.hasTool('generate_deeplink')).toBe(true);
    expect(registry.hasTool('generate_dashboard_url')).toBe(true);
    expect(registry.hasTool('generate_panel_url')).toBe(true);
    expect(registry.hasTool('generate_explore_url')).toBe(true);
    expect(registry.hasTool('generate_prometheus_explore_url')).toBe(true);
    expect(registry.hasTool('generate_loki_explore_url')).toBe(true);
    expect(registry.hasTool('get_time_range_presets')).toBe(true);
    expect(registry.hasTool('validate_time_range')).toBe(true);
  });

  // ─── generate_deeplink ───────────────────────────────────────────────

  describe('generate_deeplink', () => {
    it('should call generateDeepLink for dashboard type and format response', async () => {
      vi.mocked(mockService.generateDeepLink).mockReturnValue({
        url: 'http://grafana.local/d/dash-1',
      });

      const handler = registry.getHandler('generate_deeplink')!;
      const result = await handler({
        params: {
          arguments: {
            type: 'dashboard',
            dashboardUid: 'dash-1',
          },
        },
      });

      expect(mockService.generateDeepLink).toHaveBeenCalled();
      expect(result.content[0].text).toContain('Generated Deeplink');
      expect(result.content[0].text).toContain('http://grafana.local/d/dash-1');
      expect(result.content[0].text).toContain('dashboard');
    });

    it('should handle explore type', async () => {
      vi.mocked(mockService.generateDeepLink).mockReturnValue({
        url: 'http://grafana.local/explore',
      });

      const handler = registry.getHandler('generate_deeplink')!;
      const result = await handler({
        params: {
          arguments: {
            type: 'explore',
            datasourceUid: 'prom-1',
          },
        },
      });

      expect(result.content[0].text).toContain('Explore view with datasource: prom-1');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.generateDeepLink).mockImplementation(() => {
        throw new Error('Invalid params');
      });
      const handler = registry.getHandler('generate_deeplink')!;
      const result = await handler({
        params: { arguments: { type: 'dashboard' } },
      });
      expect(result.isError).toBe(true);
    });
  });

  // ─── generate_dashboard_url ──────────────────────────────────────────

  describe('generate_dashboard_url', () => {
    it('should call generateDashboardLink and format response', async () => {
      vi.mocked(mockService.generateDashboardLink).mockReturnValue({
        url: 'http://grafana.local/d/dash-1?from=now-6h&to=now',
      });

      const handler = registry.getHandler('generate_dashboard_url')!;
      const result = await handler({
        params: {
          arguments: {
            dashboardUid: 'dash-1',
            from: 'now-6h',
            to: 'now',
          },
        },
      });

      expect(mockService.generateDashboardLink).toHaveBeenCalledWith('dash-1', {
        panelId: undefined,
        from: 'now-6h',
        to: 'now',
        refresh: undefined,
        vars: undefined,
      });
      expect(result.content[0].text).toContain('Dashboard URL Generated');
      expect(result.content[0].text).toContain('dash-1');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.generateDashboardLink).mockImplementation(() => {
        throw new Error('Invalid params');
      });
      const handler = registry.getHandler('generate_dashboard_url')!;
      const result = await handler({
        params: { arguments: { dashboardUid: 'dash-1' } },
      });
      expect(result.isError).toBe(true);
    });
  });

  // ─── generate_panel_url ──────────────────────────────────────────────

  describe('generate_panel_url', () => {
    it('should call generatePanelLink and format response', async () => {
      vi.mocked(mockService.generatePanelLink).mockReturnValue({
        url: 'http://grafana.local/d/dash-1?viewPanel=5',
      });

      const handler = registry.getHandler('generate_panel_url')!;
      const result = await handler({
        params: {
          arguments: {
            dashboardUid: 'dash-1',
            panelId: 5,
          },
        },
      });

      expect(mockService.generatePanelLink).toHaveBeenCalledWith('dash-1', 5, {
        from: undefined,
        to: undefined,
        refresh: undefined,
        vars: undefined,
      });
      expect(result.content[0].text).toContain('Panel URL Generated');
      expect(result.content[0].text).toContain('Panel ID:** 5');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.generatePanelLink).mockImplementation(() => {
        throw new Error('Invalid params');
      });
      const handler = registry.getHandler('generate_panel_url')!;
      const result = await handler({
        params: { arguments: { dashboardUid: 'dash-1', panelId: 5 } },
      });
      expect(result.isError).toBe(true);
    });
  });

  // ─── generate_explore_url ────────────────────────────────────────────

  describe('generate_explore_url', () => {
    it('should call generateExploreLink and format response', async () => {
      vi.mocked(mockService.generateExploreLink).mockReturnValue({
        url: 'http://grafana.local/explore?datasource=prom-1',
      });

      const handler = registry.getHandler('generate_explore_url')!;
      const result = await handler({
        params: {
          arguments: {
            datasourceUid: 'prom-1',
            query: 'up',
          },
        },
      });

      expect(mockService.generateExploreLink).toHaveBeenCalledWith('prom-1', {
        query: 'up',
        from: undefined,
        to: undefined,
        refresh: undefined,
        queryType: undefined,
      });
      expect(result.content[0].text).toContain('Explore URL Generated');
      expect(result.content[0].text).toContain('prom-1');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.generateExploreLink).mockImplementation(() => {
        throw new Error('Invalid params');
      });
      const handler = registry.getHandler('generate_explore_url')!;
      const result = await handler({
        params: { arguments: { datasourceUid: 'prom-1' } },
      });
      expect(result.isError).toBe(true);
    });
  });

  // ─── generate_prometheus_explore_url ─────────────────────────────────

  describe('generate_prometheus_explore_url', () => {
    it('should call generatePrometheusExploreLink and format response', async () => {
      vi.mocked(mockService.generatePrometheusExploreLink).mockReturnValue({
        url: 'http://grafana.local/explore?ds=prom-1&expr=up',
      });

      const handler = registry.getHandler('generate_prometheus_explore_url')!;
      const result = await handler({
        params: {
          arguments: {
            datasourceUid: 'prom-1',
            query: 'up',
          },
        },
      });

      expect(mockService.generatePrometheusExploreLink).toHaveBeenCalledWith(
        'prom-1',
        'up',
        {
          from: undefined,
          to: undefined,
          refresh: undefined,
          step: undefined,
          range: undefined,
        },
      );
      expect(result.content[0].text).toContain('Prometheus Explore URL Generated');
      expect(result.content[0].text).toContain('prom-1');
      expect(result.content[0].text).toContain('up');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.generatePrometheusExploreLink).mockImplementation(() => {
        throw new Error('Invalid params');
      });
      const handler = registry.getHandler('generate_prometheus_explore_url')!;
      const result = await handler({
        params: { arguments: { datasourceUid: 'prom-1', query: 'up' } },
      });
      expect(result.isError).toBe(true);
    });
  });

  // ─── generate_loki_explore_url ───────────────────────────────────────

  describe('generate_loki_explore_url', () => {
    it('should call generateLokiExploreLink and format response', async () => {
      vi.mocked(mockService.generateLokiExploreLink).mockReturnValue({
        url: 'http://grafana.local/explore?ds=loki-1&expr={job="nginx"}',
      });

      const handler = registry.getHandler('generate_loki_explore_url')!;
      const result = await handler({
        params: {
          arguments: {
            datasourceUid: 'loki-1',
            query: '{job="nginx"}',
          },
        },
      });

      expect(mockService.generateLokiExploreLink).toHaveBeenCalledWith(
        'loki-1',
        '{job="nginx"}',
        {
          from: undefined,
          to: undefined,
          refresh: undefined,
        },
      );
      expect(result.content[0].text).toContain('Loki Explore URL Generated');
      expect(result.content[0].text).toContain('loki-1');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.generateLokiExploreLink).mockImplementation(() => {
        throw new Error('Invalid params');
      });
      const handler = registry.getHandler('generate_loki_explore_url')!;
      const result = await handler({
        params: { arguments: { datasourceUid: 'loki-1', query: '{job="x"}' } },
      });
      expect(result.isError).toBe(true);
    });
  });

  // ─── get_time_range_presets ──────────────────────────────────────────

  describe('get_time_range_presets', () => {
    it('should call getTimeRangePresets and format response', async () => {
      vi.mocked(mockService.getTimeRangePresets).mockReturnValue([
        { label: 'Last 5 minutes', from: 'now-5m', to: 'now' },
        { label: 'Last 1 hour', from: 'now-1h', to: 'now' },
      ]);

      const handler = registry.getHandler('get_time_range_presets')!;
      const result = await handler({ params: { arguments: {} } });

      expect(mockService.getTimeRangePresets).toHaveBeenCalled();
      expect(result.content[0].text).toContain('Time Range Presets');
      expect(result.content[0].text).toContain('Last 5 minutes');
      expect(result.content[0].text).toContain('Last 1 hour');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.getTimeRangePresets).mockImplementation(() => {
        throw new Error('Error');
      });
      const handler = registry.getHandler('get_time_range_presets')!;
      const result = await handler({ params: { arguments: {} } });
      expect(result.isError).toBe(true);
    });
  });

  // ─── validate_time_range ─────────────────────────────────────────────

  describe('validate_time_range', () => {
    it('should call validateTimeRange and format valid response', async () => {
      vi.mocked(mockService.validateTimeRange).mockReturnValue({
        isValid: true,
      });
      vi.mocked(mockService.parseTimeRange).mockReturnValue({
        from: '2024-01-01T00:00:00Z',
        to: '2024-01-02T00:00:00Z',
      });

      const handler = registry.getHandler('validate_time_range')!;
      const result = await handler({
        params: { arguments: { from: 'now-1h', to: 'now' } },
      });

      expect(mockService.validateTimeRange).toHaveBeenCalledWith('now-1h', 'now');
      expect(result.content[0].text).toContain('Time Range Validation');
      expect(result.content[0].text).toContain('Valid:** Yes');
    });

    it('should format invalid time range response', async () => {
      vi.mocked(mockService.validateTimeRange).mockReturnValue({
        isValid: false,
        error: 'Invalid time format',
      });

      const handler = registry.getHandler('validate_time_range')!;
      const result = await handler({
        params: { arguments: { from: 'bad', to: 'also-bad' } },
      });

      expect(result.content[0].text).toContain('Valid:** No');
      expect(result.content[0].text).toContain('Invalid time format');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.validateTimeRange).mockImplementation(() => {
        throw new Error('Error');
      });
      const handler = registry.getHandler('validate_time_range')!;
      const result = await handler({
        params: { arguments: { from: 'now-1h', to: 'now' } },
      });
      expect(result.isError).toBe(true);
    });
  });
});
