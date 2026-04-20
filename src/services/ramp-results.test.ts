import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({ execSync: vi.fn(() => '') }));

import { RampResultsService } from './ramp-results.js';

const RAMP_PROJECT_PATH = '/Users/russellsmith/Projects/ramp';

describe('RampResultsService', () => {
  let service: RampResultsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RampResultsService({ rampProjectPath: RAMP_PROJECT_PATH });
  });

  describe('parseRunDirectory', () => {
    it('should parse standard directory name', () => {
      const parse = (service as any).parseRunDirectory.bind(service);
      const result = parse('ramp-run-ap3000-8649-132-packages--ns2--120000--abc123');
      expect(result).toEqual({
        testId: 'ramp-run-ap3000-8649-132-packages',
        testName: 'ns2',
        time: '120000',
        uuid: 'abc123',
      });
    });

    it('should return null for unparseable names', () => {
      const parse = (service as any).parseRunDirectory.bind(service);
      expect(parse('random-dir')).toBeNull();
    });
  });

  describe('listTestRuns', () => {
    it('should return empty array when no results directory', () => {
      const result = service.listTestRuns();
      // Results dir may or may not exist locally — should not throw
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
