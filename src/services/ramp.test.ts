import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import type { SensorInfo, MetricSnapshot } from '../ramp-types.js';

// Mock child_process before importing RampService
vi.mock('child_process', () => ({
  execSync: vi.fn(() => ''),
}));

// Mock GrafanaHttpClient so we can control HTTP behavior
vi.mock('../http-client.js', () => ({
  GrafanaHttpClient: vi.fn().mockImplementation(() => ({
    get: vi.fn(),
    post: vi.fn(),
  })),
}));

import { RampService } from './ramp.js';
import { GrafanaHttpClient } from '../http-client.js';

const RAMP_PROJECT_PATH = '/Users/russellsmith/Projects/ramp';

// Helper: create a SensorInfo object
function makeSensorInfo(overrides?: Partial<SensorInfo>): SensorInfo {
  return {
    port: 8080,
    hostname: 'ap3000-test-132',
    grafanaUrl: 'http://localhost:8080/grafana',
    prometheusUid: 'prom-uid-1',
    grafanaVersion: '10.0.0',
    ...overrides,
  };
}

// Helper: create a mock GrafanaHttpClient
function makeMockClient() {
  return {
    get: vi.fn(),
    post: vi.fn(),
  };
}

// Helper: populate sensors and clients on a RampService instance
function populateSensors(
  svc: RampService,
  entries: Array<{ info: SensorInfo; client: ReturnType<typeof makeMockClient> }>,
) {
  const sensorsMap = (svc as any).sensors as Map<string, SensorInfo>;
  const clientsMap = (svc as any).clients as Map<string, any>;
  for (const { info, client } of entries) {
    sensorsMap.set(info.hostname, info);
    clientsMap.set(info.hostname, client);
  }
}

// Helper: build a standard PromQL instant query response
function promResponse(value: number | string) {
  return {
    data: {
      result: [{ value: [Date.now() / 1000, String(value)] }],
    },
  };
}

