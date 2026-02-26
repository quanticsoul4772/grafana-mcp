import { RampService } from './ramp.js';
import type { TrendEntry } from '../ramp-types.js';

export type RiskLevel = 'low' | 'medium' | 'high';
export type Confidence = 'low' | 'medium' | 'high';

export interface CapacityForecast {
  currentRate: number;
  predictedMax: number;
  limitingFactor: string;
  headroom: Record<string, { current: number; ceiling: number; maxRate: number }>;
  confidence: Confidence;
  caveat: string;
}

export interface RiskCheck {
  name: string;
  status: 'pass' | 'warning' | 'fail';
  detail: string;
}

export interface PreflightRisk {
  sensor: string;
  profile: string;
  riskLevel: RiskLevel;
  score: number;
  checks: RiskCheck[];
  recommendation: string;
}

export interface FirmwarePrediction {
  sensorType: string;
  profile: string;
  trend: 'improving' | 'declining' | 'stable';
  predictedDeltaPct: number;
  confidence: Confidence;
  recentHistory: number[];
  note: string;
}

export interface FirmwareImpact {
  predictions: FirmwarePrediction[];
  fleetRisk: RiskLevel;
  summary: string;
}

export class RampForecastService {
  private historyCache: Map<string, TrendEntry[]> | null = null;

  constructor(private rampService: RampService) {}

  private ensureCache(): Map<string, TrendEntry[]> {
    if (this.historyCache) return this.historyCache;
    this.historyCache = new Map();
    const baselines = this.rampService.loadBaselines();

    for (const build of baselines.builds) {
      const buildData = baselines.data[build];
      if (!buildData) continue;
      for (const [sensorType, profiles] of Object.entries(buildData)) {
        for (const [profile, data] of Object.entries(
          profiles as Record<string, any>,
        )) {
          const key = `${sensorType}:${profile}`;
          if (!this.historyCache.has(key)) this.historyCache.set(key, []);
          this.historyCache.get(key)!.push({
            build,
            gbps: data.gbps,
            kpps: data.kpps,
            klps: data.klps,
          });
        }
      }
    }

    return this.historyCache;
  }

  getHistory(sensorType: string, profile: string): TrendEntry[] {
    const cache = this.ensureCache();
    return cache.get(`${sensorType}:${profile}`) ?? [];
  }

  async forecastMaxRate(sensor?: string): Promise<CapacityForecast> {
    const { metrics } = await this.rampService.getSensorStatus(sensor);
    const currentGbps = metrics.gbps;

    if (currentGbps < 0.1) {
      return {
        currentRate: 0,
        predictedMax: 0,
        limitingFactor: 'no_traffic',
        headroom: {},
        confidence: 'low',
        caveat: 'No traffic flowing — cannot extrapolate.',
      };
    }

    const SAFETY = 0.95;
    const headroom: Record<
      string,
      { current: number; ceiling: number; maxRate: number }
    > = {};

    const zeekCpu = metrics.maxWorkerCpu;
    const zeekMax =
      zeekCpu > 0.01 ? (currentGbps / zeekCpu) * SAFETY : Infinity;
    headroom.zeekCpu = { current: zeekCpu, ceiling: SAFETY, maxRate: zeekMax };

    const bufUtil = metrics.bufferUtilPct / 100;
    const bufMax =
      bufUtil > 0.01 ? (currentGbps / bufUtil) * 0.8 : Infinity;
    headroom.buffer = { current: bufUtil, ceiling: 0.8, maxRate: bufMax };

    const memUsed = (100 - metrics.systemMemoryPct) / 100;
    const memMax =
      memUsed > 0.5 ? (currentGbps / memUsed) * 0.85 : Infinity;
    headroom.memory = { current: memUsed, ceiling: 0.85, maxRate: memMax };

    const entries = Object.entries(headroom).filter(([, v]) =>
      isFinite(v.maxRate),
    );
    const limiting = entries.reduce((a, b) =>
      a[1].maxRate < b[1].maxRate ? a : b,
    );

    return {
      currentRate: currentGbps,
      predictedMax: Math.round(limiting[1].maxRate * 10) / 10,
      limitingFactor: limiting[0],
      headroom,
      confidence:
        zeekCpu > 0.3 ? 'high' : zeekCpu > 0.1 ? 'medium' : 'low',
      caveat: 'Linear extrapolation assumes constant per-packet cost.',
    };
  }

