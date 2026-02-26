import { RampService } from './ramp.js';
import type {
  SensorInfo,
  MetricSnapshot,
  Verdict,
  BaselineEntry,
} from '../ramp-types.js';

// --- Type exports ---

export type Bottleneck =
  | 'zeek_cpu'
  | 'suricata_cpu'
  | 'nic_overflow'
  | 'buffer_pressure'
  | 'suricata_memory'
  | 'unknown';

export type IndicatorStatus = 'ok' | 'warning' | 'critical';

export interface DropSource {
  layer: 'nic' | 'zeek' | 'suricata' | 'buffer';
  rate: number;
  detail: string;
}

export interface LeadingIndicator {
  name: string;
  value: number;
  threshold: number;
  status: IndicatorStatus;
}

export interface Diagnosis {
  sensor: string;
  timeRange: string;
  dropSources: DropSource[];
  bottleneck: Bottleneck;
  leadingIndicators: LeadingIndicator[];
  summary: string;
}

export interface RegressionFingerprint {
  verdict: Verdict;
  diagnosis: Diagnosis;
  rootCause: string;
  evidence: string[];
  recommendation: string;
}

export interface BuildComparisonEntry {
  sensorType: string;
  profile: string;
  buildAMetrics: BaselineEntry;
  buildBMetrics: BaselineEntry;
  deltas: { gbps: number; kpps: number; klps: number };
  verdict: 'regressed' | 'improved' | 'stable';
}

export interface BuildComparison {
  buildA: string;
  buildB: string;
  entries: BuildComparisonEntry[];
  summary: string;
}

export interface WatchSnapshot {
  timestamp: number;
  metrics: MetricSnapshot;
}

export interface DropEvent {
  detectedAt: number;
  preDropSnapshot: WatchSnapshot;
  dropSnapshot: WatchSnapshot;
  bottleneck: Bottleneck;
}

export interface WatchResult {
  sensor: string;
  duration: number;
  interval: number;
  snapshots: WatchSnapshot[];
  dropEvents: DropEvent[];
}

// --- Diagnostic queries ---

export const DIAGNOSTIC_QUERIES = {
  nic: {
    portOverflow:
      'sum by (port)(rate(napatech_stat_port_ext_drop_overflow_packets[5m]))',
    totalNicDrops:
      'sum(rate(napatech_stat_port_ext_drop_overflow_packets[5m]))',
  },
  zeek: {
    workerDropsTotal:
      'sum(rate(corelight_monitor_pkts_dropped_total[5m]))',
    workerDropsMax:
      'max(sum by (node)(rate(corelight_monitor_pkts_dropped_total[5m])))',
  },
  suricata: {
    dispatchDrops:
      'sum(rate(suricata_napatech_dispatch_drop_packets_total[5m]))',
    overflowDrops:
      'sum(rate(suricata_napatech_overflow_drop_packets_total[5m]))',
    memcapDrops:
      'sum(rate(suricata_tcp_segment_memcap_drop_total[5m]))',
    ssnMemcapDrops:
      'sum(rate(suricata_tcp_ssn_memcap_drop_total[5m]))',
  },
  buffer: {
    utilization:
      'sum(napatech_stream_host_buffer_enqueued_bytes - napatech_stream_host_buffer_dequeued_bytes) / clamp_min(sum(napatech_stream_host_buffer_total_bytes), 1) * 100',
    perStreamDrops:
      'sum(rate(napatech_stream_host_buffer_drop_packets[5m]))',
  },
  cpu: {
    maxZeekWorker:
      'max(sum by (groupname)(rate(namedprocess_namegroup_cpu_seconds_total{groupname=~"zeek-worker-.*"}[5m])))',
    avgZeekWorker:
      'avg(sum by (groupname)(rate(namedprocess_namegroup_cpu_seconds_total{groupname=~"zeek-worker-.*"}[5m])))',
    suricataTotal:
      'sum(rate(namedprocess_namegroup_cpu_seconds_total{groupname="suricata"}[5m]))',
    maxSuricataWorker:
      'max(sum by (threadname)(rate(namedprocess_namegroup_thread_cpu_seconds_total{groupname="suricata",threadname=~"W#.*"}[5m])))',
  },
  leading: {
    packetLag:
      'max(max by (node)(zeek_net_packet_lag_seconds))',
    flowMemuse:
      'sum(suricata_flow_memuse_bytes)',
    flowMemcap:
      'max(suricata_flow_memcap_bytes)',
    emergencyMode:
      'sum(suricata_flow_emerg_mode_entered_total)',
    processingEfficiency:
      'sum(rate(zeek_log_writer_writes_total[5m])) / clamp_min(sum(rate(corelight_monitor_port_packets[5m])), 1)',
  },
} as const;

