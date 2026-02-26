# RAMP Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 7 RAMP-specific MCP tools to the Grafana MCP server for sensor performance testing workflows with auto-discovery, multi-sensor HTTP clients, and baseline comparison support.

**Architecture:** RampService manages a map of per-sensor GrafanaHttpClient instances, discovered via SSH tunnel port scanning. Tools delegate to RampService methods that query Prometheus via Grafana's datasource proxy API. Dashboard and baseline data loaded from `RAMP_PROJECT_PATH` filesystem.

**Tech Stack:** TypeScript, Zod, @modelcontextprotocol/sdk, axios (via GrafanaHttpClient), child_process (lsof for tunnel detection), fs (dashboard/baseline JSON files)

---

### Task 1: Add RAMP types

**Files:**
- Create: `src/ramp-types.ts`

**Step 1: Create the types file**

```typescript
// src/ramp-types.ts
import { z } from 'zod';

// --- Data types ---

export interface SensorInfo {
  port: number;
  hostname: string;
  grafanaUrl: string;
  prometheusUid: string;
  grafanaVersion?: string;
}

export interface BaselineEntry {
  gbps: number;
  kpps: number;
  klps: number;
}

export interface BaselineData {
  builds: string[];
  data: Record<string, Record<string, Record<string, BaselineEntry>>>;
  // data[buildName][sensorType][profile] = { gbps, kpps, klps }
}

export interface MetricSnapshot {
  gbps: number;
  kpps: number;
  klogps: number;
  nicDropsPerSec: number;
  zeekDropsPerSec: number;
  maxWorkerCpu: number;
  bufferUtilPct: number;
  systemMemoryPct: number;
}

export type VerdictLevel = 'PASS' | 'FAIL' | 'MINOR REGRESSION' | 'MAJOR REGRESSION';

export interface MetricDelta {
  metric: string;
  actual: number;
  baseline: number;
  deltaPct: number;
}

export interface Verdict {
  level: VerdictLevel;
  sensor: string;
  build: string;
  profile: string;
  metrics: MetricSnapshot;
  deltas: MetricDelta[];
  summary: string;
}

// --- Zod schemas for tool inputs ---

export const DiscoverSensorsSchema = z.object({}).describe('No parameters needed');

export const SensorStatusSchema = z.object({
  sensor: z.string().optional().describe('Sensor hostname. If omitted, uses first discovered sensor.'),
});

export const QuerySensorMetricSchema = z.object({
  sensor: z.string().optional().describe('Sensor hostname. If omitted, uses first discovered sensor.'),
  query: z.string().min(1).describe('PromQL query to execute'),
  instant: z.boolean().default(true).describe('Whether to run an instant query (default) or range query'),
  start: z.string().optional().describe('Start time for range queries (RFC3339 or Unix timestamp)'),
  end: z.string().optional().describe('End time for range queries (RFC3339 or Unix timestamp)'),
  step: z.string().optional().describe('Step interval for range queries (e.g., "15s", "1m")'),
});

export const DeployRampDashboardSchema = z.object({
  sensor: z.string().optional().describe('Sensor hostname. If omitted, uses first discovered sensor.'),
  compare: z.string().optional().describe('Build name from baselines.json to compare against'),
  profile: z.string().optional().describe('Profile name (e.g., "All/No", "Base/Yes"). Required if compare is set.'),
});

export const ListBaselinesSchema = z.object({
  sensorType: z.string().optional().describe('Sensor type to filter by (e.g., "AP1100", "AP3000"). If omitted, lists all builds.'),
});

export const SensorPerformanceVerdictSchema = z.object({
  sensor: z.string().optional().describe('Sensor hostname. If omitted, uses first discovered sensor.'),
  build: z.string().min(1).describe('Build name from baselines.json to compare against'),
  profile: z.string().min(1).describe('Profile name (e.g., "All/No", "Base/Yes")'),
});

export const AnnotateTestSchema = z.object({
  sensor: z.string().optional().describe('Sensor hostname. If omitted, uses first discovered sensor.'),
  text: z.string().min(1).describe('Annotation text (e.g., "Test started at 10 Gbps")'),
  tags: z.array(z.string()).default(['ramp-result']).describe('Tags for the annotation'),
});
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit src/ramp-types.ts 2>&1 || node -e "import('./src/ramp-types.ts')" 2>&1`

This file has no dependencies beyond zod, so compilation check is straightforward. Since the project uses tsx, verify with:

Run: `cd /Users/russellsmith/Projects/mcp-servers/grafana-mcp && ./node_modules/.bin/tsx -e "import './src/ramp-types.js'; console.log('ramp-types OK')"`
Expected: `ramp-types OK`

**Step 3: Commit**

```bash
git add src/ramp-types.ts
git commit -m "feat: add RAMP type definitions and Zod schemas"
```

---

### Task 2: Create RampService — sensor discovery

**Files:**
- Create: `src/services/ramp.ts`

**Step 1: Create ramp service with discovery logic**

