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

export class RampService {
  private sensors = new Map<string, SensorInfo>();
  private clients = new Map<string, GrafanaHttpClient>();
  private rampProjectPath: string;
  private scanPorts: { start: number; end: number };
  private sensorToken: string;

  constructor(options?: {
    rampProjectPath?: string;
    scanPorts?: string;
    sensorToken?: string;
  }) {
    this.rampProjectPath = options?.rampProjectPath
      ?? process.env.RAMP_PROJECT_PATH
      ?? path.join(process.env.HOME ?? '~', 'Projects', 'ramp');
    const portRange = options?.scanPorts ?? process.env.RAMP_SCAN_PORTS ?? '8080-8099';
    const [start, end] = portRange.split('-').map(Number);
    if (isNaN(start) || isNaN(end) || start > end) {
      throw new Error(`Invalid port range: "${portRange}". Expected format: "start-end" (e.g., "8080-8099")`);
    }
    this.scanPorts = { start, end };
    this.sensorToken = options?.sensorToken
      ?? process.env.RAMP_SENSOR_TOKEN
      ?? 'admin:admin';
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
        'lsof -iTCP -sTCP:LISTEN -nP 2>/dev/null | grep ssh',
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
    // Create a temporary client for probing
    const tempClient = new GrafanaHttpClient({
      GRAFANA_URL: grafanaUrl,
      GRAFANA_TOKEN: this.sensorToken,
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
    const prometheusUid = promDs?.uid ?? 'prometheus';

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
      GRAFANA_TOKEN: this.sensorToken,
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

    const snapshot: MetricSnapshot = {
      gbps: metrics.gbps ?? 0,
      kpps: metrics.kpps ?? 0,
      klogps: metrics.klogps ?? 0,
      nicDropsPerSec: metrics.nicDropsPerSec ?? 0,
      zeekDropsPerSec: metrics.zeekDropsPerSec ?? 0,
      maxWorkerCpu: metrics.maxWorkerCpu ?? 0,
      bufferUtilPct: metrics.bufferUtilPct ?? 0,
      systemMemoryPct: metrics.systemMemoryPct ?? 0,
    };

    return { sensor: info, metrics: snapshot };
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
      if (!options.start || !options.end) {
        throw new Error('start and end are required for range queries (instant: false)');
      }
      params.start = options.start;
      params.end = options.end;
      params.step = options.step ?? '15s';
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
        'Set RAMP_PROJECT_PATH to the ramp project root.',
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
    dashboard.templating ??= { list: [] };
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
    dashboard.panels = [...comparisonPanels, ...(dashboard.panels ?? [])];
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
          '| Metric | Baseline |\n|--------|----------|\n' +
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
        'Set RAMP_PROJECT_PATH to the ramp project root.',
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
      tags: options.tags ?? ['ramp-result'],
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