// --- Leading indicator thresholds ---

interface IndicatorThreshold {
  warning: number;
  critical: number;
  higherIsBad: boolean;
}

const LEADING_THRESHOLDS: Record<string, IndicatorThreshold> = {
  packetLag: { warning: 1.0, critical: 5.0, higherIsBad: true },
  flowMemuse: { warning: 0, critical: 0, higherIsBad: true }, // compared as ratio
  emergencyMode: { warning: 1, critical: 1, higherIsBad: true },
  processingEfficiency: { warning: 0.5, critical: 0.1, higherIsBad: false },
};

// --- Service ---

export class RampAnalysisService {
  private rampService: RampService;

  constructor(rampService: RampService) {
    this.rampService = rampService;
  }

  /**
   * Run all diagnostic queries in parallel and produce a drop diagnosis.
   */
  async diagnoseDrops(options?: {
    sensor?: string;
  }): Promise<Diagnosis> {
    const { info, client } = this.rampService.resolveSensor(options?.sensor);

    // Flatten all queries into a list with category+key metadata
    const queryEntries: Array<{
      category: string;
      key: string;
      query: string;
    }> = [];
    for (const [category, queries] of Object.entries(DIAGNOSTIC_QUERIES)) {
      for (const [key, query] of Object.entries(queries)) {
        queryEntries.push({ category, key, query });
      }
    }

    // Run all queries in parallel
    const results = new Map<string, number>();
    await Promise.all(
      queryEntries.map(async ({ category, key, query }) => {
        try {
          const response = await client.get<any>(
            `/api/datasources/proxy/uid/${info.prometheusUid}/api/v1/query`,
            { query },
          );
          const value = response?.data?.result?.[0]?.value?.[1];
          results.set(`${category}.${key}`, value ? parseFloat(value) : 0);
        } catch {
          results.set(`${category}.${key}`, 0);
        }
      }),
    );

    const get = (cat: string, key: string): number =>
      results.get(`${cat}.${key}`) ?? 0;

    // Identify drop sources
    const dropSources: DropSource[] = [];

    const totalNicDrops = get('nic', 'totalNicDrops');
    if (totalNicDrops > 0) {
      dropSources.push({
        layer: 'nic',
        rate: totalNicDrops,
        detail: `NIC port overflow: ${totalNicDrops.toFixed(1)} drops/s`,
      });
    }

    const zeekDropsTotal = get('zeek', 'workerDropsTotal');
    if (zeekDropsTotal > 0) {
      dropSources.push({
        layer: 'zeek',
        rate: zeekDropsTotal,
        detail: `Zeek worker drops: ${zeekDropsTotal.toFixed(1)} drops/s`,
      });
    }

    const suriDispatch = get('suricata', 'dispatchDrops');
    const suriOverflow = get('suricata', 'overflowDrops');
    const suriMemcap = get('suricata', 'memcapDrops');
    const suriSsnMemcap = get('suricata', 'ssnMemcapDrops');
    const totalSuriDrops =
      suriDispatch + suriOverflow + suriMemcap + suriSsnMemcap;
    if (suriDispatch > 0) {
      dropSources.push({
        layer: 'suricata',
        rate: suriDispatch,
        detail: `Suricata dispatch drops: ${suriDispatch.toFixed(1)} drops/s`,
      });
    }
    if (suriOverflow > 0) {
      dropSources.push({
        layer: 'suricata',
        rate: suriOverflow,
        detail: `Suricata overflow drops: ${suriOverflow.toFixed(1)} drops/s`,
      });
    }
    if (suriMemcap > 0) {
      dropSources.push({
        layer: 'suricata',
        rate: suriMemcap,
        detail: `Suricata TCP memcap drops: ${suriMemcap.toFixed(1)} drops/s`,
      });
    }
    if (suriSsnMemcap > 0) {
      dropSources.push({
        layer: 'suricata',
        rate: suriSsnMemcap,
        detail: `Suricata TCP session memcap drops: ${suriSsnMemcap.toFixed(1)} drops/s`,
      });
    }

    const bufferDrops = get('buffer', 'perStreamDrops');
    if (bufferDrops > 0) {
      dropSources.push({
        layer: 'buffer',
        rate: bufferDrops,
        detail: `Buffer stream drops: ${bufferDrops.toFixed(1)} drops/s`,
      });
    }

    // CPU metrics
    const maxZeekCpu = get('cpu', 'maxZeekWorker');
    const maxSuriCpu = get('cpu', 'maxSuricataWorker');
    const bufferUtil = get('buffer', 'utilization');

    // Leading indicators
    const flowMemuse = get('leading', 'flowMemuse');
    const flowMemcap = get('leading', 'flowMemcap');
    const memRatio = flowMemcap > 0 ? flowMemuse / flowMemcap : 0;

    // Classify bottleneck
    let bottleneck: Bottleneck = 'unknown';
    if (maxZeekCpu > 0.90) {
      bottleneck = 'zeek_cpu';
    } else if (maxSuriCpu > 0.90) {
      bottleneck = 'suricata_cpu';
    } else if (bufferUtil > 70) {
      bottleneck = 'buffer_pressure';
    } else if (memRatio > 0.85 && totalSuriDrops > 0) {
      bottleneck = 'suricata_memory';
    } else if (totalNicDrops > 0 && maxZeekCpu <= 0.90) {
      bottleneck = 'nic_overflow';
    }

    // Build leading indicators
    const packetLag = get('leading', 'packetLag');
    const emergencyMode = get('leading', 'emergencyMode');
    const processingEfficiency = get('leading', 'processingEfficiency');

    const leadingIndicators: LeadingIndicator[] = [
      {
        name: 'packetLag',
        value: packetLag,
        threshold: LEADING_THRESHOLDS.packetLag.warning,
        status: classifyStatus(
          packetLag,
          LEADING_THRESHOLDS.packetLag,
        ),
      },
      {
        name: 'flowMemoryRatio',
        value: memRatio,
        threshold: 0.85,
        status:
          memRatio > 0.95
            ? 'critical'
            : memRatio > 0.85
              ? 'warning'
              : 'ok',
      },
      {
        name: 'emergencyMode',
        value: emergencyMode,
        threshold: LEADING_THRESHOLDS.emergencyMode.warning,
        status:
          emergencyMode > 0 ? 'critical' : 'ok',
      },
      {
        name: 'processingEfficiency',
        value: processingEfficiency,
        threshold: LEADING_THRESHOLDS.processingEfficiency.warning,
        status: classifyStatus(
          processingEfficiency,
          LEADING_THRESHOLDS.processingEfficiency,
        ),
      },
      {
        name: 'maxZeekWorkerCpu',
        value: maxZeekCpu,
        threshold: 0.90,
        status:
          maxZeekCpu > 0.95
            ? 'critical'
            : maxZeekCpu > 0.90
              ? 'warning'
              : 'ok',
      },
      {
        name: 'maxSuricataWorkerCpu',
        value: maxSuriCpu,
        threshold: 0.90,
        status:
          maxSuriCpu > 0.95
            ? 'critical'
            : maxSuriCpu > 0.90
              ? 'warning'
              : 'ok',
      },
      {
        name: 'bufferUtilization',
        value: bufferUtil,
        threshold: 70,
        status:
          bufferUtil > 90
            ? 'critical'
            : bufferUtil > 70
              ? 'warning'
              : 'ok',
      },
    ];

    // Build summary
    const summaryParts: string[] = [];
    if (dropSources.length === 0) {
      summaryParts.push('No drops detected.');
    } else {
      summaryParts.push(
        `${dropSources.length} drop source(s) detected.`,
      );
      summaryParts.push(`Bottleneck: ${bottleneck}.`);
    }

    const warningCount = leadingIndicators.filter(
      (i) => i.status === 'warning',
    ).length;
    const criticalCount = leadingIndicators.filter(
      (i) => i.status === 'critical',
    ).length;
    if (criticalCount > 0) {
      summaryParts.push(
        `${criticalCount} critical indicator(s).`,
      );
    }
    if (warningCount > 0) {
      summaryParts.push(
        `${warningCount} warning indicator(s).`,
      );
    }

    return {
      sensor: info.hostname,
      timeRange: 'last 5m (instant query)',
      dropSources,
      bottleneck,
      leadingIndicators,
      summary: summaryParts.join(' '),
    };
  }

