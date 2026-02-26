import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({ execSync: vi.fn(() => '') }));

import { RampForecastService } from './ramp-forecast.js';
import { RampService } from './ramp.js';

const RAMP_PATH = '/Users/russellsmith/Projects/ramp';

describe('RampForecastService', () => {
  let service: RampForecastService;
  let rampService: RampService;

  beforeEach(() => {
    vi.clearAllMocks();
    rampService = new RampService({ rampProjectPath: RAMP_PATH });
    service = new RampForecastService(rampService);
  });

  describe('getHistory', () => {
    it('should return history for AP3000 NS2/Yes', () => {
      const history = service.getHistory('AP3000', 'NS2/Yes');
      expect(history.length).toBeGreaterThan(0);
      for (const entry of history) {
        expect(entry.build).toBeDefined();
        expect(entry.gbps).toBeGreaterThan(0);
      }
    });

    it('should return empty for nonexistent type', () => {
      expect(service.getHistory('FAKE', 'NS2/Yes')).toEqual([]);
    });
  });

  describe('predictFirmwareImpact', () => {
    it('should return predictions for all types', () => {
      const impact = service.predictFirmwareImpact();
      expect(impact.predictions.length).toBeGreaterThan(0);
      expect(impact.fleetRisk).toMatch(/^(low|medium|high)$/);
      expect(impact.summary).toBeDefined();
    });

    it('should filter by sensor type', () => {
      const impact = service.predictFirmwareImpact('AP3000');
      for (const p of impact.predictions) {
        expect(p.sensorType).toBe('AP3000');
      }
    });
  });
});
