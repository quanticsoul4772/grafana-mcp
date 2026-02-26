import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NavigationService } from './navigation.js';
import { Config } from '../types.js';

const mockConfig = {
  GRAFANA_URL: 'https://grafana.example.com',
  GRAFANA_TOKEN: 'test-token',
  GRAFANA_DEBUG: false,
  GRAFANA_TIMEOUT: 30000,
} as Config;

describe('NavigationService', () => {
  let service: NavigationService;

  beforeEach(() => {
    service = new NavigationService(mockConfig);
  });

  describe('constructor', () => {
    it('should strip trailing slash from base URL', () => {
      const config = {
        ...mockConfig,
        GRAFANA_URL: 'https://grafana.example.com/',
      } as Config;
      const svc = new NavigationService(config);
      const link = svc.generateAlertsLink();
      expect(link.url).toBe('https://grafana.example.com/alerting/list');
    });

    it('should handle URL without trailing slash', () => {
      const link = service.generateAlertsLink();
      expect(link.url).toBe('https://grafana.example.com/alerting/list');
    });
  });

  // ─── generateDeepLink ─────────────────────────────────────────────

  describe('generateDeepLink', () => {
    describe('dashboard type', () => {
      it('should generate a basic dashboard link', () => {
        const result = service.generateDeepLink({
          type: 'dashboard',
          dashboardUid: 'abc123',
        });
        expect(result).toEqual({
          url: 'https://grafana.example.com/d/abc123',
          type: 'dashboard',
          title: 'Dashboard abc123',
        });
      });

      it('should include viewPanel param when panelId is provided', () => {
        const result = service.generateDeepLink({
          type: 'dashboard',
          dashboardUid: 'abc123',
          panelId: 5,
        });
        expect(result.url).toBe(
          'https://grafana.example.com/d/abc123?viewPanel=5',
        );
        expect(result.title).toBe('Dashboard abc123 - Panel 5');
      });

      it('should throw if dashboardUid is missing for dashboard type', () => {
        expect(() =>
          service.generateDeepLink({ type: 'dashboard' }),
        ).toThrow('dashboardUid is required for dashboard links');
      });

      it('should include time range parameters', () => {
        const result = service.generateDeepLink({
          type: 'dashboard',
          dashboardUid: 'abc123',
          from: 'now-1h',
          to: 'now',
        });
        expect(result.url).toContain('from=now-1h');
        expect(result.url).toContain('to=now');
      });

      it('should include refresh parameter', () => {
        const result = service.generateDeepLink({
          type: 'dashboard',
          dashboardUid: 'abc123',
          refresh: '5s',
        });
        expect(result.url).toContain('refresh=5s');
      });

      it('should include template variables with var- prefix', () => {
        const result = service.generateDeepLink({
          type: 'dashboard',
          dashboardUid: 'abc123',
          vars: { host: 'server1', env: 'prod' },
        });
        expect(result.url).toContain('var-host=server1');
        expect(result.url).toContain('var-env=prod');
      });

      it('should combine all parameters correctly', () => {
        const result = service.generateDeepLink({
          type: 'dashboard',
          dashboardUid: 'abc123',
          panelId: 2,
          from: 'now-6h',
          to: 'now',
          refresh: '10s',
          vars: { region: 'us-east' },
        });
        const url = new URL(result.url);
        expect(url.pathname).toBe('/d/abc123');
        expect(url.searchParams.get('viewPanel')).toBe('2');
        expect(url.searchParams.get('from')).toBe('now-6h');
        expect(url.searchParams.get('to')).toBe('now');
        expect(url.searchParams.get('refresh')).toBe('10s');
        expect(url.searchParams.get('var-region')).toBe('us-east');
      });
    });

    describe('panel type', () => {
      it('should generate a panel link with required fields', () => {
        const result = service.generateDeepLink({
          type: 'panel',
          dashboardUid: 'dash1',
          panelId: 7,
        });
        expect(result).toEqual({
          url: 'https://grafana.example.com/d/dash1?viewPanel=7',
          type: 'panel',
          title: 'Panel 7 in Dashboard dash1',
        });
      });

      it('should throw if dashboardUid is missing for panel type', () => {
        expect(() =>
          service.generateDeepLink({ type: 'panel', panelId: 7 }),
        ).toThrow('dashboardUid and panelId are required for panel links');
      });

      it('should throw if panelId is missing for panel type', () => {
        expect(() =>
          service.generateDeepLink({ type: 'panel', dashboardUid: 'dash1' }),
        ).toThrow('dashboardUid and panelId are required for panel links');
      });

      it('should throw if both dashboardUid and panelId are missing for panel type', () => {
        expect(() => service.generateDeepLink({ type: 'panel' })).toThrow(
          'dashboardUid and panelId are required for panel links',
        );
      });
    });

    describe('explore type', () => {
      it('should generate a basic explore link', () => {
        const result = service.generateDeepLink({ type: 'explore' });
        expect(result).toEqual({
          url: 'https://grafana.example.com/explore',
          type: 'explore',
          title: 'Explore',
        });
      });

      it('should include datasource in left pane JSON when datasourceUid is provided', () => {
        const result = service.generateDeepLink({
          type: 'explore',
          datasourceUid: 'prom-1',
        });
        const url = new URL(result.url);
        const leftParam = url.searchParams.get('left');
        expect(leftParam).not.toBeNull();
        const left = JSON.parse(leftParam!);
        expect(left.datasource).toBe('prom-1');
      });

      it('should include expr in left pane when query is provided with datasourceUid', () => {
        const result = service.generateDeepLink({
          type: 'explore',
          datasourceUid: 'prom-1',
          query: 'up{job="api"}',
        });
        const url = new URL(result.url);
        const left = JSON.parse(url.searchParams.get('left')!);
        expect(left.datasource).toBe('prom-1');
        expect(left.expr).toBe('up{job="api"}');
      });

      it('should use left param directly when left option is provided (overrides datasourceUid)', () => {
        const result = service.generateDeepLink({
          type: 'explore',
          datasourceUid: 'prom-1',
          left: { datasource: 'custom-ds', expr: 'custom_query' },
        });
        const url = new URL(result.url);
        const left = JSON.parse(url.searchParams.get('left')!);
        // The left option overrides the auto-generated one from datasourceUid
        expect(left.datasource).toBe('custom-ds');
        expect(left.expr).toBe('custom_query');
      });

      it('should include right pane JSON when right option is provided', () => {
        const result = service.generateDeepLink({
          type: 'explore',
          right: { datasource: 'loki-1', expr: '{app="web"}' },
        });
        const url = new URL(result.url);
        const right = JSON.parse(url.searchParams.get('right')!);
        expect(right.datasource).toBe('loki-1');
        expect(right.expr).toBe('{app="web"}');
      });

      it('should include both left and right pane params for split view', () => {
        const result = service.generateDeepLink({
          type: 'explore',
          left: { datasource: 'prom-1', expr: 'up' },
          right: { datasource: 'loki-1', expr: '{app="web"}' },
        });
        const url = new URL(result.url);
        expect(url.searchParams.get('left')).not.toBeNull();
        expect(url.searchParams.get('right')).not.toBeNull();
      });
    });

    describe('unsupported type', () => {
      it('should throw for an unsupported link type', () => {
        expect(() =>
          service.generateDeepLink({ type: 'unknown' as any }),
        ).toThrow('Unsupported link type: unknown');
      });
    });
  });

  // ─── generateDashboardLink ────────────────────────────────────────

  describe('generateDashboardLink', () => {
    it('should generate a dashboard link with uid only', () => {
      const result = service.generateDashboardLink('my-dash');
      expect(result.url).toBe('https://grafana.example.com/d/my-dash');
      expect(result.type).toBe('dashboard');
      expect(result.title).toBe('Dashboard my-dash');
    });

    it('should forward optional parameters', () => {
      const result = service.generateDashboardLink('my-dash', {
        panelId: 3,
        from: 'now-2h',
        to: 'now',
        refresh: '30s',
        vars: { cluster: 'prod' },
      });
      const url = new URL(result.url);
      expect(url.searchParams.get('viewPanel')).toBe('3');
      expect(url.searchParams.get('from')).toBe('now-2h');
      expect(url.searchParams.get('to')).toBe('now');
      expect(url.searchParams.get('refresh')).toBe('30s');
      expect(url.searchParams.get('var-cluster')).toBe('prod');
    });

    it('should work with no options', () => {
      const result = service.generateDashboardLink('uid-only');
      expect(result.url).toBe('https://grafana.example.com/d/uid-only');
    });
  });

  // ─── generatePanelLink ────────────────────────────────────────────

  describe('generatePanelLink', () => {
    it('should generate a panel link', () => {
      const result = service.generatePanelLink('dash-uid', 10);
      expect(result.url).toBe(
        'https://grafana.example.com/d/dash-uid?viewPanel=10',
      );
      expect(result.type).toBe('panel');
      expect(result.title).toBe('Panel 10 in Dashboard dash-uid');
    });

    it('should forward optional time range and vars', () => {
      const result = service.generatePanelLink('dash-uid', 10, {
        from: 'now-12h',
        to: 'now',
        refresh: '1m',
        vars: { namespace: 'default' },
      });
      const url = new URL(result.url);
      expect(url.searchParams.get('viewPanel')).toBe('10');
      expect(url.searchParams.get('from')).toBe('now-12h');
      expect(url.searchParams.get('to')).toBe('now');
      expect(url.searchParams.get('refresh')).toBe('1m');
      expect(url.searchParams.get('var-namespace')).toBe('default');
    });
  });

  // ─── generateExploreLink ──────────────────────────────────────────

  describe('generateExploreLink', () => {
    it('should generate an explore link with datasource only', () => {
      const result = service.generateExploreLink('ds-uid');
      expect(result.type).toBe('explore');
      expect(result.title).toBe('Explore');
      const url = new URL(result.url);
      const left = JSON.parse(url.searchParams.get('left')!);
      expect(left.datasource).toBe('ds-uid');
    });

    it('should include expr when query is provided', () => {
      const result = service.generateExploreLink('ds-uid', {
        query: 'rate(http_requests_total[5m])',
      });
      const url = new URL(result.url);
      const left = JSON.parse(url.searchParams.get('left')!);
      expect(left.datasource).toBe('ds-uid');
      expect(left.expr).toBe('rate(http_requests_total[5m])');
    });

    it('should include queryType in left pane', () => {
      const result = service.generateExploreLink('ds-uid', {
        queryType: 'range',
      });
      const url = new URL(result.url);
      const left = JSON.parse(url.searchParams.get('left')!);
      expect(left.queryType).toBe('range');
    });

    it('should merge leftPaneOptions into left param', () => {
      const result = service.generateExploreLink('ds-uid', {
        leftPaneOptions: { range: true, step: '15s' },
      });
      const url = new URL(result.url);
      const left = JSON.parse(url.searchParams.get('left')!);
      expect(left.datasource).toBe('ds-uid');
      expect(left.range).toBe(true);
      expect(left.step).toBe('15s');
    });

    it('should include right pane for split view', () => {
      const result = service.generateExploreLink('ds-uid', {
        rightPaneOptions: { datasource: 'other-ds', expr: 'other_query' },
      });
      const url = new URL(result.url);
      const right = JSON.parse(url.searchParams.get('right')!);
      expect(right.datasource).toBe('other-ds');
      expect(right.expr).toBe('other_query');
    });

    it('should include time range parameters', () => {
      const result = service.generateExploreLink('ds-uid', {
        from: 'now-3h',
        to: 'now',
        refresh: '10s',
      });
      const url = new URL(result.url);
      expect(url.searchParams.get('from')).toBe('now-3h');
      expect(url.searchParams.get('to')).toBe('now');
      expect(url.searchParams.get('refresh')).toBe('10s');
    });

    it('should handle all options together', () => {
      const result = service.generateExploreLink('ds-uid', {
        query: 'up',
        queryType: 'instant',
        from: 'now-1h',
        to: 'now',
        refresh: '5s',
        leftPaneOptions: { custom: 'value' },
        rightPaneOptions: { datasource: 'ds2' },
      });
      const url = new URL(result.url);
      const left = JSON.parse(url.searchParams.get('left')!);
      expect(left.datasource).toBe('ds-uid');
      expect(left.expr).toBe('up');
      expect(left.queryType).toBe('instant');
      expect(left.custom).toBe('value');
      expect(url.searchParams.get('from')).toBe('now-1h');
      expect(url.searchParams.get('to')).toBe('now');
      expect(url.searchParams.get('refresh')).toBe('5s');
      expect(url.searchParams.get('right')).not.toBeNull();
    });
  });

  // ─── generatePrometheusExploreLink ────────────────────────────────

  describe('generatePrometheusExploreLink', () => {
    it('should generate a Prometheus explore link with range enabled by default', () => {
      const result = service.generatePrometheusExploreLink(
        'prom-uid',
        'up{job="api"}',
      );
      const url = new URL(result.url);
      const left = JSON.parse(url.searchParams.get('left')!);
      expect(left.datasource).toBe('prom-uid');
      expect(left.expr).toBe('up{job="api"}');
      expect(left.queryType).toBe('');
      expect(left.range).toBe(true);
    });

    it('should disable range when range option is false', () => {
      const result = service.generatePrometheusExploreLink(
        'prom-uid',
        'up',
        { range: false },
      );
      const url = new URL(result.url);
      const left = JSON.parse(url.searchParams.get('left')!);
      expect(left.range).toBeUndefined();
    });

    it('should include step option', () => {
      const result = service.generatePrometheusExploreLink(
        'prom-uid',
        'up',
        { step: '15s' },
      );
      const url = new URL(result.url);
      const left = JSON.parse(url.searchParams.get('left')!);
      expect(left.step).toBe('15s');
    });

    it('should include time range parameters', () => {
      const result = service.generatePrometheusExploreLink(
        'prom-uid',
        'up',
        { from: 'now-24h', to: 'now', refresh: '1m' },
      );
      const url = new URL(result.url);
      expect(url.searchParams.get('from')).toBe('now-24h');
      expect(url.searchParams.get('to')).toBe('now');
      expect(url.searchParams.get('refresh')).toBe('1m');
    });

    it('should work with no options', () => {
      const result = service.generatePrometheusExploreLink('prom-uid', 'up');
      expect(result.type).toBe('explore');
      const url = new URL(result.url);
      const left = JSON.parse(url.searchParams.get('left')!);
      expect(left.range).toBe(true);
    });
  });

  // ─── generateLokiExploreLink ──────────────────────────────────────

  describe('generateLokiExploreLink', () => {
    it('should generate a Loki explore link', () => {
      const result = service.generateLokiExploreLink(
        'loki-uid',
        '{app="web"} |= "error"',
      );
      const url = new URL(result.url);
      const left = JSON.parse(url.searchParams.get('left')!);
      expect(left.datasource).toBe('loki-uid');
      expect(left.expr).toBe('{app="web"} |= "error"');
      expect(left.queryType).toBe('');
    });

    it('should include time range parameters', () => {
      const result = service.generateLokiExploreLink(
        'loki-uid',
        '{app="web"}',
        { from: 'now-30m', to: 'now', refresh: '5s' },
      );
      const url = new URL(result.url);
      expect(url.searchParams.get('from')).toBe('now-30m');
      expect(url.searchParams.get('to')).toBe('now');
      expect(url.searchParams.get('refresh')).toBe('5s');
    });

    it('should work with no options', () => {
      const result = service.generateLokiExploreLink(
        'loki-uid',
        '{job="app"}',
      );
      expect(result.type).toBe('explore');
      expect(result.title).toBe('Explore');
    });
  });

  // ─── Static link generators ───────────────────────────────────────

  describe('generateAlertsLink', () => {
    it('should generate alerts list link', () => {
      const result = service.generateAlertsLink();
      expect(result).toEqual({
        url: 'https://grafana.example.com/alerting/list',
        type: 'dashboard',
        title: 'Alerts',
      });
    });
  });

  describe('generateAlertRuleLink', () => {
    it('should generate alert rule link', () => {
      const result = service.generateAlertRuleLink('rule-abc');
      expect(result).toEqual({
        url: 'https://grafana.example.com/alerting/rule-abc/view',
        type: 'dashboard',
        title: 'Alert Rule rule-abc',
      });
    });
  });

  describe('generateDatasourcesLink', () => {
    it('should generate datasources list link', () => {
      const result = service.generateDatasourcesLink();
      expect(result).toEqual({
        url: 'https://grafana.example.com/datasources',
        type: 'dashboard',
        title: 'Datasources',
      });
    });
  });

  describe('generateDatasourceLink', () => {
    it('should generate datasource edit link', () => {
      const result = service.generateDatasourceLink('ds-123');
      expect(result).toEqual({
        url: 'https://grafana.example.com/datasources/edit/ds-123',
        type: 'dashboard',
        title: 'Datasource ds-123',
      });
    });
  });

  describe('generateTeamsLink', () => {
    it('should generate teams list link', () => {
      const result = service.generateTeamsLink();
      expect(result).toEqual({
        url: 'https://grafana.example.com/org/teams',
        type: 'dashboard',
        title: 'Teams',
      });
    });
  });

  describe('generateTeamLink', () => {
    it('should generate team edit link', () => {
      const result = service.generateTeamLink(42);
      expect(result).toEqual({
        url: 'https://grafana.example.com/org/teams/edit/42',
        type: 'dashboard',
        title: 'Team 42',
      });
    });
  });

  describe('generateUsersLink', () => {
    it('should generate users list link', () => {
      const result = service.generateUsersLink();
      expect(result).toEqual({
        url: 'https://grafana.example.com/admin/users',
        type: 'dashboard',
        title: 'Users',
      });
    });
  });

  describe('generateUserLink', () => {
    it('should generate user edit link', () => {
      const result = service.generateUserLink(99);
      expect(result).toEqual({
        url: 'https://grafana.example.com/admin/users/edit/99',
        type: 'dashboard',
        title: 'User 99',
      });
    });
  });

  describe('generateFolderLink', () => {
    it('should generate folder link', () => {
      const result = service.generateFolderLink('folder-xyz');
      expect(result).toEqual({
        url: 'https://grafana.example.com/dashboards/f/folder-xyz',
        type: 'dashboard',
        title: 'Folder folder-xyz',
      });
    });
  });

  // ─── parseTimeRange ───────────────────────────────────────────────

  describe('parseTimeRange', () => {
    let dateSpy: ReturnType<typeof vi.spyOn>;
    const FIXED_NOW = 1700000000000;

    beforeEach(() => {
      dateSpy = vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
    });

    afterEach(() => {
      dateSpy.mockRestore();
    });

    it('should parse "now" as current timestamp', () => {
      const result = service.parseTimeRange('now', 'now');
      expect(result.from).toBe(FIXED_NOW.toString());
      expect(result.to).toBe(FIXED_NOW.toString());
    });

    it('should default "to" to "now"', () => {
      const result = service.parseTimeRange('now-1h');
      expect(result.to).toBe(FIXED_NOW.toString());
    });

    it('should parse seconds unit (s)', () => {
      const result = service.parseTimeRange('now-30s');
      expect(result.from).toBe((FIXED_NOW - 30 * 1000).toString());
    });

    it('should parse minutes unit (m)', () => {
      const result = service.parseTimeRange('now-5m');
      expect(result.from).toBe((FIXED_NOW - 5 * 60 * 1000).toString());
    });

    it('should parse hours unit (h)', () => {
      const result = service.parseTimeRange('now-1h');
      expect(result.from).toBe((FIXED_NOW - 1 * 60 * 60 * 1000).toString());
    });

    it('should parse days unit (d)', () => {
      const result = service.parseTimeRange('now-7d');
      expect(result.from).toBe(
        (FIXED_NOW - 7 * 24 * 60 * 60 * 1000).toString(),
      );
    });

    it('should parse weeks unit (w)', () => {
      const result = service.parseTimeRange('now-2w');
      expect(result.from).toBe(
        (FIXED_NOW - 2 * 7 * 24 * 60 * 60 * 1000).toString(),
      );
    });

    it('should parse months unit (M)', () => {
      const result = service.parseTimeRange('now-3M');
      expect(result.from).toBe(
        (FIXED_NOW - 3 * 30 * 24 * 60 * 60 * 1000).toString(),
      );
    });

    it('should parse years unit (y)', () => {
      const result = service.parseTimeRange('now-1y');
      expect(result.from).toBe(
        (FIXED_NOW - 1 * 365 * 24 * 60 * 60 * 1000).toString(),
      );
    });

    it('should return absolute timestamps as-is', () => {
      const result = service.parseTimeRange('1699900000000', '1700000000000');
      expect(result.from).toBe('1699900000000');
      expect(result.to).toBe('1700000000000');
    });

    it('should return non-matching strings as-is', () => {
      const result = service.parseTimeRange('2024-01-01', '2024-01-02');
      expect(result.from).toBe('2024-01-01');
      expect(result.to).toBe('2024-01-02');
    });

    it('should handle large relative values', () => {
      const result = service.parseTimeRange('now-365d');
      expect(result.from).toBe(
        (FIXED_NOW - 365 * 24 * 60 * 60 * 1000).toString(),
      );
    });
  });

  // ─── validateTimeRange ────────────────────────────────────────────

  describe('validateTimeRange', () => {
    let dateSpy: ReturnType<typeof vi.spyOn>;
    const FIXED_NOW = 1700000000000;

    beforeEach(() => {
      dateSpy = vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
    });

    afterEach(() => {
      dateSpy.mockRestore();
    });

    it('should validate a correct time range', () => {
      const result = service.validateTimeRange('now-1h', 'now');
      expect(result).toEqual({ isValid: true });
    });

    it('should reject when from >= to', () => {
      const result = service.validateTimeRange('now', 'now-1h');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('From time must be before to time');
    });

    it('should reject when from equals to', () => {
      const result = service.validateTimeRange('now', 'now');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('From time must be before to time');
    });

    it('should reject invalid time format (non-numeric result)', () => {
      const result = service.validateTimeRange('invalid', 'also-invalid');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid time format');
    });

    it('should validate absolute timestamps', () => {
      const result = service.validateTimeRange('1699000000000', '1700000000000');
      expect(result).toEqual({ isValid: true });
    });

    it('should reject absolute timestamps where from > to', () => {
      const result = service.validateTimeRange('1700000000000', '1699000000000');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('From time must be before to time');
    });
  });

  // ─── getTimeRangePresets ──────────────────────────────────────────

  describe('getTimeRangePresets', () => {
    it('should return an array of presets', () => {
      const presets = service.getTimeRangePresets();
      expect(Array.isArray(presets)).toBe(true);
      expect(presets.length).toBe(16);
    });

    it('should have the correct structure for each preset', () => {
      const presets = service.getTimeRangePresets();
      for (const preset of presets) {
        expect(preset).toHaveProperty('label');
        expect(preset).toHaveProperty('from');
        expect(preset).toHaveProperty('to');
        expect(typeof preset.label).toBe('string');
        expect(preset.from).toMatch(/^now-\d+[smhdwMy]$/);
        expect(preset.to).toBe('now');
      }
    });

    it('should include common presets', () => {
      const presets = service.getTimeRangePresets();
      const labels = presets.map((p) => p.label);
      expect(labels).toContain('Last 5 minutes');
      expect(labels).toContain('Last 1 hour');
      expect(labels).toContain('Last 24 hours');
      expect(labels).toContain('Last 7 days');
      expect(labels).toContain('Last 30 days');
      expect(labels).toContain('Last 1 year');
    });

    it('should start with the shortest time range', () => {
      const presets = service.getTimeRangePresets();
      expect(presets[0].label).toBe('Last 5 minutes');
      expect(presets[0].from).toBe('now-5m');
    });

    it('should end with the longest time range', () => {
      const presets = service.getTimeRangePresets();
      expect(presets[presets.length - 1].label).toBe('Last 5 years');
      expect(presets[presets.length - 1].from).toBe('now-5y');
    });
  });
});