  /**
   * Combine verdict + diagnosis to fingerprint a regression's root cause.
   */
  async fingerprintRegression(options: {
    sensor?: string;
    build: string;
    profile: string;
  }): Promise<RegressionFingerprint> {
    const [verdict, diagnosis] = await Promise.all([
      this.rampService.getPerformanceVerdict({
        sensor: options.sensor,
        build: options.build,
        profile: options.profile,
      }),
      this.diagnoseDrops({ sensor: options.sensor }),
    ]);

    // Build evidence from non-ok indicators and drop sources
    const evidence: string[] = [];
    for (const indicator of diagnosis.leadingIndicators) {
      if (indicator.status !== 'ok') {
        evidence.push(
          `${indicator.name}: ${indicator.value.toFixed(3)} (threshold: ${indicator.threshold}, status: ${indicator.status})`,
        );
      }
    }
    for (const drop of diagnosis.dropSources) {
      evidence.push(drop.detail);
    }

    // Map bottleneck to root cause and recommendation
    const { rootCause, recommendation } = mapBottleneckToGuidance(
      diagnosis.bottleneck,
      verdict,
    );

    return {
      verdict,
      diagnosis,
      rootCause,
      evidence,
      recommendation,
    };
  }

  /**
   * Compare two builds across all shared (sensorType, profile) pairs.
   */
  compareBuilds(buildA: string, buildB: string): BuildComparison {
    const baselines = this.rampService.loadBaselines();

    const dataA = baselines.data[buildA];
    if (!dataA) {
      throw new Error(
        `Build "${buildA}" not found in baselines.json. Available: ${baselines.builds.slice(0, 10).join(', ')}`,
      );
    }
    const dataB = baselines.data[buildB];
    if (!dataB) {
      throw new Error(
        `Build "${buildB}" not found in baselines.json. Available: ${baselines.builds.slice(0, 10).join(', ')}`,
      );
    }

    const entries: BuildComparisonEntry[] = [];

    // Find shared (sensorType, profile) pairs
    for (const sensorType of Object.keys(dataA)) {
      const profilesA = dataA[sensorType];
      const profilesB = dataB[sensorType];
      if (!profilesA || !profilesB) continue;

      for (const profile of Object.keys(profilesA)) {
        if (!profilesB[profile]) continue;

        const metricsA = profilesA[profile];
        const metricsB = profilesB[profile];

        const deltas = {
          gbps:
            metricsA.gbps > 0
              ? ((metricsB.gbps - metricsA.gbps) / metricsA.gbps) * 100
              : 0,
          kpps:
            metricsA.kpps > 0
              ? ((metricsB.kpps - metricsA.kpps) / metricsA.kpps) * 100
              : 0,
          klps:
            metricsA.klps > 0
              ? ((metricsB.klps - metricsA.klps) / metricsA.klps) * 100
              : 0,
        };

        // Classify based on worst delta
        const worstDelta = Math.min(deltas.gbps, deltas.kpps, deltas.klps);
        const bestDelta = Math.max(deltas.gbps, deltas.kpps, deltas.klps);

        let verdict: 'regressed' | 'improved' | 'stable';
        if (worstDelta < -5) {
          verdict = 'regressed';
        } else if (bestDelta > 5) {
          verdict = 'improved';
        } else {
          verdict = 'stable';
        }

        entries.push({
          sensorType,
          profile,
          buildAMetrics: metricsA,
          buildBMetrics: metricsB,
          deltas,
          verdict,
        });
      }
    }

    const regressed = entries.filter((e) => e.verdict === 'regressed').length;
    const improved = entries.filter((e) => e.verdict === 'improved').length;
    const stable = entries.filter((e) => e.verdict === 'stable').length;

    return {
      buildA,
      buildB,
      entries,
      summary:
        `Compared ${entries.length} (sensor, profile) pairs between ${buildA} and ${buildB}: ` +
        `${regressed} regressed, ${improved} improved, ${stable} stable.`,
    };
  }