  async preflightRisk(options?: {
    sensor?: string;
    profile?: string;
  }): Promise<PreflightRisk> {
    const { sensor: sensorInfo, metrics } =
      await this.rampService.getSensorStatus(options?.sensor);
    const checks: RiskCheck[] = [];
    let score = 0;

    const hasDrops =
      metrics.nicDropsPerSec > 0 || metrics.zeekDropsPerSec > 0;
    checks.push({
      name: 'existing_drops',
      status: hasDrops ? 'fail' : 'pass',
      detail: hasDrops
        ? `Active drops: NIC=${metrics.nicDropsPerSec.toFixed(1)}/s Zeek=${metrics.zeekDropsPerSec.toFixed(1)}/s`
        : 'No active drops',
    });
    if (hasDrops) score += 40;

    const memLow = metrics.systemMemoryPct < 20;
    checks.push({
      name: 'memory_pressure',
      status: memLow ? 'warning' : 'pass',
      detail: `${metrics.systemMemoryPct.toFixed(1)}% available`,
    });
    if (memLow) score += 20;

    const highIdleCpu = metrics.maxWorkerCpu > 0.05;
    checks.push({
      name: 'cpu_baseline',
      status: highIdleCpu ? 'warning' : 'pass',
      detail: `Idle max worker CPU: ${(metrics.maxWorkerCpu * 100).toFixed(1)}%`,
    });
    if (highIdleCpu) score += 10;

    const bufferDirty = metrics.bufferUtilPct > 1;
    checks.push({
      name: 'buffer_residue',
      status: bufferDirty ? 'warning' : 'pass',
      detail: `Buffer utilization: ${metrics.bufferUtilPct.toFixed(1)}%`,
    });
    if (bufferDirty) score += 10;

    if (options?.profile) {
      const config = this.rampService.getSensorConfigByHostname(
        sensorInfo.hostname,
      );
      if (config) {
        const history = this.getHistory(config.type, options.profile);
        checks.push({
          name: 'historical_data',
          status: history.length > 0 ? 'pass' : 'warning',
          detail:
            history.length > 0
              ? `${history.length} historical data points for ${config.type} ${options.profile}`
              : 'No historical data',
        });
      }
    }

    const riskLevel: RiskLevel =
      score >= 40 ? 'high' : score >= 20 ? 'medium' : 'low';
    const failedChecks = checks.filter((c) => c.status !== 'pass');
    const recommendation =
      failedChecks.length === 0
        ? 'All checks passed. Safe to proceed.'
        : `${failedChecks.length} issue(s): ${failedChecks.map((c) => c.name).join(', ')}. Review before testing.`;

    return {
      sensor: sensorInfo.hostname,
      profile: options?.profile ?? 'unspecified',
      riskLevel,
      score,
      checks,
      recommendation,
    };
  }

  predictFirmwareImpact(sensorType?: string): FirmwareImpact {
    const cache = this.ensureCache();
    const predictions: FirmwarePrediction[] = [];

    for (const [key, history] of cache.entries()) {
      const [type, profile] = key.split(':');
      if (
        sensorType &&
        type.toUpperCase() !== sensorType.toUpperCase()
      )
        continue;
      if (history.length < 3) continue;

      const recent = history.slice(-5);
      const gbpsValues = recent.map((e) => e.gbps);

      const deltas: number[] = [];
      for (let i = 1; i < gbpsValues.length; i++) {
        if (gbpsValues[i - 1] > 0) {
          deltas.push(
            ((gbpsValues[i] - gbpsValues[i - 1]) / gbpsValues[i - 1]) *
              100,
          );
        }
      }

      const avgDelta =
        deltas.length > 0
          ? deltas.reduce((a, b) => a + b, 0) / deltas.length
          : 0;
      const variance =
        deltas.length > 1
          ? deltas.reduce((sum, d) => sum + (d - avgDelta) ** 2, 0) /
            (deltas.length - 1)
          : 0;
      const stddev = Math.sqrt(variance);

      let trend: 'improving' | 'declining' | 'stable' = 'stable';
      if (avgDelta < -2) trend = 'declining';
      else if (avgDelta > 2) trend = 'improving';

      const confidence: Confidence =
        stddev < 3 ? 'high' : stddev < 8 ? 'medium' : 'low';

      let note = `${trend} trend (avg ${avgDelta > 0 ? '+' : ''}${avgDelta.toFixed(1)}% per build)`;
      if (trend === 'declining') note += '. Investigate before release.';
      else if (trend === 'stable') note += '. Low risk.';

      predictions.push({
        sensorType: type,
        profile,
        trend,
        predictedDeltaPct: Math.round(avgDelta * 10) / 10,
        confidence,
        recentHistory: gbpsValues,
        note,
      });
    }

    const declining = predictions.filter(
      (p) => p.trend === 'declining',
    ).length;
    const fleetRisk: RiskLevel =
      declining > predictions.length / 2
        ? 'high'
        : declining > 0
          ? 'medium'
          : 'low';

    return {
      predictions,
      fleetRisk,
      summary: `${predictions.length} predictions: ${declining} declining, ${predictions.filter((p) => p.trend === 'stable').length} stable, ${predictions.filter((p) => p.trend === 'improving').length} improving`,
    };
  }
}
