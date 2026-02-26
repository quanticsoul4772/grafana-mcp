import { describe, it, expect, vi } from 'vitest';

vi.mock('child_process', () => ({ execSync: vi.fn(() => '') }));

import { RampService } from './services/ramp.js';
import { RampResultsService } from './services/ramp-results.js';
import { RampAnalysisService } from './services/ramp-analysis.js';
import { RampControlService } from './services/ramp-control.js';

describe('Integration: RAMP service wiring', () => {
  it('should construct all services without error', () => {
    const rampService = new RampService({ rampProjectPath: '/Users/russellsmith/Projects/ramp' });
    const resultsService = new RampResultsService({ rampProjectPath: '/Users/russellsmith/Projects/ramp' });
    const analysisService = new RampAnalysisService(rampService);
    const controlService = new RampControlService(rampService);

    expect(rampService).toBeInstanceOf(RampService);
    expect(resultsService).toBeInstanceOf(RampResultsService);
    expect(analysisService).toBeInstanceOf(RampAnalysisService);
    expect(controlService).toBeInstanceOf(RampControlService);
  });

  it('should load baselines from disk', () => {
    const rampService = new RampService({ rampProjectPath: '/Users/russellsmith/Projects/ramp' });
    const baselines = rampService.loadBaselines();
    expect(baselines.builds.length).toBeGreaterThan(0);
    expect(Object.keys(baselines.data).length).toBeGreaterThan(0);
  });

  it('should resolve sensor types from sensor-types.json', () => {
    const rampService = new RampService({ rampProjectPath: '/Users/russellsmith/Projects/ramp' });
    const config = rampService.getSensorConfig('192.168.21.132');
    expect(config).not.toBeNull();
    expect(config!.type).toBe('AP3000');
  });

  it('should get trend data for known sensor type', () => {
    const rampService = new RampService({ rampProjectPath: '/Users/russellsmith/Projects/ramp' });
    const trend = rampService.getSensorTrend('AP3000', 'NS2/Yes');
    expect(trend.length).toBeGreaterThan(0);
  });

  it('should compare two known builds', () => {
    const rampService = new RampService({ rampProjectPath: '/Users/russellsmith/Projects/ramp' });
    const analysisService = new RampAnalysisService(rampService);

    const builds = rampService.loadBaselines().builds;
    if (builds.length >= 2) {
      const comparison = analysisService.compareBuilds(builds[0], builds[1]);
      expect(comparison.entries.length).toBeGreaterThan(0);
    }
  });
});