```typescript
// src/services/ramp.ts
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { GrafanaHttpClient } from '../http-client.js';
import {
  SensorInfo,
  MetricSnapshot,
  BaselineData,
  BaselineEntry,
  Verdict,
  VerdictLevel,
  MetricDelta,
} from '../ramp-types.js';

// PromQL queries for sensor_status
const METRIC_QUERIES = {
  gbps: 'sum(rate(corelight_monitor_port_bytes[5m])) * 8 / 1e9',
  kpps: 'sum(rate(corelight_monitor_port_packets[5m])) / 1e3',
  klogps: 'sum(rate(zeek_log_writer_writes_total[5m])) / 1e3',
  nicDropsPerSec: 'sum(rate(napatech_stat_port_ext_drop_overflow_packets[5m]))',
  zeekDropsPerSec: 'sum(rate(corelight_monitor_pkts_dropped_total[5m]))',
  maxWorkerCpu: 'max(sum by (groupname)(rate(namedprocess_namegroup_cpu_seconds_total{groupname=~"zeek-worker-.*"}[5m])))',
  bufferUtilPct: 'sum(napatech_stream_host_buffer_enqueued_bytes - napatech_stream_host_buffer_dequeued_bytes) / clamp_min(sum(napatech_stream_host_buffer_total_bytes), 1) * 100',
  systemMemoryPct: 'node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes * 100',
} as const;

// Sensor auth comes from RAMP_SENSOR_TOKEN env var (format: "user:password")

export class RampService {
  private sensors = new Map<string, SensorInfo>();
  private clients = new Map<string, GrafanaHttpClient>();
  private rampProjectPath: string;
  private scanPorts: { start: number; end: number };

  constructor(options?: {
    rampProjectPath?: string;
    scanPorts?: string;
  }) {
    this.rampProjectPath = options?.rampProjectPath
      || process.env.RAMP_PROJECT_PATH
      || path.join(process.env.HOME || '~', 'Projects', 'ramp');
    const portRange = options?.scanPorts || process.env.RAMP_SCAN_PORTS || '8080-8099';
    const [start, end] = portRange.split('-').map(Number);
    this.scanPorts = { start, end };
  }

  /**
   * Scan ports for SSH-tunneled sensor Grafana instances
   */
  async discoverSensors(): Promise<SensorInfo[]> {
    const discovered: SensorInfo[] = [];

    // Find SSH listeners on the port range
    const activePorts = this.findSshTunnelPorts();

    for (const port of activePorts) {
      try {
        const sensor = await this.probeSensorGrafana(port);
        if (sensor) {
          this.sensors.set(sensor.hostname, sensor);
          // Create a dedicated HTTP client for this sensor
          if (!this.clients.has(sensor.hostname)) {
            this.clients.set(
              sensor.hostname,
              this.createSensorClient(sensor),
            );
          }
          discovered.push(sensor);
        }
      } catch (_error) {
        // Port is in range but not a sensor Grafana — skip
      }
    }

    return discovered;
  }

  /**
   * Use lsof to find SSH listeners on the scan port range
   */
  private findSshTunnelPorts(): number[] {
    const ports: number[] = [];
    try {
      const output = execSync(
        `lsof -iTCP -sTCP:LISTEN -nP 2>/dev/null | grep ssh`,
        { encoding: 'utf-8', timeout: 5000 },
      );
      for (const line of output.split('\n')) {
        const match = line.match(/:(\d+)\s/);
        if (match) {
          const port = parseInt(match[1], 10);
          if (port >= this.scanPorts.start && port <= this.scanPorts.end) {
            ports.push(port);
          }
        }
      }
    } catch {
      // lsof failed or no SSH listeners — return empty
    }
    return [...new Set(ports)].sort((a, b) => a - b);
  }

  /**
   * Probe a port to check for Grafana and identify the sensor
   */
  private async probeSensorGrafana(port: number): Promise<SensorInfo | null> {
    const grafanaUrl = `http://localhost:${port}/grafana`;
    const token = `${SENSOR_AUTH.username}:${SENSOR_AUTH.password}`;

    // Create a temporary client for probing
    const tempClient = new GrafanaHttpClient({
      GRAFANA_URL: grafanaUrl,
      GRAFANA_TOKEN: token,
      GRAFANA_DEBUG: false,
      GRAFANA_TIMEOUT: 5000,
      GRAFANA_DISABLE_TOOLS: [],
      GRAFANA_TLS_SKIP_VERIFY: false,
    });

    // Health check
    const health = await tempClient.get<{ version?: string }>('/api/health');

    // Find Prometheus datasource UID
    const datasources = await tempClient.get<Array<{ uid: string; type: string }>>('/api/datasources');
    const promDs = datasources.find((ds) => ds.type === 'prometheus');
    const prometheusUid = promDs?.uid || 'prometheus';

    // Get sensor hostname via PromQL
    let hostname = `sensor-${port}`;
    try {
      const result = await tempClient.get<any>(
        `/api/datasources/proxy/uid/${prometheusUid}/api/v1/query`,
        { query: 'max by (nodename) (node_uname_info)' },
      );
      const metric = result?.data?.result?.[0]?.metric;
      if (metric?.nodename) {
        hostname = metric.nodename;
      }
    } catch {
      // Hostname detection failed — use port-based fallback
    }

    return {
      port,
      hostname,
      grafanaUrl,
      prometheusUid,
      grafanaVersion: health.version,
    };
  }

  /**
   * Create a GrafanaHttpClient for a sensor
   */
  private createSensorClient(sensor: SensorInfo): GrafanaHttpClient {
    return new GrafanaHttpClient({
      GRAFANA_URL: sensor.grafanaUrl,
      GRAFANA_TOKEN: `${SENSOR_AUTH.username}:${SENSOR_AUTH.password}`,
      GRAFANA_DEBUG: false,
      GRAFANA_TIMEOUT: 10000,
      GRAFANA_DISABLE_TOOLS: [],
      GRAFANA_TLS_SKIP_VERIFY: false,
    });
  }

  /**
   * Resolve a sensor hostname (or use first available)
   */
  resolveSensor(sensorName?: string): { info: SensorInfo; client: GrafanaHttpClient } {
    if (this.sensors.size === 0) {
      throw new Error(
        `No sensor tunnels found on ports ${this.scanPorts.start}-${this.scanPorts.end}. ` +
        'Set up a tunnel with: ./scripts/grafana-tunnel.sh <sensor-ip>',
      );
    }

    let info: SensorInfo | undefined;
    if (sensorName) {
      // Try exact match first, then prefix match
      info = this.sensors.get(sensorName);
      if (!info) {
        for (const [name, sensor] of this.sensors) {
          if (name.toLowerCase().startsWith(sensorName.toLowerCase())) {
            info = sensor;
            break;
          }
        }
      }
      if (!info) {
        const available = [...this.sensors.keys()].join(', ');
        throw new Error(
          `Sensor "${sensorName}" not found. Available sensors: ${available}`,
        );
      }
    } else {
      info = this.sensors.values().next().value!;
    }

    const client = this.clients.get(info.hostname);
    if (!client) {
      throw new Error(
        `Sensor ${info.hostname} not reachable on port ${info.port}. Is the SSH tunnel active?`,
      );
    }

    return { info, client };
  }

  /**
   * Get live metric snapshot for a sensor
   */
  async getSensorStatus(sensorName?: string): Promise<{ sensor: SensorInfo; metrics: MetricSnapshot }> {
    const { info, client } = this.resolveSensor(sensorName);

    const metrics: Record<string, number> = {};
    const queryPromises = Object.entries(METRIC_QUERIES).map(
      async ([key, query]) => {
        try {
          const result = await client.get<any>(
            `/api/datasources/proxy/uid/${info.prometheusUid}/api/v1/query`,
            { query },
          );
          const value = result?.data?.result?.[0]?.value?.[1];
          metrics[key] = value ? parseFloat(value) : 0;
        } catch {
          metrics[key] = 0;
        }
      },
    );

    await Promise.all(queryPromises);

    return {
      sensor: info,
      metrics: metrics as unknown as MetricSnapshot,
    };
  }

  /**
   * Run arbitrary PromQL query against a sensor's Prometheus
   */
  async querySensorMetric(options: {
    sensor?: string;
    query: string;
    instant?: boolean;
    start?: string;
    end?: string;
    step?: string;
  }): Promise<{ sensor: SensorInfo; result: any }> {
    const { info, client } = this.resolveSensor(options.sensor);

    const endpoint = options.instant !== false ? 'query' : 'query_range';
    const params: Record<string, any> = { query: options.query };

    if (endpoint === 'query_range') {
      if (options.start) params.start = options.start;
      if (options.end) params.end = options.end;
      if (options.step) params.step = options.step;
    }

    const result = await client.get<any>(
      `/api/datasources/proxy/uid/${info.prometheusUid}/api/v1/${endpoint}`,
      params,
    );

    return { sensor: info, result };
  }

  /**
   * Deploy RAMP dashboard to a sensor's Grafana
   */
  async deployRampDashboard(options: {
    sensor?: string;
    compare?: string;
    profile?: string;
  }): Promise<{ sensor: SensorInfo; uid: string; url: string }> {
    const { info, client } = this.resolveSensor(options.sensor);

    const dashboardPath = path.join(
      this.rampProjectPath,
      'dashboards',
      'ramp-performance-analysis.json',
    );

    if (!fs.existsSync(dashboardPath)) {
      throw new Error(
        `Dashboard file not found at ${dashboardPath}. ` +
        `Set RAMP_PROJECT_PATH to the ramp project root.`,
      );
    }

    const dashboardJson = JSON.parse(fs.readFileSync(dashboardPath, 'utf-8'));

    // Patch datasource variable default to the sensor's Prometheus UID
    if (dashboardJson.templating?.list) {
      for (const v of dashboardJson.templating.list) {
        if (v.name === 'datasource' && v.type === 'datasource') {
          v.current = {
            selected: true,
            text: info.prometheusUid,
            value: info.prometheusUid,
          };
        }
      }
    }

    // If comparing against a baseline, patch the dashboard
    if (options.compare) {
      if (!options.profile) {
        throw new Error('Profile is required when comparing against a baseline build.');
      }
      this.patchDashboardWithBaseline(dashboardJson, info, options.compare, options.profile);
    }

    // Remove id so Grafana creates/overwrites
    delete dashboardJson.id;

    const response = await client.post<{ uid: string; url: string; status: string }>(
      '/api/dashboards/db',
      {
        dashboard: dashboardJson,
        overwrite: true,
        message: options.compare
          ? `RAMP dashboard deployed (comparing against ${options.compare})`
          : 'RAMP dashboard deployed',
      },
    );

    return {
      sensor: info,
      uid: response.uid,
      url: `${info.grafanaUrl}${response.url}`,
    };
  }

  /**
   * Patch dashboard JSON to add baseline comparison panels
   */
  private patchDashboardWithBaseline(
    dashboard: any,
    sensor: SensorInfo,
    buildName: string,
    profile: string,
  ): void {
    const baselines = this.loadBaselines();
    const buildData = baselines.data[buildName];
    if (!buildData) {
      throw new Error(
        `Build "${buildName}" not found in baselines.json. Available builds: ${baselines.builds.slice(0, 10).join(', ')}...`,
      );
    }

    // Detect sensor type from hostname (e.g., "ap1100-lab" -> "AP1100")
    const sensorType = this.detectSensorType(sensor.hostname, buildData);
    if (!sensorType) {
      const available = Object.keys(buildData).join(', ');
      throw new Error(
        `Could not match sensor "${sensor.hostname}" to a type. Available types in this build: ${available}`,
      );
    }

    const profileData = buildData[sensorType]?.[profile];
    if (!profileData) {
      const available = Object.keys(buildData[sensorType] || {}).join(', ');
      throw new Error(
        `Profile "${profile}" not found for ${sensorType} in build "${buildName}". Available profiles: ${available}`,
      );
    }

    // Add template variables for comparison info
    if (!dashboard.templating) dashboard.templating = { list: [] };
    dashboard.templating.list.push(
      {
        name: 'compare_build',
        type: 'constant',
        current: { text: buildName, value: buildName },
        hide: 2,
      },
      {
        name: 'compare_profile',
        type: 'constant',
        current: { text: profile, value: profile },
        hide: 2,
      },
    );

    // Shift existing panels down to make room for comparison row
    if (dashboard.panels) {
      for (const panel of dashboard.panels) {
        if (panel.gridPos) {
          panel.gridPos.y += 15;
        }
      }
    }

    // Add comparison row at top
    const comparisonPanels = this.buildComparisonPanels(profileData, sensorType, buildName, profile);
    dashboard.panels = [...comparisonPanels, ...(dashboard.panels || [])];
  }

  /**
   * Build comparison stat panels for baseline overlay
   */
  private buildComparisonPanels(
    baseline: BaselineEntry,
    sensorType: string,
    buildName: string,
    profile: string,
  ): any[] {
    const panels: any[] = [];
    let nextId = 900; // High IDs to avoid collision

    // Info text panel
    panels.push({
      id: nextId++,
      type: 'text',
      title: 'Baseline Comparison',
      gridPos: { h: 3, w: 24, x: 0, y: 0 },
      options: {
        mode: 'markdown',
        content: `### Comparing against: **${buildName}** | ${sensorType} | ${profile}\n` +
          `| Metric | Baseline |\n|--------|----------|\n` +
          `| Gbps | ${baseline.gbps} |\n` +
          `| kpps | ${baseline.kpps} |\n` +
          `| klps | ${baseline.klps} |`,
      },
    });

    // Stat panels for each baseline metric with threshold coloring
    const metricConfigs = [
      { name: 'Gbps vs Baseline', value: baseline.gbps, query: METRIC_QUERIES.gbps },
      { name: 'kpps vs Baseline', value: baseline.kpps, query: METRIC_QUERIES.kpps },
      { name: 'klps vs Baseline', value: baseline.klps, query: METRIC_QUERIES.klogps },
    ];

    let x = 0;
    for (const mc of metricConfigs) {
      panels.push({
        id: nextId++,
        type: 'stat',
        title: mc.name,
        gridPos: { h: 6, w: 8, x, y: 3 },
        targets: [
          {
            expr: mc.query,
            refId: 'A',
            datasource: { uid: '${datasource}', type: 'prometheus' },
          },
        ],
        fieldConfig: {
          defaults: {
            thresholds: {
              mode: 'absolute',
              steps: [
                { color: 'red', value: null },
                { color: 'red', value: mc.value * 0.9 },
                { color: 'yellow', value: mc.value * 0.95 },
                { color: 'green', value: mc.value },
              ],
            },
          },
        },
      });
      x += 8;
    }

    // Verdict panel — drops indicator
    panels.push({
      id: nextId++,
      type: 'stat',
      title: 'Drops',
      gridPos: { h: 6, w: 8, x: 0, y: 9 },
      targets: [
        {
          expr: METRIC_QUERIES.nicDropsPerSec,
          refId: 'A',
          datasource: { uid: '${datasource}', type: 'prometheus' },
        },
      ],
      fieldConfig: {
        defaults: {
          thresholds: {
            mode: 'absolute',
            steps: [
              { color: 'green', value: null },
              { color: 'red', value: 1 },
            ],
          },
        },
      },
    });

    return panels;
  }

  /**
   * Detect sensor type from hostname
   */
  private detectSensorType(hostname: string, buildData: Record<string, any>): string | null {
    const normalizedHost = hostname.toLowerCase();
    for (const sensorType of Object.keys(buildData)) {
      if (normalizedHost.includes(sensorType.toLowerCase())) {
        return sensorType;
      }
    }
    return null;
  }

  /**
   * Load baselines.json from the ramp project
   */
  loadBaselines(): BaselineData {
    const baselinesPath = path.join(
      this.rampProjectPath,
      'dashboards',
      'baselines.json',
    );

    if (!fs.existsSync(baselinesPath)) {
      throw new Error(
        `Baselines file not found at ${baselinesPath}. ` +
        `Set RAMP_PROJECT_PATH to the ramp project root.`,
      );
    }

    return JSON.parse(fs.readFileSync(baselinesPath, 'utf-8'));
  }

  /**
   * List available baseline builds, optionally filtered by sensor type
   */
  listBaselines(sensorType?: string): { builds: string[]; sensorTypes: string[] } {
    const baselines = this.loadBaselines();

    if (sensorType) {
      const upperType = sensorType.toUpperCase();
      const filteredBuilds = baselines.builds.filter((build) => {
        const buildData = baselines.data[build];
        return buildData && Object.keys(buildData).some(
          (st) => st.toUpperCase() === upperType,
        );
      });

      return {
        builds: filteredBuilds,
        sensorTypes: [sensorType],
      };
    }

    // Collect all sensor types across all builds
    const sensorTypes = new Set<string>();
    for (const buildData of Object.values(baselines.data)) {
      for (const st of Object.keys(buildData as Record<string, any>)) {
        sensorTypes.add(st);
      }
    }

    return {
      builds: baselines.builds,
      sensorTypes: [...sensorTypes].sort(),
    };
  }

  /**
   * Compare live metrics against a baseline and return a verdict
   */
  async getPerformanceVerdict(options: {
    sensor?: string;
    build: string;
    profile: string;
  }): Promise<Verdict> {
    const { info } = this.resolveSensor(options.sensor);

    // Get live metrics
    const { metrics } = await this.getSensorStatus(options.sensor);

    // Load baseline
    const baselines = this.loadBaselines();
    const buildData = baselines.data[options.build];
    if (!buildData) {
      throw new Error(`Build "${options.build}" not found in baselines.json`);
    }

    const sensorType = this.detectSensorType(info.hostname, buildData);
    if (!sensorType) {
      throw new Error(
        `Could not match sensor "${info.hostname}" to a type in build "${options.build}"`,
      );
    }

    const baseline = buildData[sensorType]?.[options.profile];
    if (!baseline) {
      throw new Error(
        `Profile "${options.profile}" not found for ${sensorType} in build "${options.build}"`,
      );
    }

    // Calculate deltas
    const deltas: MetricDelta[] = [
      {
        metric: 'Gbps',
        actual: metrics.gbps,
        baseline: baseline.gbps,
        deltaPct: baseline.gbps > 0 ? ((metrics.gbps - baseline.gbps) / baseline.gbps) * 100 : 0,
      },
      {
        metric: 'kpps',
        actual: metrics.kpps,
        baseline: baseline.kpps,
        deltaPct: baseline.kpps > 0 ? ((metrics.kpps - baseline.kpps) / baseline.kpps) * 100 : 0,
      },
      {
        metric: 'klps',
        actual: metrics.klogps,
        baseline: baseline.klps,
        deltaPct: baseline.klps > 0 ? ((metrics.klogps - baseline.klps) / baseline.klps) * 100 : 0,
      },
    ];

    // Determine verdict
    let level: VerdictLevel;
    let summary: string;

    const hasDrops = metrics.nicDropsPerSec > 0 || metrics.zeekDropsPerSec > 0;
    const worstDelta = Math.min(...deltas.map((d) => d.deltaPct));

    if (hasDrops) {
      level = 'FAIL';
      summary = `Drops detected on ${info.hostname}. ` +
        `NIC drops: ${metrics.nicDropsPerSec.toFixed(1)}/s, ` +
        `Zeek drops: ${metrics.zeekDropsPerSec.toFixed(1)}/s.`;
    } else if (worstDelta < -10) {
      level = 'MAJOR REGRESSION';
      const worst = deltas.reduce((a, b) => (a.deltaPct < b.deltaPct ? a : b));
      summary = `${worst.metric} is ${Math.abs(worst.deltaPct).toFixed(1)}% below baseline ` +
        `(${worst.actual.toFixed(2)} vs ${worst.baseline.toFixed(2)}). Severity: P1.`;
    } else if (worstDelta < -5) {
      level = 'MINOR REGRESSION';
      const worst = deltas.reduce((a, b) => (a.deltaPct < b.deltaPct ? a : b));
      summary = `${worst.metric} is ${Math.abs(worst.deltaPct).toFixed(1)}% below baseline ` +
        `(${worst.actual.toFixed(2)} vs ${worst.baseline.toFixed(2)}). Severity: P2.`;
    } else {
      level = 'PASS';
      summary = `All metrics within 5% of baseline for ${options.build} / ${options.profile}.`;
    }

    return {
      level,
      sensor: info.hostname,
      build: options.build,
      profile: options.profile,
      metrics,
      deltas,
      summary,
    };
  }

  /**
   * Add annotation to sensor's Grafana
   */
  async annotateTest(options: {
    sensor?: string;
    text: string;
    tags?: string[];
  }): Promise<{ id: number; sensor: SensorInfo }> {
    const { info, client } = this.resolveSensor(options.sensor);

    const response = await client.post<{ id: number }>('/api/annotations', {
      text: options.text,
      tags: options.tags || ['ramp-result'],
      time: Date.now(),
    });

    return { id: response.id, sensor: info };
  }

  /**
   * Get the number of discovered sensors
   */
  get sensorCount(): number {
    return this.sensors.size;
  }

  /**
   * Get all discovered sensors
   */
  getAllSensors(): SensorInfo[] {
    return [...this.sensors.values()];
  }
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/russellsmith/Projects/mcp-servers/grafana-mcp && ./node_modules/.bin/tsx -e "import './src/services/ramp.js'; console.log('ramp service OK')"`
Expected: `ramp service OK`

**Step 3: Commit**

```bash
git add src/services/ramp.ts
git commit -m "feat: add RampService with sensor discovery, metrics, baselines, and verdicts"
```

---

### Task 3: Create RAMP tool registrations

**Files:**
- Create: `src/tools/ramp.ts`

**Step 1: Create the tools file**

```typescript
// src/tools/ramp.ts
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ToolRegistry } from '../tool-registry.js';
import { RampService } from '../services/ramp.js';
import {
  DiscoverSensorsSchema,
  SensorStatusSchema,
  QuerySensorMetricSchema,
  DeployRampDashboardSchema,
  ListBaselinesSchema,
  SensorPerformanceVerdictSchema,
  AnnotateTestSchema,
} from '../ramp-types.js';