  /**
   * Poll sensor metrics at intervals, detect drop events.
   */
  async watchTest(options?: {
    sensor?: string;
    durationSeconds?: number;
    intervalSeconds?: number;
  }): Promise<WatchResult> {
    const duration = options?.durationSeconds ?? 60;
    const interval = options?.intervalSeconds ?? 10;
    const sensorName = options?.sensor;

    const { info } = this.rampService.resolveSensor(sensorName);

    const snapshots: WatchSnapshot[] = [];
    const dropEvents: DropEvent[] = [];
    let previousHadDrops = false;

    const endTime = Date.now() + duration * 1000;
    let iteration = 0;

    while (Date.now() < endTime) {
      // Wait for interval (skip on first iteration)
      if (iteration > 0) {
        await sleep(interval * 1000);
      }

      // Check if we've exceeded duration after sleeping
      if (iteration > 0 && Date.now() >= endTime) {
        break;
      }

      try {
        const { metrics } = await this.rampService.getSensorStatus(sensorName);
        const now = Date.now();
        const snapshot: WatchSnapshot = {
          timestamp: now,
          metrics,
        };
        snapshots.push(snapshot);

        // Detect drop transition
        const hasDrops =
          metrics.nicDropsPerSec > 0 ||
          metrics.zeekDropsPerSec > 0 ||
          metrics.suricataDropsPerSec > 0;

        if (hasDrops && !previousHadDrops && snapshots.length >= 2) {
          // Drop event detected — run diagnosis
          let bottleneck: Bottleneck = 'unknown';
          try {
            const diagnosis = await this.diagnoseDrops({ sensor: sensorName });
            bottleneck = diagnosis.bottleneck;
          } catch {
            // Diagnosis failed, keep unknown
          }

          dropEvents.push({
            detectedAt: now,
            preDropSnapshot: snapshots[snapshots.length - 2],
            dropSnapshot: snapshot,
            bottleneck,
          });
        }

        previousHadDrops = hasDrops;
      } catch {
        // Sensor unreachable — skip this iteration
      }

      iteration++;
    }

    return {
      sensor: info.hostname,
      duration,
      interval,
      snapshots,
      dropEvents,
    };
  }

