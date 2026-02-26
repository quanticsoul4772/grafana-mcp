import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock child_process before importing RampService
vi.mock('child_process', () => ({
  execSync: vi.fn(() => ''),
}));

import { RampService } from './ramp.js';

const RAMP_PROJECT_PATH = '/Users/russellsmith/Projects/ramp';

describe('RampService', () => {
  let service: RampService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RampService({ rampProjectPath: RAMP_PROJECT_PATH });
  });

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
});