/**
 * Register RAMP-specific MCP tools
 */
export function registerRampTools(
  registry: ToolRegistry,
  rampService: RampService,
) {
  // 1. discover_sensors
  registry.registerTool(
    {
      name: 'discover_sensors',
      description:
        'Scan ports for active SSH-tunneled Corelight sensor Grafana instances. ' +
        'Returns connected sensors with hostname, port, Grafana version, and Prometheus status.',
      inputSchema: zodToJsonSchema(DiscoverSensorsSchema),
    },
    async (_request) => {
      try {
        const sensors = await rampService.discoverSensors();

        if (sensors.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No sensor tunnels found on the configured port range. ' +
                  'Set up a tunnel with: ./scripts/grafana-tunnel.sh <sensor-ip>',
              },
            ],
          };
        }

        const sensorList = sensors
          .map(
            (s) =>
              `- **${s.hostname}** — port ${s.port}, Grafana ${s.grafanaVersion || 'unknown'}, ` +
              `Prometheus UID: ${s.prometheusUid}`,
          )
          .join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `**Discovered ${sensors.length} sensor(s):**\n\n${sensorList}`,
            },
          ],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text', text: `Error discovering sensors: ${msg}` }],
          isError: true,
        };
      }
    },
  );

  // 2. sensor_status
  registry.registerTool(
    {
      name: 'sensor_status',
      description:
        'Get live performance snapshot for a sensor: Gbps, kpps, klogps, drop rates, ' +
        'max worker CPU, buffer utilization, and system memory. Uses 5-min rate smoothing.',
      inputSchema: zodToJsonSchema(SensorStatusSchema),
    },
    async (request) => {
      try {
        const params = SensorStatusSchema.parse(request.params.arguments);
        const { sensor, metrics } = await rampService.getSensorStatus(params.sensor);

        const lines = [
          `**Sensor: ${sensor.hostname}** (port ${sensor.port})`,
          '',
          '| Metric | Value |',
          '|--------|-------|',
          `| Throughput | ${metrics.gbps.toFixed(2)} Gbps |`,
          `| Packets | ${metrics.kpps.toFixed(1)} kpps |`,
          `| Logs | ${metrics.klogps.toFixed(1)} klps |`,
          `| NIC Drops | ${metrics.nicDropsPerSec.toFixed(1)} /s |`,
          `| Zeek Drops | ${metrics.zeekDropsPerSec.toFixed(1)} /s |`,
          `| Max Worker CPU | ${(metrics.maxWorkerCpu * 100).toFixed(1)}% |`,
          `| Buffer Utilization | ${metrics.bufferUtilPct.toFixed(1)}% |`,
          `| System Memory Available | ${metrics.systemMemoryPct.toFixed(1)}% |`,
        ];

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text', text: `Error getting sensor status: ${msg}` }],
          isError: true,
        };
      }
    },
  );

  // 3. query_sensor_metric
  registry.registerTool(
    {
      name: 'query_sensor_metric',
      description:
        'Execute arbitrary PromQL against a sensor\'s Prometheus datasource. ' +
        'Auto-resolves datasource UID and target sensor.',
      inputSchema: zodToJsonSchema(QuerySensorMetricSchema),
    },
    async (request) => {
      try {
        const params = QuerySensorMetricSchema.parse(request.params.arguments);
        const { sensor, result } = await rampService.querySensorMetric({
          sensor: params.sensor,
          query: params.query,
          instant: params.instant,
          start: params.start,
          end: params.end,
          step: params.step,
        });

        if (!result?.data?.result || result.data.result.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No results for query \`${params.query}\` on ${sensor.hostname}`,
              },
            ],
          };
        }

        const resultText = result.data.result
          .map((item: any) => {
            const labels = Object.entries(item.metric || {})
              .map(([k, v]) => `${k}="${v}"`)
              .join(', ');
            if (item.value) {
              return `{${labels}} = ${item.value[1]}`;
            }
            if (item.values) {
              return `{${labels}}:\n${item.values.map((v: any) => `  ${v[1]} @ ${new Date(v[0] * 1000).toISOString()}`).join('\n')}`;
            }
            return JSON.stringify(item);
          })
          .join('\n\n');

        return {
          content: [
            {
              type: 'text',
              text: `**Query results on ${sensor.hostname}:**\n\n` +
                `Query: \`${params.query}\`\n` +
                `Type: ${result.data.resultType}\n\n${resultText}`,
            },
          ],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text', text: `Prometheus query failed: ${msg}` }],
          isError: true,
        };
      }
    },
  );

  // 4. deploy_ramp_dashboard
  registry.registerTool(
    {
      name: 'deploy_ramp_dashboard',
      description:
        'Deploy the RAMP Performance Analysis dashboard to a sensor\'s Grafana. ' +
        'Optionally patch with baseline comparison panels by specifying a build and profile.',
      inputSchema: zodToJsonSchema(DeployRampDashboardSchema),
    },
    async (request) => {
      try {
        const params = DeployRampDashboardSchema.parse(request.params.arguments);
        const result = await rampService.deployRampDashboard({
          sensor: params.sensor,
          compare: params.compare,
          profile: params.profile,
        });

        let text = `**Dashboard deployed to ${result.sensor.hostname}**\n\n` +
          `UID: ${result.uid}\n` +
          `URL: ${result.url}`;

        if (params.compare) {
          text += `\n\nComparing against baseline: **${params.compare}** / ${params.profile}`;
        }

        return {
          content: [{ type: 'text', text }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text', text: `Error deploying dashboard: ${msg}` }],
          isError: true,
        };
      }
    },
  );

  // 5. list_baselines
  registry.registerTool(
    {
      name: 'list_baselines',
      description:
        'List available builds and profiles from baselines.json. ' +
        'Optionally filter by sensor type (e.g., "AP1100", "AP3000").',
      inputSchema: zodToJsonSchema(ListBaselinesSchema),
    },
    async (request) => {
      try {
        const params = ListBaselinesSchema.parse(request.params.arguments);
        const { builds, sensorTypes } = rampService.listBaselines(params.sensorType);

        const text = [
          `**Available Baselines${params.sensorType ? ` for ${params.sensorType}` : ''}**`,
          '',
          `Sensor types: ${sensorTypes.join(', ')}`,
          '',
          `**Builds (${builds.length}):**`,
          ...builds.map((b) => `- ${b}`),
        ].join('\n');

        return {
          content: [{ type: 'text', text }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text', text: `Error listing baselines: ${msg}` }],
          isError: true,
        };
      }
    },
  );

  // 6. sensor_performance_verdict
  registry.registerTool(
    {
      name: 'sensor_performance_verdict',
      description:
        'Compare live sensor metrics against a baseline build and return a structured verdict. ' +
        'Thresholds: <5% = PASS, 5-10% = MINOR REGRESSION (P2), >10% = MAJOR REGRESSION (P1), ' +
        'any drops = FAIL.',
      inputSchema: zodToJsonSchema(SensorPerformanceVerdictSchema),
    },
    async (request) => {
      try {
        const params = SensorPerformanceVerdictSchema.parse(request.params.arguments);
        const verdict = await rampService.getPerformanceVerdict({
          sensor: params.sensor,
          build: params.build,
          profile: params.profile,
        });

        const deltaTable = verdict.deltas
          .map(
            (d) =>
              `| ${d.metric} | ${d.actual.toFixed(2)} | ${d.baseline.toFixed(2)} | ${d.deltaPct >= 0 ? '+' : ''}${d.deltaPct.toFixed(1)}% |`,
          )
          .join('\n');

        const icon = verdict.level === 'PASS' ? 'PASS' :
          verdict.level === 'FAIL' ? 'FAIL' :
          verdict.level === 'MINOR REGRESSION' ? 'MINOR REGRESSION (P2)' :
          'MAJOR REGRESSION (P1)';

        const text = [
          `**Verdict: ${icon}**`,
          '',
          `Sensor: ${verdict.sensor}`,
          `Build: ${verdict.build}`,
          `Profile: ${verdict.profile}`,
          '',
          '| Metric | Actual | Baseline | Delta |',
          '|--------|--------|----------|-------|',
          deltaTable,
          '',
          verdict.summary,
        ].join('\n');

        return {
          content: [{ type: 'text', text }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text', text: `Error computing verdict: ${msg}` }],
          isError: true,
        };
      }
    },
  );

  // 7. annotate_test
  registry.registerTool(
    {
      name: 'annotate_test',
      description:
        'Add a Grafana annotation on a sensor for test events ' +
        '(start/end/result/rate change). Tagged with ramp-result by default.',
      inputSchema: zodToJsonSchema(AnnotateTestSchema),
    },
    async (request) => {
      try {
        const params = AnnotateTestSchema.parse(request.params.arguments);
        const result = await rampService.annotateTest({
          sensor: params.sensor,
          text: params.text,
          tags: params.tags,
        });

        return {
          content: [
            {
              type: 'text',
              text: `Annotation created on ${result.sensor.hostname} (id: ${result.id})`,
            },
          ],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text', text: `Error creating annotation: ${msg}` }],
          isError: true,
        };
      }
    },
  );
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/russellsmith/Projects/mcp-servers/grafana-mcp && ./node_modules/.bin/tsx -e "import './src/tools/ramp.js'; console.log('ramp tools OK')"`
Expected: `ramp tools OK`

**Step 3: Commit**

```bash
git add src/tools/ramp.ts
git commit -m "feat: register 7 RAMP MCP tools (discover, status, query, dashboard, baselines, verdict, annotate)"
```

---

### Task 4: Add 'ramp' to ToolCategory

**Files:**
- Modify: `src/types.ts:21-31`
- Modify: `src/tool-registry.ts:1`
- Modify: `src/config.ts:59-70`

**Step 1: Add 'ramp' to ToolCategory in types.ts**

In `src/types.ts`, add `'ramp'` to the `ToolCategory` union type:

```typescript
// Change line 21-31 from:
export type ToolCategory =
  | 'dashboards'
  | 'datasources'
  | 'prometheus'
  | 'loki'
  | 'alerting'
  | 'incident'
  | 'sift'
  | 'oncall'
  | 'admin'
  | 'navigation';

// To:
export type ToolCategory =
  | 'dashboards'
  | 'datasources'
  | 'prometheus'
  | 'loki'
  | 'alerting'
  | 'incident'
  | 'sift'
  | 'oncall'
  | 'admin'
  | 'navigation'
  | 'ramp';
```

**Step 2: Add 'ramp' to ToolCategory in tool-registry.ts**

In `src/tool-registry.ts`, add `'ramp'` to the `ToolCategory` union type on line 1:

```typescript
// Change from:
export type ToolCategory = 'dashboards' | 'datasources' | 'prometheus' | 'loki' |
  'alerting' | 'incident' | 'sift' | 'oncall' | 'admin' | 'navigation';

// To:
export type ToolCategory = 'dashboards' | 'datasources' | 'prometheus' | 'loki' |
  'alerting' | 'incident' | 'sift' | 'oncall' | 'admin' | 'navigation' | 'ramp';
```

**Step 3: Add 'ramp' to getEnabledToolCategories in config.ts**

In `src/config.ts`, add `'ramp'` to the `allCategories` array:

```typescript
// Change lines 59-70 from:
  const allCategories: ToolCategory[] = [
    'dashboards',
    'datasources',
    'prometheus',
    'loki',
    'alerting',
    'incident',
    'sift',
    'oncall',
    'admin',
    'navigation',
  ];

// To:
  const allCategories: ToolCategory[] = [
    'dashboards',
    'datasources',
    'prometheus',
    'loki',
    'alerting',
    'incident',
    'sift',
    'oncall',
    'admin',
    'navigation',
    'ramp',
  ];
```

**Step 4: Commit**

```bash
git add src/types.ts src/tool-registry.ts src/config.ts
git commit -m "feat: add 'ramp' to ToolCategory across types, registry, and config"
```

---

### Task 5: Wire RAMP service and tools into main.ts

**Files:**
- Modify: `src/main.ts`

**Step 1: Add RAMP imports**

Add at the end of the service imports block (after line 22):

```typescript
import { RampService } from './services/ramp.js';
```

Add at the end of the tool import block (after line 31):

```typescript
import { registerRampTools } from './tools/ramp.js';
```

**Step 2: Create RampService instance**

After the `navigationService` creation (after line 85), add:

```typescript
    const rampService = new RampService();
```

**Step 3: Register RAMP tools**

After the navigation tools registration block (after line 135), add:

```typescript
    if (isToolCategoryEnabled('ramp')) {
      registerRampTools(toolRegistry, rampService);

      // Auto-discover sensors on startup (non-blocking)
      rampService.discoverSensors().then((sensors) => {
        if (sensors.length > 0) {
          console.error(`[INFO] RAMP: Discovered ${sensors.length} sensor(s): ${sensors.map((s) => s.hostname).join(', ')}`);
        } else {
          console.error('[INFO] RAMP: No sensor tunnels detected. Use discover_sensors tool to scan later.');
        }
      }).catch((err) => {
        console.error(`[WARN] RAMP: Sensor discovery failed: ${err instanceof Error ? err.message : err}`);
      });
    }
```

**Step 4: Verify the full server starts**

Run: `cd /Users/russellsmith/Projects/mcp-servers/grafana-mcp && timeout 5 ./node_modules/.bin/tsx src/main.ts 2>&1 || true`
Expected: Should see `[INFO] Grafana MCP Server started` and RAMP discovery log line.

**Step 5: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire RampService and RAMP tools into main entry point with auto-discovery"
```

---

### Task 6: Update .env.example and CLAUDE.md

**Files:**
- Modify: `.env.example`
- Modify: `CLAUDE.md`

**Step 1: Add RAMP env vars to .env.example**

Append to `.env.example`:

```
# Optional: RAMP Integration
# RAMP_PROJECT_PATH=~/Projects/ramp
# RAMP_SCAN_PORTS=8080-8099
```

**Step 2: Update CLAUDE.md**

Add `ramp` to the `GRAFANA_DISABLE_TOOLS` documentation and add RAMP env vars to the Configuration section.

In the `GRAFANA_DISABLE_TOOLS` line, change:
```
dashboards, datasources, prometheus, loki, alerting, incident, sift, oncall, admin, navigation
```
to:
```
dashboards, datasources, prometheus, loki, alerting, incident, sift, oncall, admin, navigation, ramp
```

Add to the Configuration env var list:
```
- `RAMP_PROJECT_PATH` — path to ramp project root for dashboard/baseline files (default: `~/Projects/ramp`)
- `RAMP_SCAN_PORTS` — port range for SSH tunnel auto-discovery (default: `8080-8099`)
```

**Step 3: Commit**

```bash
git add .env.example CLAUDE.md
git commit -m "docs: add RAMP configuration to .env.example and CLAUDE.md"
```

---

### Task 7: Write tests for RampService

**Files:**
- Create: `src/services/ramp.test.ts`

**Step 1: Write unit tests**

```typescript
// src/services/ramp.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RampService } from './ramp.js';

// Mock child_process
vi.mock('child_process', () => ({
  execSync: vi.fn(() => ''),
}));

describe('RampService', () => {
  let service: RampService;

  beforeEach(() => {
    service = new RampService({
      rampProjectPath: '/Users/russellsmith/Projects/ramp',
      scanPorts: '8080-8099',
    });
  });

  describe('constructor', () => {
    it('should accept custom rampProjectPath', () => {
      const s = new RampService({ rampProjectPath: '/tmp/ramp' });
      expect(s).toBeDefined();
    });

    it('should accept custom scanPorts', () => {
      const s = new RampService({ scanPorts: '9000-9010' });
      expect(s).toBeDefined();
    });
  });

  describe('listBaselines', () => {
    it('should return builds and sensor types', () => {
      const result = service.listBaselines();
      expect(result.builds).toBeDefined();
      expect(result.builds.length).toBeGreaterThan(0);
      expect(result.sensorTypes).toBeDefined();
      expect(result.sensorTypes.length).toBeGreaterThan(0);
    });

    it('should filter by sensor type', () => {
      const result = service.listBaselines('AP1100');
      expect(result.sensorTypes).toEqual(['AP1100']);
      expect(result.builds.length).toBeGreaterThan(0);
    });

    it('should return empty for unknown sensor type', () => {
      const result = service.listBaselines('NONEXISTENT');
      expect(result.builds).toEqual([]);
    });
  });

  describe('loadBaselines', () => {
    it('should load baselines.json from ramp project', () => {
      const baselines = service.loadBaselines();
      expect(baselines.builds).toBeDefined();
      expect(baselines.data).toBeDefined();
      expect(Array.isArray(baselines.builds)).toBe(true);
    });

    it('should throw if baselines file not found', () => {
      const badService = new RampService({ rampProjectPath: '/nonexistent' });
      expect(() => badService.loadBaselines()).toThrow('Baselines file not found');
    });
  });

  describe('resolveSensor', () => {
    it('should throw when no sensors discovered', () => {
      expect(() => service.resolveSensor()).toThrow('No sensor tunnels found');
    });

    it('should throw for unknown sensor name', async () => {
      // Force a sensor into the map for testing
      (service as any).sensors.set('test-sensor', {
        port: 8084,
        hostname: 'test-sensor',
        grafanaUrl: 'http://localhost:8084/grafana',
        prometheusUid: 'prometheus',
      });
      (service as any).clients.set('test-sensor', {});

      expect(() => service.resolveSensor('nonexistent')).toThrow('not found');
    });
  });

  describe('sensorCount', () => {
    it('should return 0 when no sensors discovered', () => {
      expect(service.sensorCount).toBe(0);
    });
  });

  describe('getAllSensors', () => {
    it('should return empty array when no sensors discovered', () => {
      expect(service.getAllSensors()).toEqual([]);
    });
  });
});
```

**Step 2: Run the tests**

Run: `cd /Users/russellsmith/Projects/mcp-servers/grafana-mcp && npx vitest run src/services/ramp.test.ts`
Expected: All tests pass.

**Step 3: Commit**

```bash
git add src/services/ramp.test.ts
git commit -m "test: add unit tests for RampService"
```

---

### Task 8: Integration smoke test

**Step 1: Verify the full server starts with RAMP tools registered**

Run: `cd /Users/russellsmith/Projects/mcp-servers/grafana-mcp && GRAFANA_URL=http://localhost:8084/grafana GRAFANA_TOKEN=admin:admin timeout 5 ./node_modules/.bin/tsx src/main.ts 2>&1 || true`

Expected output should include:
- `[INFO] Grafana MCP Server started`
- `[INFO] RAMP:` (either discovered sensors or "no sensor tunnels")
- Tool count should be higher than before (should include the 7 RAMP tools)

**Step 2: Verify all tests still pass**

Run: `cd /Users/russellsmith/Projects/mcp-servers/grafana-mcp && npm run test:run`
Expected: All tests pass.

**Step 3: Verify type checking**

Run: `cd /Users/russellsmith/Projects/mcp-servers/grafana-mcp && npx tsc --noEmit 2>&1 | head -20`
Note: Existing type errors in `core/`, `examples/`, etc. are pre-existing. New files should not add errors.

---

### Summary of Changes

| File | Action | Description |
|------|--------|-------------|
| `src/ramp-types.ts` | Create | SensorInfo, Baseline, Verdict types + 7 Zod schemas |
| `src/services/ramp.ts` | Create | RampService: discovery, metrics, dashboard, baselines, verdicts, annotations |
| `src/tools/ramp.ts` | Create | registerRampTools(): 7 new MCP tools |
| `src/types.ts` | Modify | Add `'ramp'` to ToolCategory union |
| `src/tool-registry.ts` | Modify | Add `'ramp'` to ToolCategory union |
| `src/config.ts` | Modify | Add `'ramp'` to allCategories array |
| `src/main.ts` | Modify | Import & wire RampService + registerRampTools + auto-discovery |
| `.env.example` | Modify | Add RAMP_PROJECT_PATH and RAMP_SCAN_PORTS |
| `CLAUDE.md` | Modify | Document ramp category and RAMP env vars |
| `src/services/ramp.test.ts` | Create | Unit tests for RampService |
