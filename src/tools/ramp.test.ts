import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRegistry } from '../tool-registry.js';
import { RampService } from '../services/ramp.js';
import { registerRampTools } from './ramp.js';

const mockService = {
  discoverSensors: vi.fn(),
  getSensorStatus: vi.fn(),
  querySensorMetric: vi.fn(),
  deployRampDashboard: vi.fn(),
  listBaselines: vi.fn(),
  getPerformanceVerdict: vi.fn(),
  annotateTest: vi.fn(),
} as unknown as RampService;

describe('Ramp Tools', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new ToolRegistry();
    registerRampTools(registry, mockService);
  });

  it('should register all 7 tools', () => {
    expect(registry.hasTool('discover_sensors')).toBe(true);
    expect(registry.hasTool('sensor_status')).toBe(true);
    expect(registry.hasTool('query_sensor_metric')).toBe(true);
    expect(registry.hasTool('deploy_ramp_dashboard')).toBe(true);
    expect(registry.hasTool('list_baselines')).toBe(true);
    expect(registry.hasTool('sensor_performance_verdict')).toBe(true);
    expect(registry.hasTool('annotate_test')).toBe(true);
  });

  // ─── discover_sensors ────────────────────────────────────────────────

  describe('discover_sensors', () => {
    it('should call discoverSensors and format response', async () => {
      vi.mocked(mockService.discoverSensors).mockResolvedValue([
        {
          hostname: 'sensor-1',
          port: 3100,
          grafanaUrl: 'http://localhost:3100',
          prometheusUid: 'prom-abc',
          grafanaVersion: '10.0.0',
        },
      ]);

      const handler = registry.getHandler('discover_sensors')!;
      const result = await handler({ params: { arguments: {} } });

      expect(mockService.discoverSensors).toHaveBeenCalled();
      expect(result.content[0].text).toContain('Discovered 1 sensor(s)');
      expect(result.content[0].text).toContain('sensor-1');
      expect(result.content[0].text).toContain('port 3100');
    });

    it('should handle no sensors found', async () => {
      vi.mocked(mockService.discoverSensors).mockResolvedValue([]);

      const handler = registry.getHandler('discover_sensors')!;
      const result = await handler({ params: { arguments: {} } });

      expect(result.content[0].text).toContain('No sensor tunnels found');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.discoverSensors).mockRejectedValue(new Error('Network error'));
      const handler = registry.getHandler('discover_sensors')!;
      const result = await handler({ params: { arguments: {} } });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error discovering sensors');
    });
  });

  // ─── sensor_status ───────────────────────────────────────────────────

  describe('sensor_status', () => {
    it('should call getSensorStatus and format response', async () => {
      vi.mocked(mockService.getSensorStatus).mockResolvedValue({
        sensor: {
          hostname: 'sensor-1',
          port: 3100,
          grafanaUrl: 'http://localhost:3100',
          prometheusUid: 'prom-abc',
        },
        metrics: {
          gbps: 1.5,
          kpps: 200.3,
          klogps: 50.1,
          nicDropsPerSec: 0.0,
          zeekDropsPerSec: 0.0,
          suricataDropsPerSec: 0.0,
          maxWorkerCpu: 0.75,
          bufferUtilPct: 30.2,
          systemMemoryPct: 60.5,
          packetLag: 0.12,
          activeConnections: 5000,
        },
      });

      const handler = registry.getHandler('sensor_status')!;
      const result = await handler({
        params: { arguments: { sensor: 'sensor-1' } },
      });

      expect(mockService.getSensorStatus).toHaveBeenCalledWith('sensor-1');
      expect(result.content[0].text).toContain('Sensor: sensor-1');
      expect(result.content[0].text).toContain('1.50 Gbps');
      expect(result.content[0].text).toContain('200.3 kpps');
      expect(result.content[0].text).toContain('75.0%');
      expect(result.content[0].text).toContain('Suricata Drops');
      expect(result.content[0].text).toContain('Packet Lag');
      expect(result.content[0].text).toContain('Active Connections');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.getSensorStatus).mockRejectedValue(new Error('Sensor offline'));
      const handler = registry.getHandler('sensor_status')!;
      const result = await handler({
        params: { arguments: { sensor: 'sensor-1' } },
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error getting sensor status');
    });
  });

  // ─── query_sensor_metric ─────────────────────────────────────────────

  describe('query_sensor_metric', () => {
    it('should call querySensorMetric and format instant query response', async () => {
      vi.mocked(mockService.querySensorMetric).mockResolvedValue({
        sensor: {
          hostname: 'sensor-1',
          port: 3100,
          grafanaUrl: 'http://localhost:3100',
          prometheusUid: 'prom-abc',
        },
        result: {
          data: {
            resultType: 'vector',
            result: [
              {
                metric: { __name__: 'up' },
                value: [1704067200, '1'],
              },
            ],
          },
        },
      });

      const handler = registry.getHandler('query_sensor_metric')!;
      const result = await handler({
        params: {
          arguments: {
            query: 'up',
            instant: true,
          },
        },
      });

      expect(mockService.querySensorMetric).toHaveBeenCalled();
      expect(result.content[0].text).toContain('Query results on sensor-1');
      expect(result.content[0].text).toContain('up');
    });

    it('should handle empty results', async () => {
      vi.mocked(mockService.querySensorMetric).mockResolvedValue({
        sensor: {
          hostname: 'sensor-1',
          port: 3100,
          grafanaUrl: 'http://localhost:3100',
          prometheusUid: 'prom-abc',
        },
        result: {
          data: {
            resultType: 'vector',
            result: [],
          },
        },
      });

      const handler = registry.getHandler('query_sensor_metric')!;
      const result = await handler({
        params: {
          arguments: { query: 'nonexistent', instant: true },
        },
      });

      expect(result.content[0].text).toContain('No results');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.querySensorMetric).mockRejectedValue(new Error('Query failed'));
      const handler = registry.getHandler('query_sensor_metric')!;
      const result = await handler({
        params: {
          arguments: { query: 'up', sensor: 'sensor-1', instant: true },
        },
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Prometheus query failed on sensor-1');
    });
  });

  // ─── deploy_ramp_dashboard ───────────────────────────────────────────

  describe('deploy_ramp_dashboard', () => {
    it('should call deployRampDashboard and format response', async () => {
      vi.mocked(mockService.deployRampDashboard).mockResolvedValue({
        sensor: {
          hostname: 'sensor-1',
          port: 3100,
          grafanaUrl: 'http://localhost:3100',
          prometheusUid: 'prom-abc',
        },
        uid: 'ramp-dashboard-uid',
        url: 'http://localhost:3100/d/ramp-dashboard-uid',
      });

      const handler = registry.getHandler('deploy_ramp_dashboard')!;
      const result = await handler({
        params: { arguments: {} },
      });

      expect(mockService.deployRampDashboard).toHaveBeenCalled();
      expect(result.content[0].text).toContain('Dashboard deployed to sensor-1');
      expect(result.content[0].text).toContain('ramp-dashboard-uid');
    });

    it('should include baseline comparison info', async () => {
      vi.mocked(mockService.deployRampDashboard).mockResolvedValue({
        sensor: {
          hostname: 'sensor-1',
          port: 3100,
          grafanaUrl: 'http://localhost:3100',
          prometheusUid: 'prom-abc',
        },
        uid: 'ramp-uid',
        url: 'http://localhost:3100/d/ramp-uid',
      });

      const handler = registry.getHandler('deploy_ramp_dashboard')!;
      const result = await handler({
        params: {
          arguments: {
            compare: 'build-1.0',
            profile: 'All/No',
          },
        },
      });

      expect(result.content[0].text).toContain('build-1.0');
      expect(result.content[0].text).toContain('All/No');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.deployRampDashboard).mockRejectedValue(new Error('Deploy failed'));
      const handler = registry.getHandler('deploy_ramp_dashboard')!;
      const result = await handler({ params: { arguments: {} } });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error deploying dashboard');
    });
  });

  // ─── list_baselines ──────────────────────────────────────────────────

  describe('list_baselines', () => {
    it('should call listBaselines and format response', async () => {
      vi.mocked(mockService.listBaselines).mockReturnValue({
        builds: ['build-1.0', 'build-2.0'],
        sensorTypes: ['AP1100', 'AP3000'],
      });

      const handler = registry.getHandler('list_baselines')!;
      const result = await handler({ params: { arguments: {} } });

      expect(mockService.listBaselines).toHaveBeenCalledWith(undefined);
      expect(result.content[0].text).toContain('Available Baselines');
      expect(result.content[0].text).toContain('build-1.0');
      expect(result.content[0].text).toContain('AP1100');
    });

    it('should filter by sensor type', async () => {
      vi.mocked(mockService.listBaselines).mockReturnValue({
        builds: ['build-1.0'],
        sensorTypes: ['AP1100'],
      });

      const handler = registry.getHandler('list_baselines')!;
      const result = await handler({
        params: { arguments: { sensorType: 'AP1100' } },
      });

      expect(mockService.listBaselines).toHaveBeenCalledWith('AP1100');
      expect(result.content[0].text).toContain('for AP1100');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.listBaselines).mockImplementation(() => {
        throw new Error('File not found');
      });
      const handler = registry.getHandler('list_baselines')!;
      const result = await handler({ params: { arguments: {} } });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error listing baselines');
    });
  });

  // ─── sensor_performance_verdict ──────────────────────────────────────

  describe('sensor_performance_verdict', () => {
    it('should call getPerformanceVerdict and format PASS response', async () => {
      vi.mocked(mockService.getPerformanceVerdict).mockResolvedValue({
        level: 'PASS',
        sensor: 'sensor-1',
        build: 'build-1.0',
        profile: 'All/No',
        metrics: {
          gbps: 1.5,
          kpps: 200,
          klogps: 50,
          nicDropsPerSec: 0,
          zeekDropsPerSec: 0,
          suricataDropsPerSec: 0,
          maxWorkerCpu: 0.75,
          bufferUtilPct: 30,
          systemMemoryPct: 60,
          packetLag: 0,
          activeConnections: 0,
        },
        deltas: [
          { metric: 'gbps', actual: 1.5, baseline: 1.48, deltaPct: 1.35 },
          { metric: 'kpps', actual: 200, baseline: 198, deltaPct: 1.01 },
        ],
        summary: 'All metrics within acceptable thresholds.',
      });

      const handler = registry.getHandler('sensor_performance_verdict')!;
      const result = await handler({
        params: {
          arguments: {
            build: 'build-1.0',
            profile: 'All/No',
          },
        },
      });

      expect(mockService.getPerformanceVerdict).toHaveBeenCalled();
      expect(result.content[0].text).toContain('Verdict: PASS');
      expect(result.content[0].text).toContain('build-1.0');
      expect(result.content[0].text).toContain('All/No');
      expect(result.content[0].text).toContain('gbps');
    });

    it('should handle MAJOR REGRESSION verdict', async () => {
      vi.mocked(mockService.getPerformanceVerdict).mockResolvedValue({
        level: 'MAJOR REGRESSION',
        sensor: 'sensor-1',
        build: 'build-2.0',
        profile: 'All/No',
        metrics: {
          gbps: 1.2,
          kpps: 150,
          klogps: 40,
          nicDropsPerSec: 5,
          zeekDropsPerSec: 2,
          suricataDropsPerSec: 0,
          maxWorkerCpu: 0.95,
          bufferUtilPct: 80,
          systemMemoryPct: 90,
          packetLag: 0,
          activeConnections: 0,
        },
        deltas: [
          { metric: 'gbps', actual: 1.2, baseline: 1.5, deltaPct: -20.0 },
        ],
        summary: 'Major regression detected in throughput.',
      });

      const handler = registry.getHandler('sensor_performance_verdict')!;
      const result = await handler({
        params: {
          arguments: {
            build: 'build-2.0',
            profile: 'All/No',
          },
        },
      });

      expect(result.content[0].text).toContain('MAJOR REGRESSION (P1)');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.getPerformanceVerdict).mockRejectedValue(new Error('No baseline'));
      const handler = registry.getHandler('sensor_performance_verdict')!;
      const result = await handler({
        params: {
          arguments: { build: 'missing', profile: 'All/No' },
        },
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error computing verdict');
    });
  });

  // ─── annotate_test ───────────────────────────────────────────────────

  describe('annotate_test', () => {
    it('should call annotateTest and format response', async () => {
      vi.mocked(mockService.annotateTest).mockResolvedValue({
        id: 42,
      });

      const handler = registry.getHandler('annotate_test')!;
      const result = await handler({
        params: {
          arguments: {
            text: 'Test started at 10 Gbps',
            tags: ['ramp-test'],
          },
        },
      });

      expect(mockService.annotateTest).toHaveBeenCalled();
      expect(result.content[0].text).toContain('Annotation created');
      expect(result.content[0].text).toContain('id: 42');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.annotateTest).mockRejectedValue(new Error('Auth error'));
      const handler = registry.getHandler('annotate_test')!;
      const result = await handler({
        params: {
          arguments: { text: 'Test', tags: ['ramp-test'] },
        },
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error creating annotation');
    });
  });
});