  /**
   * List all Prometheus metric names grouped by subsystem prefix.
   */
  async exploreSensorMetrics(
    sensorName?: string,
  ): Promise<Record<string, string[]>> {
    const { info, client } = this.rampService.resolveSensor(sensorName);

    const response = await client.get<any>(
      `/api/datasources/proxy/uid/${info.prometheusUid}/api/v1/label/__name__/values`,
    );

    const metricNames: string[] = response?.data ?? response ?? [];

    // Group by prefix (first segment before _)
    const groups: Record<string, string[]> = {};
    for (const name of metricNames) {
      const prefix = name.split('_')[0];
      if (!groups[prefix]) {
        groups[prefix] = [];
      }
      groups[prefix].push(name);
    }

    return groups;
  }
}

// --- Helpers ---

function classifyStatus(
  value: number,
  threshold: IndicatorThreshold,
): IndicatorStatus {
  if (threshold.higherIsBad) {
    if (value >= threshold.critical) return 'critical';
    if (value >= threshold.warning) return 'warning';
    return 'ok';
  } else {
    // Lower is bad (e.g. processing efficiency)
    if (value > 0 && value <= threshold.critical) return 'critical';
    if (value > 0 && value <= threshold.warning) return 'warning';
    return 'ok';
  }
}

function mapBottleneckToGuidance(
  bottleneck: Bottleneck,
  verdict: Verdict,
): { rootCause: string; recommendation: string } {
  switch (bottleneck) {
    case 'zeek_cpu':
      return {
        rootCause:
          'Zeek workers are CPU-saturated. The hottest worker is above 90% CPU, causing packet drops at the worker level.',
        recommendation:
          'Consider increasing Zeek worker count, reviewing loaded scripts for expensive operations, or reducing traffic rate. Check if a specific worker is hotter than others (uneven hashing).',
      };
    case 'suricata_cpu':
      return {
        rootCause:
          'Suricata worker threads are CPU-saturated. The hottest Suricata worker is above 90% CPU.',
        recommendation:
          'Consider increasing Suricata thread count, reviewing detection rules for expensive patterns, or tuning suricata thresholds (hash_size, memcap).',
      };
    case 'nic_overflow':
      return {
        rootCause:
          'NIC port overflow drops detected without CPU saturation. The Napatech adapter is dropping packets before they reach the processing pipeline.',
        recommendation:
          'Check NIC stream configuration, host buffer sizes, and ensure NIC firmware is up to date. This may indicate a hardware limitation at the current traffic rate.',
      };
    case 'buffer_pressure':
      return {
        rootCause:
          'Host buffer utilization is above 70%. Processing cannot keep up with the incoming packet rate, causing buffer overflow.',
        recommendation:
          'Increase host buffer allocation in Napatech configuration, or reduce processing load by disabling unnecessary packages.',
      };
    case 'suricata_memory':
      return {
        rootCause:
          'Suricata flow memory usage is above 85% of the configured memcap. Memory pressure is causing TCP segment and session drops.',
        recommendation:
          'Increase suricata flow memcap, tune flow timeouts, or check for flow table exhaustion under high connection rates.',
      };
    default:
      return {
        rootCause:
          verdict.level === 'PASS'
            ? 'No specific bottleneck identified. Performance is within expected range.'
            : 'No clear single bottleneck identified. The regression may be caused by a combination of factors or a workload change.',
        recommendation:
          verdict.level === 'PASS'
            ? 'No action required.'
            : 'Run a longer test with watchTest to capture the drop onset, or compare CPU/memory profiles between the current and baseline builds.',
      };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
