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
        const sensorName = params.sensor || 'default sensor';
        return {
          content: [{ type: 'text', text: `Prometheus query failed on ${sensorName}: ${msg}. Check if the sensor is running a test.` }],
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
