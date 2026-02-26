import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('child_process', () => ({ execSync: vi.fn(() => '') }));

vi.mock('../http-client.js', () => ({
  GrafanaHttpClient: vi.fn().mockImplementation(() => ({
    get: vi.fn(),
    post: vi.fn(),
  })),
}));

import { RampAnalysisService, DIAGNOSTIC_QUERIES } from './ramp-analysis.js';
import { RampService } from './ramp.js';
import type { SensorInfo, MetricSnapshot, Verdict } from '../ramp-types.js';

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

// Helper: make a Prometheus query response with a single scalar value
function makePromResponse(value: number) {
  return {
    data: {
      resultType: 'vector',
      result: [{ metric: {}, value: [Date.now() / 1000, String(value)] }],
    },
  };
}

// Helper: make an empty Prometheus query response
function makeEmptyPromResponse() {
  return {
    data: {
      resultType: 'vector',
      result: [],
    },
  };
}

describe('RampAnalysisService', () => {
  describe('DIAGNOSTIC_QUERIES', () => {
    it('should define all required query categories', () => {
      expect(DIAGNOSTIC_QUERIES.nic).toBeDefined();
      expect(DIAGNOSTIC_QUERIES.zeek).toBeDefined();
      expect(DIAGNOSTIC_QUERIES.suricata).toBeDefined();
      expect(DIAGNOSTIC_QUERIES.buffer).toBeDefined();
      expect(DIAGNOSTIC_QUERIES.cpu).toBeDefined();
      expect(DIAGNOSTIC_QUERIES.leading).toBeDefined();
    });

    it('should have at least 12 total queries', () => {
      const total = Object.values(DIAGNOSTIC_QUERIES).reduce(
        (sum, cat) => sum + Object.keys(cat).length,
        0,
      );
      expect(total).toBeGreaterThanOrEqual(12);
    });

    it('should have exactly 19 total queries', () => {
      const total = Object.values(DIAGNOSTIC_QUERIES).reduce(
        (sum, cat) => sum + Object.keys(cat).length,
        0,
      );
      expect(total).toBe(19);
    });

    it('should contain valid PromQL strings', () => {
      for (const category of Object.values(DIAGNOSTIC_QUERIES)) {
        for (const query of Object.values(category)) {
          expect(typeof query).toBe('string');
          expect(query.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('constructor', () => {
    it('should accept a RampService dependency', () => {
      const rampService = new RampService({
        rampProjectPath: RAMP_PROJECT_PATH,
      });
      const analysisService = new RampAnalysisService(rampService);
      expect(analysisService).toBeInstanceOf(RampAnalysisService);
    });
  });

  describe('diagnoseDrops', () => {
    let rampService: RampService;
    let analysisService: RampAnalysisService;
    let mockClient: ReturnType<typeof makeMockClient>;
    let sensorInfo: SensorInfo;

    beforeEach(() => {
      vi.clearAllMocks();
      rampService = new RampService({ rampProjectPath: RAMP_PROJECT_PATH });
      analysisService = new RampAnalysisService(rampService);
      sensorInfo = makeSensorInfo();
      mockClient = makeMockClient();
      populateSensors(rampService, [{ info: sensorInfo, client: mockClient }]);
    });

    it('should return a diagnosis with no drops when all metrics are zero', async () => {
      mockClient.get.mockResolvedValue(makeEmptyPromResponse());

      const diagnosis = await analysisService.diagnoseDrops();

      expect(diagnosis).toMatchObject({
        sensor: sensorInfo.hostname,
        dropSources: [],
        bottleneck: 'unknown',
      });
      expect(diagnosis.leadingIndicators).toBeDefined();
      expect(diagnosis.summary).toBeDefined();
      expect(diagnosis.timeRange).toBeDefined();
    });

    it('should identify NIC overflow drops', async () => {
      mockClient.get.mockImplementation(async (_url: string, params?: any) => {
        if (params?.query?.includes('napatech_stat_port_ext_drop_overflow')) {
          return makePromResponse(1500);
        }
        return makeEmptyPromResponse();
      });

      const diagnosis = await analysisService.diagnoseDrops();

      const nicDrops = diagnosis.dropSources.filter((d) => d.layer === 'nic');
      expect(nicDrops.length).toBeGreaterThan(0);
    });

    it('should identify zeek worker drops', async () => {
      mockClient.get.mockImplementation(async (_url: string, params?: any) => {
        if (params?.query?.includes('corelight_monitor_pkts_dropped_total')) {
          return makePromResponse(500);
        }
        return makeEmptyPromResponse();
      });

      const diagnosis = await analysisService.diagnoseDrops();

      const zeekDrops = diagnosis.dropSources.filter(
        (d) => d.layer === 'zeek',
      );
      expect(zeekDrops.length).toBeGreaterThan(0);
    });

    it('should identify suricata drops', async () => {
      mockClient.get.mockImplementation(async (_url: string, params?: any) => {
        if (params?.query?.includes('suricata_napatech_dispatch_drop')) {
          return makePromResponse(300);
        }
        return makeEmptyPromResponse();
      });

      const diagnosis = await analysisService.diagnoseDrops();

      const suriDrops = diagnosis.dropSources.filter(
        (d) => d.layer === 'suricata',
      );
      expect(suriDrops.length).toBeGreaterThan(0);
    });

    it('should classify zeek_cpu bottleneck when max worker CPU > 0.90', async () => {
      mockClient.get.mockImplementation(async (_url: string, params?: any) => {
        if (params?.query?.includes('corelight_monitor_pkts_dropped_total')) {
          return makePromResponse(500);
        }
        if (
          params?.query?.includes('namedprocess_namegroup_cpu_seconds_total') &&
          params?.query?.includes('zeek-worker')
        ) {
          return makePromResponse(0.95);
        }
        return makeEmptyPromResponse();
      });

      const diagnosis = await analysisService.diagnoseDrops();

      expect(diagnosis.bottleneck).toBe('zeek_cpu');
    });

    it('should classify suricata_cpu bottleneck when max suri worker > 0.90', async () => {
      mockClient.get.mockImplementation(async (_url: string, params?: any) => {
        if (params?.query?.includes('suricata_napatech_dispatch_drop')) {
          return makePromResponse(300);
        }
        if (
          params?.query?.includes(
            'namedprocess_namegroup_thread_cpu_seconds_total',
          )
        ) {
          return makePromResponse(0.95);
        }
        return makeEmptyPromResponse();
      });

      const diagnosis = await analysisService.diagnoseDrops();

      expect(diagnosis.bottleneck).toBe('suricata_cpu');
    });

    it('should classify buffer_pressure when utilization > 70', async () => {
      mockClient.get.mockImplementation(async (_url: string, params?: any) => {
        if (
          params?.query?.includes('napatech_stream_host_buffer_enqueued_bytes')
        ) {
          return makePromResponse(85);
        }
        if (
          params?.query?.includes('napatech_stream_host_buffer_drop_packets')
        ) {
          return makePromResponse(200);
        }
        return makeEmptyPromResponse();
      });

      const diagnosis = await analysisService.diagnoseDrops();

      expect(diagnosis.bottleneck).toBe('buffer_pressure');
    });

    it('should classify nic_overflow when NIC drops present with low CPU', async () => {
      mockClient.get.mockImplementation(async (_url: string, params?: any) => {
        if (params?.query?.includes('napatech_stat_port_ext_drop_overflow')) {
          return makePromResponse(1000);
        }
        // low CPU
        if (params?.query?.includes('namedprocess_namegroup_cpu_seconds_total')) {
          return makePromResponse(0.5);
        }
        return makeEmptyPromResponse();
      });

      const diagnosis = await analysisService.diagnoseDrops();

      expect(diagnosis.bottleneck).toBe('nic_overflow');
    });

    it('should classify suricata_memory bottleneck', async () => {
      mockClient.get.mockImplementation(async (_url: string, params?: any) => {
        if (params?.query?.includes('suricata_flow_memuse_bytes')) {
          return makePromResponse(900);
        }
        if (params?.query?.includes('suricata_flow_memcap_bytes')) {
          return makePromResponse(1000);
        }
        if (params?.query?.includes('suricata_tcp_segment_memcap_drop')) {
          return makePromResponse(100);
        }
        return makeEmptyPromResponse();
      });

      const diagnosis = await analysisService.diagnoseDrops();

      expect(diagnosis.bottleneck).toBe('suricata_memory');
    });

    it('should build leading indicators with status levels', async () => {
      mockClient.get.mockImplementation(async (_url: string, params?: any) => {
        if (params?.query?.includes('zeek_net_packet_lag_seconds')) {
          return makePromResponse(2.5);
        }
        return makeEmptyPromResponse();
      });

      const diagnosis = await analysisService.diagnoseDrops();

      const lagIndicator = diagnosis.leadingIndicators.find(
        (i) => i.name === 'packetLag',
      );
      expect(lagIndicator).toBeDefined();
      expect(lagIndicator!.status).not.toBe('ok');
    });

    it('should accept an optional sensor name', async () => {
      mockClient.get.mockResolvedValue(makeEmptyPromResponse());

      const diagnosis = await analysisService.diagnoseDrops({
        sensor: 'ap3000-test-132',
      });

      expect(diagnosis.sensor).toBe('ap3000-test-132');
    });
  });

  describe('fingerprintRegression', () => {
    let rampService: RampService;
    let analysisService: RampAnalysisService;
    let mockClient: ReturnType<typeof makeMockClient>;
    let sensorInfo: SensorInfo;

    beforeEach(() => {
      vi.clearAllMocks();
      rampService = new RampService({ rampProjectPath: RAMP_PROJECT_PATH });
      analysisService = new RampAnalysisService(rampService);
      sensorInfo = makeSensorInfo();
      mockClient = makeMockClient();
      populateSensors(rampService, [{ info: sensorInfo, client: mockClient }]);
    });

    it('should combine verdict and diagnosis into a fingerprint', async () => {
      // Mock getPerformanceVerdict
      vi.spyOn(rampService, 'getPerformanceVerdict').mockResolvedValue({
        level: 'MINOR REGRESSION',
        sensor: sensorInfo.hostname,
        build: '28.4.1',
        profile: 'NS2/Yes',
        metrics: {
          gbps: 40,
          kpps: 8000,
          klogps: 100,
          nicDropsPerSec: 0,
          zeekDropsPerSec: 0,
          suricataDropsPerSec: 0,
          maxWorkerCpu: 0.92,
          bufferUtilPct: 30,
          systemMemoryPct: 60,
          packetLag: 0.5,
          activeConnections: 1000,
        },
        deltas: [
          { metric: 'Gbps', actual: 40, baseline: 45, deltaPct: -11.1 },
        ],
        summary: 'Gbps is 11.1% below baseline',
      });

      // Mock diagnoseDrops queries
      mockClient.get.mockImplementation(async (_url: string, params?: any) => {
        if (
          params?.query?.includes('namedprocess_namegroup_cpu_seconds_total') &&
          params?.query?.includes('zeek-worker') &&
          params?.query?.startsWith('max')
        ) {
          return makePromResponse(0.92);
        }
        return makeEmptyPromResponse();
      });

      const fingerprint = await analysisService.fingerprintRegression({
        build: '28.4.1',
        profile: 'NS2/Yes',
      });

      expect(fingerprint).toMatchObject({
        verdict: expect.objectContaining({ level: 'MINOR REGRESSION' }),
        diagnosis: expect.objectContaining({ sensor: sensorInfo.hostname }),
      });
      expect(fingerprint.rootCause).toBeDefined();
      expect(fingerprint.evidence).toBeDefined();
      expect(fingerprint.recommendation).toBeDefined();
    });
  });

  describe('compareBuilds', () => {
    let rampService: RampService;
    let analysisService: RampAnalysisService;

    beforeEach(() => {
      vi.clearAllMocks();
      rampService = new RampService({ rampProjectPath: RAMP_PROJECT_PATH });
      analysisService = new RampAnalysisService(rampService);
    });

    it('should compare two builds and classify entries', () => {
      vi.spyOn(rampService, 'loadBaselines').mockReturnValue({
        builds: ['28.3.0', '28.4.1'],
        data: {
          '28.3.0': {
            AP3000: {
              'NS2/Yes': { gbps: 45, kpps: 9000, klps: 120 },
              'EW2/Yes': { gbps: 40, kpps: 8000, klps: 110 },
            },
          },
          '28.4.1': {
            AP3000: {
              'NS2/Yes': { gbps: 42, kpps: 8500, klps: 115 },
              'EW2/Yes': { gbps: 43, kpps: 8300, klps: 115 },
            },
          },
        },
      });

      const comparison = analysisService.compareBuilds('28.3.0', '28.4.1');

      expect(comparison.buildA).toBe('28.3.0');
      expect(comparison.buildB).toBe('28.4.1');
      expect(comparison.entries.length).toBe(2);

      // NS2/Yes: gbps went from 45 to 42 = -6.7%, should be regressed
      const ns2Entry = comparison.entries.find(
        (e) => e.profile === 'NS2/Yes',
      );
      expect(ns2Entry).toBeDefined();
      expect(ns2Entry!.verdict).toBe('regressed');

      // EW2/Yes: gbps went from 40 to 43 = +7.5%, should be improved
      const ew2Entry = comparison.entries.find(
        (e) => e.profile === 'EW2/Yes',
      );
      expect(ew2Entry).toBeDefined();
      expect(ew2Entry!.verdict).toBe('improved');

      expect(comparison.summary).toBeDefined();
    });

    it('should throw if a build is not found', () => {
      vi.spyOn(rampService, 'loadBaselines').mockReturnValue({
        builds: ['28.3.0'],
        data: {
          '28.3.0': {
            AP3000: { 'NS2/Yes': { gbps: 45, kpps: 9000, klps: 120 } },
          },
        },
      });

      expect(() =>
        analysisService.compareBuilds('28.3.0', 'nonexistent'),
      ).toThrow(/not found/);
    });

    it('should handle stable results within 5% threshold', () => {
      vi.spyOn(rampService, 'loadBaselines').mockReturnValue({
        builds: ['28.3.0', '28.4.1'],
        data: {
          '28.3.0': {
            AP1100: {
              'NS2/Yes': { gbps: 10, kpps: 2000, klps: 50 },
            },
          },
          '28.4.1': {
            AP1100: {
              'NS2/Yes': { gbps: 10.2, kpps: 2050, klps: 51 },
            },
          },
        },
      });

      const comparison = analysisService.compareBuilds('28.3.0', '28.4.1');

      expect(comparison.entries[0].verdict).toBe('stable');
    });
  });

  describe('watchTest', () => {
    let rampService: RampService;
    let analysisService: RampAnalysisService;
    let mockClient: ReturnType<typeof makeMockClient>;
    let sensorInfo: SensorInfo;

    beforeEach(() => {
      vi.clearAllMocks();
      vi.useFakeTimers();
      rampService = new RampService({ rampProjectPath: RAMP_PROJECT_PATH });
      analysisService = new RampAnalysisService(rampService);
      sensorInfo = makeSensorInfo();
      mockClient = makeMockClient();
      populateSensors(rampService, [{ info: sensorInfo, client: mockClient }]);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should collect snapshots for the specified duration', async () => {
      let callCount = 0;
      vi.spyOn(rampService, 'getSensorStatus').mockImplementation(async () => {
        callCount++;
        return {
          sensor: sensorInfo,
          metrics: {
            gbps: 40,
            kpps: 8000,
            klogps: 100,
            nicDropsPerSec: 0,
            zeekDropsPerSec: 0,
            suricataDropsPerSec: 0,
            maxWorkerCpu: 0.7,
            bufferUtilPct: 30,
            systemMemoryPct: 60,
            packetLag: 0.1,
            activeConnections: 1000,
          },
        };
      });

      // diagnoseDrops mock for drop detection
      mockClient.get.mockResolvedValue(makeEmptyPromResponse());

      const watchPromise = analysisService.watchTest({
        durationSeconds: 10,
        intervalSeconds: 5,
      });

      // Advance time through the intervals
      await vi.advanceTimersByTimeAsync(5000);
      await vi.advanceTimersByTimeAsync(5000);
      await vi.advanceTimersByTimeAsync(5000);

      const result = await watchPromise;

      expect(result.sensor).toBe(sensorInfo.hostname);
      expect(result.snapshots.length).toBeGreaterThanOrEqual(2);
      expect(result.dropEvents).toEqual([]);
    });

    it('should detect drop events', async () => {
      let callCount = 0;
      vi.spyOn(rampService, 'getSensorStatus').mockImplementation(async () => {
        callCount++;
        const hasDrops = callCount >= 2;
        return {
          sensor: sensorInfo,
          metrics: {
            gbps: 40,
            kpps: 8000,
            klogps: 100,
            nicDropsPerSec: hasDrops ? 500 : 0,
            zeekDropsPerSec: 0,
            suricataDropsPerSec: 0,
            maxWorkerCpu: 0.7,
            bufferUtilPct: 30,
            systemMemoryPct: 60,
            packetLag: 0.1,
            activeConnections: 1000,
          },
        };
      });

      mockClient.get.mockResolvedValue(makeEmptyPromResponse());

      const watchPromise = analysisService.watchTest({
        durationSeconds: 10,
        intervalSeconds: 5,
      });

      await vi.advanceTimersByTimeAsync(5000);
      await vi.advanceTimersByTimeAsync(5000);
      await vi.advanceTimersByTimeAsync(5000);

      const result = await watchPromise;

      expect(result.dropEvents.length).toBeGreaterThanOrEqual(1);
      expect(result.dropEvents[0].preDropSnapshot).toBeDefined();
      expect(result.dropEvents[0].dropSnapshot).toBeDefined();
    });
  });

  describe('exploreSensorMetrics', () => {
    let rampService: RampService;
    let analysisService: RampAnalysisService;
    let mockClient: ReturnType<typeof makeMockClient>;
    let sensorInfo: SensorInfo;

    beforeEach(() => {
      vi.clearAllMocks();
      rampService = new RampService({ rampProjectPath: RAMP_PROJECT_PATH });
      analysisService = new RampAnalysisService(rampService);
      sensorInfo = makeSensorInfo();
      mockClient = makeMockClient();
      populateSensors(rampService, [{ info: sensorInfo, client: mockClient }]);
    });

    it('should group metric names by prefix', async () => {
      mockClient.get.mockResolvedValue({
        data: [
          'napatech_stat_port_ext_drop_overflow_packets',
          'napatech_stream_host_buffer_total_bytes',
          'zeek_log_writer_writes_total',
          'zeek_active_connections',
          'suricata_flow_memuse_bytes',
          'node_memory_MemTotal_bytes',
          'corelight_monitor_port_packets',
        ],
      });

      const groups = await analysisService.exploreSensorMetrics();

      expect(groups['napatech']).toBeDefined();
      expect(groups['napatech'].length).toBe(2);
      expect(groups['zeek']).toBeDefined();
      expect(groups['zeek'].length).toBe(2);
      expect(groups['suricata']).toBeDefined();
      expect(groups['node']).toBeDefined();
      expect(groups['corelight']).toBeDefined();
    });

    it('should accept an optional sensor name', async () => {
      mockClient.get.mockResolvedValue({ data: ['test_metric'] });

      const groups = await analysisService.exploreSensorMetrics('ap3000-test-132');

      expect(groups).toBeDefined();
      expect(mockClient.get).toHaveBeenCalled();
    });
  });
});