describe('RampService', () => {
  let service: RampService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    service = new RampService({ rampProjectPath: RAMP_PROJECT_PATH });
  });

  // ─── Existing tests ────────────────────────────────────────────────

  describe('constructor', () => {
    it('should accept custom options', () => {
      const svc = new RampService({
        rampProjectPath: '/custom/path',
        scanPorts: '9000-9010',
      });
      // Verify it was constructed without error
      expect(svc).toBeInstanceOf(RampService);
    });

    it('should use defaults when no options provided', () => {
      const svc = new RampService();
      expect(svc).toBeInstanceOf(RampService);
    });

    it('should throw for an invalid port range (start > end)', () => {
      expect(
        () => new RampService({ scanPorts: '9010-9000' }),
      ).toThrow(/Invalid port range/);
    });

    it('should throw for a non-numeric port range', () => {
      expect(
        () => new RampService({ scanPorts: 'abc-def' }),
      ).toThrow(/Invalid port range/);
    });

    it('should accept a custom sensorToken', () => {
      const svc = new RampService({ sensorToken: 'mytoken' });
      expect(svc).toBeInstanceOf(RampService);
    });
  });

  describe('sensorCount', () => {
    it('should start at 0', () => {
      expect(service.sensorCount).toBe(0);
    });
  });

  describe('getAllSensors', () => {
    it('should start empty', () => {
      expect(service.getAllSensors()).toEqual([]);
    });
  });

  describe('resolveSensor', () => {
    it('should throw when no sensors discovered', () => {
      expect(() => service.resolveSensor()).toThrow(
        /No sensor tunnels found on ports/,
      );
    });

    it('should throw with specific sensor name when no sensors discovered', () => {
      expect(() => service.resolveSensor('my-sensor')).toThrow(
        /No sensor tunnels found on ports/,
      );
    });

    it('should return first sensor when no name provided', () => {
      const client = makeMockClient();
      const info = makeSensorInfo();
      populateSensors(service, [{ info, client }]);

      const result = service.resolveSensor();
      expect(result.info).toEqual(info);
      expect(result.client).toBe(client);
    });

    it('should resolve sensor by exact name', () => {
      const client1 = makeMockClient();
      const client2 = makeMockClient();
      const info1 = makeSensorInfo({ hostname: 'sensor-a' });
      const info2 = makeSensorInfo({ hostname: 'sensor-b', port: 8081 });
      populateSensors(service, [
        { info: info1, client: client1 },
        { info: info2, client: client2 },
      ]);

      const result = service.resolveSensor('sensor-b');
      expect(result.info.hostname).toBe('sensor-b');
      expect(result.client).toBe(client2);
    });

    it('should resolve sensor by prefix match (case-insensitive)', () => {
      const client = makeMockClient();
      const info = makeSensorInfo({ hostname: 'ap3000-lab-132' });
      populateSensors(service, [{ info, client }]);

      const result = service.resolveSensor('AP3000');
      expect(result.info.hostname).toBe('ap3000-lab-132');
    });

    it('should throw when named sensor is not found', () => {
      const client = makeMockClient();
      const info = makeSensorInfo({ hostname: 'sensor-a' });
      populateSensors(service, [{ info, client }]);

      expect(() => service.resolveSensor('nonexistent')).toThrow(
        /Sensor "nonexistent" not found/,
      );
    });
  });

  describe('loadBaselines', () => {
    it('should succeed with real ramp project path', () => {
      const baselines = service.loadBaselines();
      expect(baselines).toBeDefined();
      expect(baselines.builds).toBeInstanceOf(Array);
      expect(baselines.builds.length).toBeGreaterThan(0);
      expect(baselines.data).toBeDefined();
      expect(typeof baselines.data).toBe('object');
    });

    it('should throw for bad path', () => {
      const badService = new RampService({
        rampProjectPath: '/nonexistent/path',
      });
      expect(() => badService.loadBaselines()).toThrow(
        /Baselines file not found/,
      );
    });
  });

  describe('detectSensorType (via private access)', () => {
    // Use a build that has multiple sensor types
    function getBuildDataWithTypes(...types: string[]) {
      const baselines = service.loadBaselines();
      for (const build of baselines.builds) {
        const bd = baselines.data[build];
        if (types.every((t) => t in bd)) return bd;
      }
      throw new Error(`No build found with all types: ${types}`);
    }

    it('should match hostname containing sensor type', () => {
      const buildData = getBuildDataWithTypes('AP3000', 'AP1001');
      const detect = (service as any).detectSensorType.bind(service);

      expect(detect('ap3000-8649-132', buildData)).toBe('AP3000');
      expect(detect('ap1001-xxxx-80', buildData)).toBe('AP1001');
    });

    it('should match sensor_192_168_X_Y hostname via IP lookup', () => {
      const buildData = getBuildDataWithTypes('AP3000');
      const detect = (service as any).detectSensorType.bind(service);

      // 192.168.21.132 = AP3000 in sensor-types.json
      expect(detect('sensor_192_168_21_132', buildData)).toBe('AP3000');
    });

    it('should match AP5000 by IP for sensor_192_168_21_227', () => {
      const buildData = getBuildDataWithTypes('AP5000');
      const detect = (service as any).detectSensorType.bind(service);

      expect(detect('sensor_192_168_21_227', buildData)).toBe('AP5000');
    });

    it('should return null for unknown hostname', () => {
      const buildData = getBuildDataWithTypes('AP5000');
      const detect = (service as any).detectSensorType.bind(service);

      expect(detect('totally-unknown-host', buildData)).toBeNull();
    });

    it('should return null for unknown IP in sensor hostname pattern', () => {
      const buildData = getBuildDataWithTypes('AP5000');
      const detect = (service as any).detectSensorType.bind(service);

      expect(detect('sensor_10_0_0_99', buildData)).toBeNull();
    });
  });

  describe('listBaselines', () => {
    it('should return builds and sensor types from baselines.json', () => {
      const result = service.listBaselines();
      expect(result.builds).toBeInstanceOf(Array);
      expect(result.builds.length).toBeGreaterThan(0);
      expect(result.sensorTypes).toBeInstanceOf(Array);
      expect(result.sensorTypes.length).toBeGreaterThan(0);

      // Verify known sensor types exist
      expect(result.sensorTypes).toContain('AP1001');
      expect(result.sensorTypes).toContain('AP1100');
      expect(result.sensorTypes).toContain('AP200');

      // Verify sensor types are sorted
      const sorted = [...result.sensorTypes].sort();
      expect(result.sensorTypes).toEqual(sorted);
    });

    it('should filter by sensor type when provided', () => {
      const result = service.listBaselines('AP1100');
      expect(result.builds).toBeInstanceOf(Array);
      expect(result.builds.length).toBeGreaterThan(0);
      expect(result.sensorTypes).toEqual(['AP1100']);

      // Every returned build should contain AP1100 data
      const baselines = service.loadBaselines();
      for (const build of result.builds) {
        const buildData = baselines.data[build];
        expect(buildData).toBeDefined();
        const hasAP1100 = Object.keys(buildData).some(
          (st) => st.toUpperCase() === 'AP1100',
        );
        expect(hasAP1100).toBe(true);
      }
    });

    it('should return empty builds for nonexistent sensor type', () => {
      const result = service.listBaselines('NONEXISTENT');
      expect(result.builds).toEqual([]);
      expect(result.sensorTypes).toEqual(['NONEXISTENT']);
    });
  });

  // ─── New tests for untested methods ────────────────────────────────

  describe('discoverSensors', () => {
    it('should return empty array when no SSH tunnels found', async () => {
      (execSync as Mock).mockReturnValue('');
      const result = await service.discoverSensors();
      expect(result).toEqual([]);
      expect(service.sensorCount).toBe(0);
    });

    it('should return empty array when execSync throws (no lsof)', async () => {
      (execSync as Mock).mockImplementation(() => {
        throw new Error('lsof not found');
      });
      const result = await service.discoverSensors();
      expect(result).toEqual([]);
    });

    it('should discover sensors from SSH tunnel ports', async () => {
      // lsof output that includes an SSH listener on port 8080
      const lsofOutput = [
        'ssh     12345 user   10u  IPv4 0x1234  0t0  TCP localhost:8080 (LISTEN)',
        'ssh     12345 user   11u  IPv4 0x1235  0t0  TCP localhost:8081 (LISTEN)',
        'node    99999 user    5u  IPv4 0x9999  0t0  TCP *:3000 (LISTEN)',
      ].join('\n');

      (execSync as Mock).mockReturnValue(lsofOutput);

      // Mock GrafanaHttpClient instances created during probe
      const mockGet = vi.fn();
      // Health check response
      mockGet.mockResolvedValueOnce({ version: '10.0.0' });
      // Datasources response
      mockGet.mockResolvedValueOnce([
        { uid: 'prom-abc', type: 'prometheus' },
        { uid: 'loki-xyz', type: 'loki' },
      ]);
      // PromQL hostname query
      mockGet.mockResolvedValueOnce({
        data: { result: [{ metric: { nodename: 'ap3000-lab-132' } }] },
      });

      // Health check for second port (8081)
      mockGet.mockResolvedValueOnce({ version: '10.1.0' });
      // Datasources for second port
      mockGet.mockResolvedValueOnce([{ uid: 'prom-def', type: 'prometheus' }]);
      // PromQL hostname query for second port
      mockGet.mockResolvedValueOnce({
        data: { result: [{ metric: { nodename: 'ap1100-lab-99' } }] },
      });

      (GrafanaHttpClient as unknown as Mock).mockImplementation(() => ({
        get: mockGet,
        post: vi.fn(),
      }));

      const result = await service.discoverSensors();
      expect(result).toHaveLength(2);
      expect(result[0].hostname).toBe('ap3000-lab-132');
      expect(result[0].port).toBe(8080);
      expect(result[0].prometheusUid).toBe('prom-abc');
      expect(result[0].grafanaVersion).toBe('10.0.0');
      expect(result[1].hostname).toBe('ap1100-lab-99');
      expect(result[1].port).toBe(8081);
      expect(service.sensorCount).toBe(2);
      expect(service.getAllSensors()).toHaveLength(2);
    });

    it('should filter ports outside the scan range', async () => {
      // Port 9999 is outside default range 8080-8099
      const lsofOutput = 'ssh  12345 user  10u  IPv4 0x1234  0t0  TCP localhost:9999 (LISTEN)\n';
      (execSync as Mock).mockReturnValue(lsofOutput);

      const result = await service.discoverSensors();
      expect(result).toEqual([]);
    });

    it('should use fallback hostname when PromQL query fails', async () => {
      const lsofOutput = 'ssh  12345 user  10u  IPv4 0x1234  0t0  TCP localhost:8080 (LISTEN)\n';
      (execSync as Mock).mockReturnValue(lsofOutput);

      const mockGet = vi.fn();
      mockGet.mockResolvedValueOnce({ version: '10.0.0' }); // health
      mockGet.mockResolvedValueOnce([{ uid: 'prom-1', type: 'prometheus' }]); // datasources
      mockGet.mockRejectedValueOnce(new Error('query failed')); // hostname query fails

      (GrafanaHttpClient as unknown as Mock).mockImplementation(() => ({
        get: mockGet,
        post: vi.fn(),
      }));

      const result = await service.discoverSensors();
      expect(result).toHaveLength(1);
      expect(result[0].hostname).toBe('sensor-8080'); // fallback
    });

    it('should use default prometheus UID when no prometheus datasource found', async () => {
      const lsofOutput = 'ssh  12345 user  10u  IPv4 0x1234  0t0  TCP localhost:8080 (LISTEN)\n';
      (execSync as Mock).mockReturnValue(lsofOutput);

      const mockGet = vi.fn();
      mockGet.mockResolvedValueOnce({ version: '10.0.0' }); // health
      mockGet.mockResolvedValueOnce([{ uid: 'loki-1', type: 'loki' }]); // datasources — no prometheus
      mockGet.mockResolvedValueOnce({ data: { result: [{ metric: { nodename: 'test-sensor' } }] } }); // hostname

      (GrafanaHttpClient as unknown as Mock).mockImplementation(() => ({
        get: mockGet,
        post: vi.fn(),
      }));

      const result = await service.discoverSensors();
      expect(result).toHaveLength(1);
      expect(result[0].prometheusUid).toBe('prometheus'); // default
    });

    it('should skip ports where probe fails', async () => {
      const lsofOutput = [
        'ssh  12345 user  10u  IPv4 0x1234  0t0  TCP localhost:8080 (LISTEN)',
        'ssh  12345 user  11u  IPv4 0x1235  0t0  TCP localhost:8081 (LISTEN)',
      ].join('\n');
      (execSync as Mock).mockReturnValue(lsofOutput);

      let callCount = 0;
      const mockGetFail = vi.fn().mockRejectedValue(new Error('connection refused'));
      const mockGetOk = vi.fn();
      mockGetOk.mockResolvedValueOnce({ version: '10.0.0' }); // health
      mockGetOk.mockResolvedValueOnce([{ uid: 'prom-1', type: 'prometheus' }]); // ds
      mockGetOk.mockResolvedValueOnce({ data: { result: [{ metric: { nodename: 'good-sensor' } }] } }); // hostname

      (GrafanaHttpClient as unknown as Mock).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First probe (port 8080) fails
          return { get: mockGetFail, post: vi.fn() };
        }
        // Second probe (port 8081) succeeds
        return { get: mockGetOk, post: vi.fn() };
      });

      const result = await service.discoverSensors();
      expect(result).toHaveLength(1);
      expect(result[0].hostname).toBe('good-sensor');
    });

    it('should deduplicate ports from lsof output', async () => {
      // Same port appears twice in lsof output
      const lsofOutput = [
        'ssh  12345 user  10u  IPv4 0x1234  0t0  TCP localhost:8080 (LISTEN)',
        'ssh  12345 user  10u  IPv6 0x1236  0t0  TCP localhost:8080 (LISTEN)',
      ].join('\n');
      (execSync as Mock).mockReturnValue(lsofOutput);

      const mockGet = vi.fn();
      mockGet.mockResolvedValueOnce({ version: '10.0.0' }); // health
      mockGet.mockResolvedValueOnce([{ uid: 'prom-1', type: 'prometheus' }]); // ds
      mockGet.mockResolvedValueOnce({ data: { result: [{ metric: { nodename: 'dedup-sensor' } }] } }); // hostname

      (GrafanaHttpClient as unknown as Mock).mockImplementation(() => ({
        get: mockGet,
        post: vi.fn(),
      }));

      const result = await service.discoverSensors();
      // Should only probe port 8080 once
      expect(result).toHaveLength(1);
      expect(result[0].hostname).toBe('dedup-sensor');
    });
  });

  describe('getSensorStatus', () => {
    it('should return metric snapshot for a sensor', async () => {
      const client = makeMockClient();
      const info = makeSensorInfo();
      populateSensors(service, [{ info, client }]);

      // Mock each metric query to return a value
      client.get.mockImplementation(async (_url: string, params?: any) => {
        const query = params?.query ?? '';
        if (query.includes('port_bytes')) return promResponse(2.5); // gbps
        if (query.includes('port_packets')) return promResponse(1200); // kpps
        if (query.includes('log_writer_writes')) return promResponse(500); // klogps
        if (query.includes('drop_overflow') && query.includes('napatech_stat')) return promResponse(0); // nicDrops
        if (query.includes('pkts_dropped')) return promResponse(0); // zeekDrops
        if (query.includes('suricata_napatech')) return promResponse(0); // suricataDrops
        if (query.includes('zeek-worker')) return promResponse(0.85); // maxWorkerCpu
        if (query.includes('host_buffer')) return promResponse(12.3); // bufferUtilPct
        if (query.includes('MemAvailable')) return promResponse(65.2); // systemMemoryPct
        if (query.includes('packet_lag')) return promResponse(0.5); // packetLag
        if (query.includes('active_connections')) return promResponse(15000); // activeConnections
        return promResponse(0);
      });

      const result = await service.getSensorStatus();
      expect(result.sensor).toEqual(info);
      expect(result.metrics.gbps).toBe(2.5);
      expect(result.metrics.kpps).toBe(1200);
      expect(result.metrics.klogps).toBe(500);
      expect(result.metrics.nicDropsPerSec).toBe(0);
      expect(result.metrics.zeekDropsPerSec).toBe(0);
      expect(result.metrics.suricataDropsPerSec).toBe(0);
      expect(result.metrics.maxWorkerCpu).toBe(0.85);
      expect(result.metrics.bufferUtilPct).toBe(12.3);
      expect(result.metrics.systemMemoryPct).toBe(65.2);
      expect(result.metrics.packetLag).toBe(0.5);
      expect(result.metrics.activeConnections).toBe(15000);
    });

    it('should default metrics to 0 when queries fail', async () => {
      const client = makeMockClient();
      const info = makeSensorInfo();
      populateSensors(service, [{ info, client }]);

      // All queries fail
      client.get.mockRejectedValue(new Error('prometheus unavailable'));

      const result = await service.getSensorStatus();
      expect(result.metrics.gbps).toBe(0);
      expect(result.metrics.kpps).toBe(0);
      expect(result.metrics.klogps).toBe(0);
      expect(result.metrics.nicDropsPerSec).toBe(0);
      expect(result.metrics.zeekDropsPerSec).toBe(0);
      expect(result.metrics.suricataDropsPerSec).toBe(0);
      expect(result.metrics.maxWorkerCpu).toBe(0);
      expect(result.metrics.bufferUtilPct).toBe(0);
      expect(result.metrics.systemMemoryPct).toBe(0);
      expect(result.metrics.packetLag).toBe(0);
      expect(result.metrics.activeConnections).toBe(0);
    });

    it('should default metrics to 0 when result has no value', async () => {
      const client = makeMockClient();
      const info = makeSensorInfo();
      populateSensors(service, [{ info, client }]);

      // Return empty result set
      client.get.mockResolvedValue({ data: { result: [] } });

      const result = await service.getSensorStatus();
      expect(result.metrics.gbps).toBe(0);
      expect(result.metrics.kpps).toBe(0);
    });

    it('should resolve a specific sensor by name', async () => {
      const client1 = makeMockClient();
      const client2 = makeMockClient();
      const info1 = makeSensorInfo({ hostname: 'sensor-a' });
      const info2 = makeSensorInfo({ hostname: 'sensor-b', port: 8081 });
      populateSensors(service, [
        { info: info1, client: client1 },
        { info: info2, client: client2 },
      ]);

      client2.get.mockResolvedValue(promResponse(5.0));

      const result = await service.getSensorStatus('sensor-b');
      expect(result.sensor.hostname).toBe('sensor-b');
      // Only client2 should have been queried
      expect(client2.get).toHaveBeenCalled();
      expect(client1.get).not.toHaveBeenCalled();
    });

    it('should throw when no sensors are available', async () => {
      await expect(service.getSensorStatus()).rejects.toThrow(
        /No sensor tunnels found/,
      );
    });
  });

  describe('querySensorMetric', () => {
    it('should run an instant query by default', async () => {
      const client = makeMockClient();
      const info = makeSensorInfo();
      populateSensors(service, [{ info, client }]);

      const mockResult = { data: { resultType: 'vector', result: [{ value: [1234, '42'] }] } };
      client.get.mockResolvedValue(mockResult);

      const result = await service.querySensorMetric({ query: 'up' });
      expect(result.sensor).toEqual(info);
      expect(result.result).toEqual(mockResult);

      // Should call the instant query endpoint
      expect(client.get).toHaveBeenCalledWith(
        `/api/datasources/proxy/uid/${info.prometheusUid}/api/v1/query`,
        { query: 'up' },
      );
    });

    it('should run a range query when instant is false', async () => {
      const client = makeMockClient();
      const info = makeSensorInfo();
      populateSensors(service, [{ info, client }]);

      const mockResult = { data: { resultType: 'matrix', result: [] } };
      client.get.mockResolvedValue(mockResult);

      const result = await service.querySensorMetric({
        query: 'rate(up[5m])',
        instant: false,
        start: '2024-01-01T00:00:00Z',
        end: '2024-01-01T01:00:00Z',
        step: '30s',
      });

      expect(result.result).toEqual(mockResult);
      expect(client.get).toHaveBeenCalledWith(
        `/api/datasources/proxy/uid/${info.prometheusUid}/api/v1/query_range`,
        {
          query: 'rate(up[5m])',
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-01T01:00:00Z',
          step: '30s',
        },
      );
    });

    it('should use default step of 15s for range queries', async () => {
      const client = makeMockClient();
      const info = makeSensorInfo();
      populateSensors(service, [{ info, client }]);

      client.get.mockResolvedValue({ data: {} });

      await service.querySensorMetric({
        query: 'rate(up[5m])',
        instant: false,
        start: '2024-01-01T00:00:00Z',
        end: '2024-01-01T01:00:00Z',
        // no step provided
      });

      expect(client.get).toHaveBeenCalledWith(
        expect.stringContaining('query_range'),
        expect.objectContaining({ step: '15s' }),
      );
    });

    it('should throw when range query is missing start/end', async () => {
      const client = makeMockClient();
      const info = makeSensorInfo();
      populateSensors(service, [{ info, client }]);

      await expect(
        service.querySensorMetric({
          query: 'up',
          instant: false,
          // missing start and end
        }),
      ).rejects.toThrow(/start and end are required/);
    });

    it('should resolve a specific sensor for the query', async () => {
      const client1 = makeMockClient();
      const client2 = makeMockClient();
      const info1 = makeSensorInfo({ hostname: 'sensor-a', prometheusUid: 'prom-a' });
      const info2 = makeSensorInfo({ hostname: 'sensor-b', port: 8081, prometheusUid: 'prom-b' });
      populateSensors(service, [
        { info: info1, client: client1 },
        { info: info2, client: client2 },
      ]);

      client2.get.mockResolvedValue({ data: {} });

      const result = await service.querySensorMetric({ sensor: 'sensor-b', query: 'up' });
      expect(result.sensor.hostname).toBe('sensor-b');
      expect(client2.get).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/prom-b/api/v1/query',
        { query: 'up' },
      );
    });

    it('should throw when no sensors available', async () => {
      await expect(
        service.querySensorMetric({ query: 'up' }),
      ).rejects.toThrow(/No sensor tunnels found/);
    });
  });

  describe('deployRampDashboard', () => {
    it('should deploy a dashboard to a sensor', async () => {
      const client = makeMockClient();
      const info = makeSensorInfo();
      populateSensors(service, [{ info, client }]);

      const dashboardJson = {
        title: 'RAMP Dashboard',
        templating: {
          list: [
            { name: 'datasource', type: 'datasource', current: {} },
            { name: 'other', type: 'custom', current: {} },
          ],
        },
        panels: [],
        id: 123,
      };

      const existsSyncSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      const readFileSyncSpy = vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify(dashboardJson),
      );

      client.post.mockResolvedValue({
        uid: 'ramp-uid-1',
        url: '/d/ramp-uid-1/ramp-dashboard',
        status: 'success',
      });

      const result = await service.deployRampDashboard({});
      expect(result.sensor).toEqual(info);
      expect(result.uid).toBe('ramp-uid-1');
      expect(result.url).toBe('http://localhost:8080/grafana/d/ramp-uid-1/ramp-dashboard');

      // Verify dashboard was posted with overwrite
      expect(client.post).toHaveBeenCalledWith('/api/dashboards/db', {
        dashboard: expect.objectContaining({
          title: 'RAMP Dashboard',
        }),
        overwrite: true,
        message: 'RAMP dashboard deployed',
      });

      // Verify id was removed
      const postedDashboard = client.post.mock.calls[0][1].dashboard;
      expect(postedDashboard.id).toBeUndefined();

      // Verify datasource variable was patched
      const dsVar = postedDashboard.templating.list.find(
        (v: any) => v.name === 'datasource',
      );
      expect(dsVar.current.value).toBe(info.prometheusUid);

      existsSyncSpy.mockRestore();
      readFileSyncSpy.mockRestore();
    });

    it('should throw when dashboard file does not exist', async () => {
      const client = makeMockClient();
      const info = makeSensorInfo();
      populateSensors(service, [{ info, client }]);

      const existsSyncSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      await expect(service.deployRampDashboard({})).rejects.toThrow(
        /Dashboard file not found/,
      );

      existsSyncSpy.mockRestore();
    });

    it('should throw when no sensors available', async () => {
      await expect(service.deployRampDashboard({})).rejects.toThrow(
        /No sensor tunnels found/,
      );
    });

    it('should require profile when compare is set', async () => {
      const client = makeMockClient();
      const info = makeSensorInfo();
      populateSensors(service, [{ info, client }]);

      const dashboardJson = {
        title: 'RAMP Dashboard',
        panels: [],
      };

      const existsSyncSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      const readFileSyncSpy = vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify(dashboardJson),
      );

      await expect(
        service.deployRampDashboard({ compare: 'build-1' }),
      ).rejects.toThrow(/Profile is required when comparing/);

      existsSyncSpy.mockRestore();
      readFileSyncSpy.mockRestore();
    });

    it('should include baseline comparison when compare and profile are set', async () => {
      const client = makeMockClient();
      // Use a hostname that contains a known sensor type for detectSensorType
      const info = makeSensorInfo({ hostname: 'ap3000-test-132' });
      populateSensors(service, [{ info, client }]);

      // Find a build that has AP3000 data
      const baselines = service.loadBaselines();
      let buildName: string | undefined;
      let profile: string | undefined;
      for (const build of baselines.builds) {
        const bd = baselines.data[build];
        if (bd['AP3000']) {
          buildName = build;
          profile = Object.keys(bd['AP3000'])[0];
          break;
        }
      }

      expect(buildName).toBeDefined();
      expect(profile).toBeDefined();

      const dashboardJson = {
        title: 'RAMP Dashboard',
        templating: {
          list: [{ name: 'datasource', type: 'datasource', current: {} }],
        },
        panels: [{ id: 1, gridPos: { x: 0, y: 0, w: 24, h: 8 } }],
        id: 100,
      };

      // Use a targeted mock: only mock for dashboard path, pass through others
      const origExistsSync = fs.existsSync;
      const origReadFileSync = fs.readFileSync;

      const existsSpy = vi.spyOn(fs, 'existsSync').mockImplementation((p: any) => {
        if (typeof p === 'string' && p.includes('ramp-performance-analysis.json')) {
          return true;
        }
        return origExistsSync(p);
      });

      const readSpy = vi.spyOn(fs, 'readFileSync').mockImplementation(
        (p: any, opts?: any) => {
          if (typeof p === 'string' && p.includes('ramp-performance-analysis.json')) {
            return JSON.stringify(dashboardJson);
          }
          return origReadFileSync(p, opts);
        },
      );

      client.post.mockResolvedValue({
        uid: 'ramp-uid-2',
        url: '/d/ramp-uid-2/ramp-dashboard',
        status: 'success',
      });

      const result = await service.deployRampDashboard({
        compare: buildName,
        profile,
      });

      expect(result.uid).toBe('ramp-uid-2');

      // The dashboard should have been POSTed with comparison info in the message
      expect(client.post).toHaveBeenCalledWith(
        '/api/dashboards/db',
        expect.objectContaining({
          message: expect.stringContaining(buildName!),
        }),
      );

      // The posted dashboard should include comparison panels
      const postedDashboard = client.post.mock.calls[0][1].dashboard;
      // Original panel should have been shifted down
      const originalPanel = postedDashboard.panels.find((p: any) => p.id === 1);
      expect(originalPanel.gridPos.y).toBeGreaterThan(0);
      // Should have new comparison panels added at top
      const comparisonPanels = postedDashboard.panels.filter((p: any) => p.id >= 900);
      expect(comparisonPanels.length).toBeGreaterThan(0);
      // Should have text panel + 3 stat panels + 1 drops panel = 5
      expect(comparisonPanels.length).toBe(5);

      existsSpy.mockRestore();
      readSpy.mockRestore();
    });
  });

  describe('getPerformanceVerdict', () => {
    // Helper: find a build that has a specific sensor type
    function findBuildWithType(sensorType: string) {
      const baselines = service.loadBaselines();
      for (const build of baselines.builds) {
        const bd = baselines.data[build];
        if (bd[sensorType]) {
          const profiles = Object.keys(bd[sensorType]);
          return { buildName: build, profile: profiles[0], baseline: bd[sensorType][profiles[0]] };
        }
      }
      return null;
    }

    // Helper to set up metrics mock
    function setupMetricsMock(
      client: ReturnType<typeof makeMockClient>,
      metrics: Partial<MetricSnapshot>,
    ) {
      const defaults: MetricSnapshot = {
        gbps: 10.0,
        kpps: 5000,
        klogps: 2000,
        nicDropsPerSec: 0,
        zeekDropsPerSec: 0,
        suricataDropsPerSec: 0,
        maxWorkerCpu: 0.5,
        bufferUtilPct: 10,
        systemMemoryPct: 60,
        packetLag: 0,
        activeConnections: 0,
        ...metrics,
      };

      client.get.mockImplementation(async (_url: string, params?: any) => {
        const query = params?.query ?? '';
        if (query.includes('port_bytes')) return promResponse(defaults.gbps);
        if (query.includes('port_packets')) return promResponse(defaults.kpps);
        if (query.includes('log_writer_writes')) return promResponse(defaults.klogps);
        if (query.includes('drop_overflow') && query.includes('napatech_stat')) return promResponse(defaults.nicDropsPerSec);
        if (query.includes('pkts_dropped')) return promResponse(defaults.zeekDropsPerSec);
        if (query.includes('suricata_napatech')) return promResponse(defaults.suricataDropsPerSec);
        if (query.includes('zeek-worker')) return promResponse(defaults.maxWorkerCpu);
        if (query.includes('host_buffer')) return promResponse(defaults.bufferUtilPct);
        if (query.includes('MemAvailable')) return promResponse(defaults.systemMemoryPct);
        if (query.includes('packet_lag')) return promResponse(defaults.packetLag);
        if (query.includes('active_connections')) return promResponse(defaults.activeConnections);
        return promResponse(0);
      });
    }

    it('should return PASS when metrics are at or above baseline', async () => {
      const found = findBuildWithType('AP3000');
      expect(found).not.toBeNull();
      const { buildName, profile, baseline } = found!;

      const client = makeMockClient();
      const info = makeSensorInfo({ hostname: 'ap3000-test-132' });
      populateSensors(service, [{ info, client }]);

      // Set live metrics to match or exceed baseline
      setupMetricsMock(client, {
        gbps: baseline.gbps * 1.01,   // 1% above
        kpps: baseline.kpps * 1.0,    // exactly at baseline
        klogps: baseline.klps * 1.02, // 2% above
        nicDropsPerSec: 0,
        zeekDropsPerSec: 0,
      });

      const verdict = await service.getPerformanceVerdict({
        build: buildName,
        profile,
      });

      expect(verdict.level).toBe('PASS');
      expect(verdict.sensor).toBe('ap3000-test-132');
      expect(verdict.build).toBe(buildName);
      expect(verdict.profile).toBe(profile);
      expect(verdict.summary).toContain('within 5%');
      expect(verdict.deltas).toHaveLength(3);
    });

    it('should return FAIL when NIC drops are detected', async () => {
      const found = findBuildWithType('AP3000');
      expect(found).not.toBeNull();
      const { buildName, profile, baseline } = found!;

      const client = makeMockClient();
      const info = makeSensorInfo({ hostname: 'ap3000-test-132' });
      populateSensors(service, [{ info, client }]);

      setupMetricsMock(client, {
        gbps: baseline.gbps,
        kpps: baseline.kpps,
        klogps: baseline.klps,
        nicDropsPerSec: 50.5, // drops!
        zeekDropsPerSec: 0,
      });

      const verdict = await service.getPerformanceVerdict({
        build: buildName,
        profile,
      });

      expect(verdict.level).toBe('FAIL');
      expect(verdict.summary).toContain('Drops detected');
      expect(verdict.summary).toContain('NIC drops');
    });

    it('should return FAIL when zeek drops are detected', async () => {
      const found = findBuildWithType('AP3000');
      expect(found).not.toBeNull();
      const { buildName, profile, baseline } = found!;

      const client = makeMockClient();
      const info = makeSensorInfo({ hostname: 'ap3000-test-132' });
      populateSensors(service, [{ info, client }]);

      setupMetricsMock(client, {
        gbps: baseline.gbps,
        kpps: baseline.kpps,
        klogps: baseline.klps,
        nicDropsPerSec: 0,
        zeekDropsPerSec: 10.0, // zeek drops!
      });

      const verdict = await service.getPerformanceVerdict({
        build: buildName,
        profile,
      });

      expect(verdict.level).toBe('FAIL');
      expect(verdict.summary).toContain('Drops detected');
    });

    it('should return MAJOR REGRESSION when metrics are >10% below baseline', async () => {
      const found = findBuildWithType('AP3000');
      expect(found).not.toBeNull();
      const { buildName, profile, baseline } = found!;

      const client = makeMockClient();
      const info = makeSensorInfo({ hostname: 'ap3000-test-132' });
      populateSensors(service, [{ info, client }]);

      // Set Gbps to 15% below baseline
      setupMetricsMock(client, {
        gbps: baseline.gbps * 0.85,    // 15% below
        kpps: baseline.kpps * 1.0,     // at baseline
        klogps: baseline.klps * 1.0,   // at baseline
        nicDropsPerSec: 0,
        zeekDropsPerSec: 0,
      });

      const verdict = await service.getPerformanceVerdict({
        build: buildName,
        profile,
      });

      expect(verdict.level).toBe('MAJOR REGRESSION');
      expect(verdict.summary).toContain('below baseline');
      expect(verdict.summary).toContain('P1');
    });

    it('should return MINOR REGRESSION when metrics are 5-10% below baseline', async () => {
      const found = findBuildWithType('AP3000');
      expect(found).not.toBeNull();
      const { buildName, profile, baseline } = found!;

      const client = makeMockClient();
      const info = makeSensorInfo({ hostname: 'ap3000-test-132' });
      populateSensors(service, [{ info, client }]);

      // Set Gbps to 7% below baseline
      setupMetricsMock(client, {
        gbps: baseline.gbps * 0.93,    // 7% below
        kpps: baseline.kpps * 1.0,     // at baseline
        klogps: baseline.klps * 1.0,   // at baseline
        nicDropsPerSec: 0,
        zeekDropsPerSec: 0,
      });

      const verdict = await service.getPerformanceVerdict({
        build: buildName,
        profile,
      });

      expect(verdict.level).toBe('MINOR REGRESSION');
      expect(verdict.summary).toContain('below baseline');
      expect(verdict.summary).toContain('P2');
    });

    it('should throw when build is not found in baselines', async () => {
      const client = makeMockClient();
      const info = makeSensorInfo({ hostname: 'ap3000-test-132' });
      populateSensors(service, [{ info, client }]);

      setupMetricsMock(client, {});

      await expect(
        service.getPerformanceVerdict({
          build: 'nonexistent-build',
          profile: 'some-profile',
        }),
      ).rejects.toThrow(/Build "nonexistent-build" not found/);
    });

    it('should throw when sensor type cannot be detected from hostname', async () => {
      const client = makeMockClient();
      const info = makeSensorInfo({ hostname: 'unknown-sensor-xyz' });
      populateSensors(service, [{ info, client }]);

      const baselines = service.loadBaselines();
      const buildName = baselines.builds[0];

      setupMetricsMock(client, {});

      await expect(
        service.getPerformanceVerdict({
          build: buildName,
          profile: 'some-profile',
        }),
      ).rejects.toThrow(/Could not match sensor/);
    });

    it('should throw when profile is not found for sensor type', async () => {
      const found = findBuildWithType('AP3000');
      expect(found).not.toBeNull();
      const { buildName } = found!;

      const client = makeMockClient();
      const info = makeSensorInfo({ hostname: 'ap3000-test-132' });
      populateSensors(service, [{ info, client }]);

      setupMetricsMock(client, {});

      await expect(
        service.getPerformanceVerdict({
          build: buildName,
          profile: 'NonexistentProfile/No',
        }),
      ).rejects.toThrow(/Profile "NonexistentProfile\/No" not found/);
    });

    it('should calculate correct delta percentages', async () => {
      const found = findBuildWithType('AP3000');
      expect(found).not.toBeNull();
      const { buildName, profile, baseline } = found!;

      const client = makeMockClient();
      const info = makeSensorInfo({ hostname: 'ap3000-test-132' });
      populateSensors(service, [{ info, client }]);

      // Exactly at baseline — deltas should be ~0%
      setupMetricsMock(client, {
        gbps: baseline.gbps,
        kpps: baseline.kpps,
        klogps: baseline.klps,
        nicDropsPerSec: 0,
        zeekDropsPerSec: 0,
      });

      const verdict = await service.getPerformanceVerdict({
        build: buildName,
        profile,
      });

      // All deltas should be very close to 0
      for (const delta of verdict.deltas) {
        expect(Math.abs(delta.deltaPct)).toBeLessThan(0.1);
      }
    });
  });

  describe('annotateTest', () => {
    it('should create an annotation on a sensor', async () => {
      const client = makeMockClient();
      const info = makeSensorInfo();
      populateSensors(service, [{ info, client }]);

      client.post.mockResolvedValue({ id: 42 });

      const result = await service.annotateTest({ text: 'Test started at 10 Gbps' });
      expect(result.id).toBe(42);
      expect(result.sensor).toEqual(info);

      // Verify correct API call
      expect(client.post).toHaveBeenCalledWith('/api/annotations', {
        text: 'Test started at 10 Gbps',
        tags: ['ramp-result'],
        time: expect.any(Number),
      });
    });

    it('should use custom tags when provided', async () => {
      const client = makeMockClient();
      const info = makeSensorInfo();
      populateSensors(service, [{ info, client }]);

      client.post.mockResolvedValue({ id: 43 });

      await service.annotateTest({
        text: 'Custom annotation',
        tags: ['custom-tag', 'another-tag'],
      });

      expect(client.post).toHaveBeenCalledWith('/api/annotations', {
        text: 'Custom annotation',
        tags: ['custom-tag', 'another-tag'],
        time: expect.any(Number),
      });
    });

    it('should annotate a specific sensor', async () => {
      const client1 = makeMockClient();
      const client2 = makeMockClient();
      const info1 = makeSensorInfo({ hostname: 'sensor-a' });
      const info2 = makeSensorInfo({ hostname: 'sensor-b', port: 8081 });
      populateSensors(service, [
        { info: info1, client: client1 },
        { info: info2, client: client2 },
      ]);

      client2.post.mockResolvedValue({ id: 44 });

      const result = await service.annotateTest({
        sensor: 'sensor-b',
        text: 'Annotation on sensor B',
      });

      expect(result.sensor.hostname).toBe('sensor-b');
      expect(client2.post).toHaveBeenCalled();
      expect(client1.post).not.toHaveBeenCalled();
    });

    it('should throw when no sensors are available', async () => {
      await expect(
        service.annotateTest({ text: 'test' }),
      ).rejects.toThrow(/No sensor tunnels found/);
    });

    it('should propagate errors from the API', async () => {
      const client = makeMockClient();
      const info = makeSensorInfo();
      populateSensors(service, [{ info, client }]);

      client.post.mockRejectedValue(new Error('API Error: 403 Forbidden'));

      await expect(
        service.annotateTest({ text: 'test' }),
      ).rejects.toThrow(/403 Forbidden/);
    });
  });

  describe('getSensorTrend', () => {
    it('should return trend entries for AP3000 NS2/Yes', () => {
      const trend = service.getSensorTrend('AP3000', 'NS2/Yes');
      expect(trend.length).toBeGreaterThan(0);
      for (const entry of trend) {
        expect(entry.build).toBeDefined();
        expect(typeof entry.gbps).toBe('number');
        expect(typeof entry.kpps === 'number' || entry.kpps === null).toBe(true);
      }
    });

    it('should return empty for nonexistent sensor type', () => {
      expect(service.getSensorTrend('NONEXISTENT', 'NS2/Yes')).toEqual([]);
    });

    it('should return empty for nonexistent profile', () => {
      expect(service.getSensorTrend('AP3000', 'NONEXISTENT')).toEqual([]);
    });
  });

  describe('getFleetVerdict', () => {
    it('should throw when no sensors are discovered', async () => {
      await expect(
        service.getFleetVerdict('some-build', 'some-profile'),
      ).rejects.toThrow(/No sensors discovered/);
    });

    it('should return verdicts for all discovered sensors', async () => {
      const client1 = makeMockClient();
      const client2 = makeMockClient();
      const info1 = makeSensorInfo({ hostname: 'ap3000-test-132' });
      const info2 = makeSensorInfo({ hostname: 'ap1001-test-80', port: 8081 });
      populateSensors(service, [
        { info: info1, client: client1 },
        { info: info2, client: client2 },
      ]);

      // Find a build with AP3000 data
      const baselines = service.loadBaselines();
      let buildName: string | undefined;
      let profile: string | undefined;
      for (const build of baselines.builds) {
        const bd = baselines.data[build];
        if (bd['AP3000']) {
          buildName = build;
          profile = Object.keys(bd['AP3000'])[0];
          break;
        }
      }
      expect(buildName).toBeDefined();
      expect(profile).toBeDefined();

      // Set up metrics for both sensors (client1 returns values, client2 will error since AP1001 may not match)
      const baseline = baselines.data[buildName!]['AP3000'][profile!];
      client1.get.mockImplementation(async (_url: string, params?: any) => {
        const query = params?.query ?? '';
        if (query.includes('port_bytes')) return promResponse(baseline.gbps);
        if (query.includes('port_packets')) return promResponse(baseline.kpps);
        if (query.includes('log_writer_writes')) return promResponse(baseline.klps);
        return promResponse(0);
      });
      client2.get.mockImplementation(async (_url: string, params?: any) => {
        const query = params?.query ?? '';
        if (query.includes('port_bytes')) return promResponse(10);
        if (query.includes('port_packets')) return promResponse(5000);
        if (query.includes('log_writer_writes')) return promResponse(2000);
        return promResponse(0);
      });

      const result = await service.getFleetVerdict(buildName!, profile!);
      expect(result.verdicts).toHaveLength(2);
      expect(result.summary).toContain('2 sensors');
      // First sensor should have a verdict (AP3000 matches)
      expect(result.verdicts[0].sensor).toBe('ap3000-test-132');
    });

    it('should return FAIL verdict when getPerformanceVerdict throws', async () => {
      const client = makeMockClient();
      const info = makeSensorInfo({ hostname: 'unknown-sensor-xyz' });
      populateSensors(service, [{ info, client }]);

      client.get.mockResolvedValue(promResponse(0));

      const baselines = service.loadBaselines();
      const buildName = baselines.builds[0];

      const result = await service.getFleetVerdict(buildName, 'NS2/Yes');
      expect(result.verdicts).toHaveLength(1);
      expect(result.verdicts[0].level).toBe('FAIL');
      expect(result.verdicts[0].summary).toContain('Error:');
    });
  });

  describe('findSshTunnelPorts (via private access)', () => {
    it('should parse ports from lsof output', () => {
      const lsofOutput = [
        'ssh     12345 user   10u  IPv4 0x1234  0t0  TCP localhost:8080 (LISTEN)',
        'ssh     12345 user   11u  IPv4 0x1235  0t0  TCP localhost:8085 (LISTEN)',
        'ssh     12345 user   12u  IPv4 0x1236  0t0  TCP localhost:8090 (LISTEN)',
      ].join('\n');
      (execSync as Mock).mockReturnValue(lsofOutput);

      const ports = (service as any).findSshTunnelPorts();
      expect(ports).toEqual([8080, 8085, 8090]);
    });

    it('should sort and deduplicate ports', () => {
      const lsofOutput = [
        'ssh     12345 user   10u  IPv4 0x1234  0t0  TCP localhost:8090 (LISTEN)',
        'ssh     12345 user   11u  IPv4 0x1235  0t0  TCP localhost:8080 (LISTEN)',
        'ssh     12345 user   12u  IPv6 0x1236  0t0  TCP localhost:8090 (LISTEN)',
      ].join('\n');
      (execSync as Mock).mockReturnValue(lsofOutput);

      const ports = (service as any).findSshTunnelPorts();
      expect(ports).toEqual([8080, 8090]); // sorted, deduplicated
    });

    it('should return empty array when lsof throws', () => {
      (execSync as Mock).mockImplementation(() => {
        throw new Error('command not found');
      });

      const ports = (service as any).findSshTunnelPorts();
      expect(ports).toEqual([]);
    });

    it('should exclude ports outside scan range', () => {
      const lsofOutput = [
        'ssh     12345 user   10u  IPv4 0x1234  0t0  TCP localhost:7999 (LISTEN)',
        'ssh     12345 user   11u  IPv4 0x1235  0t0  TCP localhost:8080 (LISTEN)',
        'ssh     12345 user   12u  IPv4 0x1236  0t0  TCP localhost:8100 (LISTEN)',
      ].join('\n');
      (execSync as Mock).mockReturnValue(lsofOutput);

      const ports = (service as any).findSshTunnelPorts();
      expect(ports).toEqual([8080]); // only 8080 is in 8080-8099
    });

    it('should handle lines that do not match the port pattern', () => {
      const lsofOutput = [
        'ssh     12345 user   10u  IPv4 0x1234  0t0  TCP localhost:8080 (LISTEN)',
        'some random line without port',
        'ssh     12345 user   12u  IPv4 0x1236  0t0  TCP *:* (LISTEN)',
      ].join('\n');
      (execSync as Mock).mockReturnValue(lsofOutput);

      const ports = (service as any).findSshTunnelPorts();
      expect(ports).toEqual([8080]);
    });
  });
});
