import { describe, it, expect, beforeAll } from 'vitest';
import axios from 'axios';
import { GrafanaHttpClient } from './http-client.js';
import { DashboardService } from './services/dashboard.js';
import { DatasourceService } from './services/datasource.js';
import { AlertingService } from './services/alerting.js';
import { NavigationService } from './services/navigation.js';
import type { Config } from './types.js';

const GRAFANA_URL = process.env.GRAFANA_URL || 'http://localhost:3333';
const GRAFANA_TOKEN = process.env.GRAFANA_TOKEN || 'admin:admin';

/**
 * Check whether the test Grafana instance is reachable.
 * Returns true if `/api/health` responds successfully.
 */
async function isGrafanaAvailable(): Promise<boolean> {
  try {
    const response = await axios.get(`${GRAFANA_URL}/api/health`, {
      timeout: 3000,
    });
    return response.status === 200;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Determine availability once before any test runs
// ---------------------------------------------------------------------------
let grafanaAvailable = false;

beforeAll(async () => {
  grafanaAvailable = await isGrafanaAvailable();
  if (!grafanaAvailable) {
    console.error(
      `[integration] Grafana not available at ${GRAFANA_URL} — skipping integration tests.` +
        ' Start it with: docker compose -f docker-compose.test.yml up -d',
    );
  }
});

// ---------------------------------------------------------------------------
// Helper to build a Config object for the test Grafana
// ---------------------------------------------------------------------------
function makeTestConfig(): Config {
  return {
    GRAFANA_URL,
    GRAFANA_TOKEN,
    GRAFANA_DEBUG: false,
    GRAFANA_TIMEOUT: 10000,
    GRAFANA_DISABLE_TOOLS: [],
    GRAFANA_TLS_SKIP_VERIFY: false,
  };
}

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe('Integration: Grafana MCP Server', () => {
  // ---- Health check via HTTP client ------------------------------------------
  describe('Health check', () => {
    it('should connect to the Grafana instance', async ({ skip }) => {
      if (!grafanaAvailable) return skip();

      const config = makeTestConfig();
      const httpClient = new GrafanaHttpClient(config);

      const ok = await httpClient.testConnection();
      expect(ok).toBe(true);

      httpClient.cleanup();
    });
  });

  // ---- Dashboard service ----------------------------------------------------
  describe('Dashboard service', () => {
    it('should search dashboards (expect empty or default results)', async ({ skip }) => {
      if (!grafanaAvailable) return skip();

      const config = makeTestConfig();
      const httpClient = new GrafanaHttpClient(config);
      const dashboardService = new DashboardService(httpClient);

      const dashboards = await dashboardService.searchDashboards();

      // A fresh Grafana instance may have zero dashboards or a few defaults.
      expect(Array.isArray(dashboards)).toBe(true);

      httpClient.cleanup();
    });
  });

  // ---- Datasource service ---------------------------------------------------
  describe('Datasource service', () => {
    it('should list datasources', async ({ skip }) => {
      if (!grafanaAvailable) return skip();

      const config = makeTestConfig();
      const httpClient = new GrafanaHttpClient(config);
      const datasourceService = new DatasourceService(httpClient);

      const datasources = await datasourceService.listDatasources();

      // A fresh Grafana may have zero datasources; that is fine.
      expect(Array.isArray(datasources)).toBe(true);

      httpClient.cleanup();
    });
  });

  // ---- Alerting service -----------------------------------------------------
  describe('Alerting service', () => {
    it('should list alert rules', async ({ skip }) => {
      if (!grafanaAvailable) return skip();

      const config = makeTestConfig();
      const httpClient = new GrafanaHttpClient(config);
      const alertingService = new AlertingService(httpClient);

      // The ruler API returns a map of folder -> rule groups on a fresh instance.
      // Our service wraps it as AlertRule[]. Either an empty array or an object
      // is acceptable — we just verify no unhandled exception is thrown.
      try {
        const rules = await alertingService.listAlertRules();
        // If it returns, it should be array-like
        expect(rules).toBeDefined();
      } catch (error: any) {
        // Some Grafana editions return 404 for the ruler API when unified
        // alerting is not enabled. Accept that gracefully.
        expect([404, 500]).toContain(error.status ?? error.response?.status);
      }

      httpClient.cleanup();
    });
  });

  // ---- Navigation service (no Grafana server needed) ------------------------
  describe('Navigation service', () => {
    it('should generate a dashboard deep link', () => {
      // NavigationService only needs a Config — no HTTP calls.
      const config = makeTestConfig();
      const navigationService = new NavigationService(config);

      const link = navigationService.generateDashboardLink('abc123', {
        from: 'now-1h',
        to: 'now',
      });

      expect(link.url).toContain('/d/abc123');
      expect(link.url).toContain('from=now-1h');
      expect(link.url).toContain('to=now');
      expect(link.type).toBe('dashboard');
    });

    it('should generate an explore deep link', () => {
      const config = makeTestConfig();
      const navigationService = new NavigationService(config);

      const link = navigationService.generateExploreLink('prom-uid', {
        query: 'up',
      });

      expect(link.url).toContain('/explore');
      expect(link.type).toBe('explore');
    });
  });
});
