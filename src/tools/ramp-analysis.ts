import { zodToJsonSchema } from 'zod-to-json-schema';
import { ToolRegistry } from '../tool-registry.js';
import { RampAnalysisService } from '../services/ramp-analysis.js';
import {
  DiagnoseDropsSchema,
  FingerprintRegressionSchema,
  CompareBuildsSchema,
  WatchTestSchema,
  ExploreSensorMetricsSchema,
} from '../ramp-types.js';

export function registerRampAnalysisTools(registry: ToolRegistry, service: RampAnalysisService) {
  // 1. diagnose_drops
  registry.registerTool(
    {
      name: 'diagnose_drops',
      description:
        'Run a comprehensive diagnostic battery against a sensor to identify where drops are occurring and why. ' +
        'Returns drop sources by layer (NIC/Zeek/Suricata), bottleneck classification, and leading indicators.',
      inputSchema: zodToJsonSchema(DiagnoseDropsSchema),
    },
    async (request) => {
      try {
        const params = DiagnoseDropsSchema.parse(request.params.arguments);
        const diagnosis = await service.diagnoseDrops(params);
        const dropLines =
          diagnosis.dropSources.length > 0
            ? diagnosis.dropSources.map(
                (d) => `| ${d.layer.toUpperCase()} | ${d.rate.toFixed(1)} /s | ${d.detail} |`,
              )
            : ['| (none) | 0 | No drops detected |'];
        const indicatorLines = diagnosis.leadingIndicators.map(
          (i) =>
            `| ${i.name} | ${i.value.toFixed(2)} | ${i.threshold} | ${i.status.toUpperCase()} |`,
        );
        const text = [
          `**Drop Diagnosis: ${diagnosis.sensor}**`,
          '',
          '**Drop Sources:**',
          '| Layer | Rate | Detail |',
          '|-------|------|--------|',
          ...dropLines,
          '',
          `**Bottleneck:** ${diagnosis.bottleneck}`,
          '',
          '**Leading Indicators:**',
          '| Indicator | Value | Threshold | Status |',
          '|-----------|-------|-----------|--------|',
          ...indicatorLines,
          '',
          `**Summary:** ${diagnosis.summary}`,
        ].join('\n');
        return { content: [{ type: 'text', text }] };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text', text: `Error diagnosing drops: ${msg}` }],
          isError: true,
        };
      }
    },
  );

  // 2. fingerprint_regression
  registry.registerTool(
    {
      name: 'fingerprint_regression',
      description:
        'Combine performance verdict with live diagnostic data to fingerprint the root cause of a regression.',
      inputSchema: zodToJsonSchema(FingerprintRegressionSchema),
    },
    async (request) => {
      try {
        const params = FingerprintRegressionSchema.parse(request.params.arguments);
        const fp = await service.fingerprintRegression(params);
        const evidenceLines = fp.evidence.map((e) => `- ${e}`);
        const text = [
          `**Regression Fingerprint: ${fp.verdict.sensor}**`,
          '',
          `**Verdict:** ${fp.verdict.level} — ${fp.verdict.summary}`,
          `**Root Cause:** ${fp.rootCause}`,
          '',
          '**Evidence:**',
          ...evidenceLines,
          '',
          `**Recommendation:** ${fp.recommendation}`,
        ].join('\n');
        return { content: [{ type: 'text', text }] };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text', text: `Error: ${msg}` }],
          isError: true,
        };
      }
    },
  );

  // 3. compare_builds
  registry.registerTool(
    {
      name: 'compare_builds',
      description:
        'Compare two firmware builds across all sensor types and profiles using baseline data.',
      inputSchema: zodToJsonSchema(CompareBuildsSchema),
    },
    async (request) => {
      try {
        const params = CompareBuildsSchema.parse(request.params.arguments);
        const comparison = service.compareBuilds(params.buildA, params.buildB);
        const lines = comparison.entries.map(
          (e) =>
            `| ${e.sensorType} | ${e.profile} | ${e.buildAMetrics.gbps.toFixed(1)} | ${e.buildBMetrics.gbps.toFixed(1)} | ${e.deltas.gbps >= 0 ? '+' : ''}${e.deltas.gbps.toFixed(1)}% | ${e.deltas.kpps >= 0 ? '+' : ''}${e.deltas.kpps.toFixed(1)}% | ${e.verdict.toUpperCase()} |`,
        );
        const text = [
          `**Build Comparison: ${comparison.buildA} vs ${comparison.buildB}**`,
          '',
          '| Sensor | Profile | Gbps (A) | Gbps (B) | Delta Gbps | Delta kpps | Verdict |',
          '|--------|---------|----------|----------|------------|------------|---------|',
          ...lines,
          '',
          comparison.summary,
        ].join('\n');
        return { content: [{ type: 'text', text }] };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text', text: `Error: ${msg}` }],
          isError: true,
        };
      }
    },
  );

  // 4. watch_test
  registry.registerTool(
    {
      name: 'watch_test',
      description:
        'Monitor a sensor during a RAMP test, polling metrics at a configurable interval.',
      inputSchema: zodToJsonSchema(WatchTestSchema),
    },
    async (request) => {
      try {
        const params = WatchTestSchema.parse(request.params.arguments);
        const result = await service.watchTest({
          sensor: params.sensor,
          intervalSeconds: params.interval,
          durationSeconds: params.duration,
        });
        const dropEventLines = result.dropEvents.map(
          (e) =>
            `- **${new Date(e.detectedAt).toISOString()}**: Bottleneck=${e.bottleneck}, Gbps before=${e.preDropSnapshot.metrics.gbps.toFixed(1)}, after=${e.dropSnapshot.metrics.gbps.toFixed(1)}`,
        );
        const text = [
          `**Watch Complete: ${result.sensor}**`,
          '',
          `Collected ${result.snapshots.length} snapshots over ${result.duration}s (${result.interval}s interval)`,
          '',
          result.dropEvents.length > 0
            ? `**${result.dropEvents.length} drop event(s) detected:**\n${dropEventLines.join('\n')}`
            : 'No drop events detected during watch period.',
        ].join('\n');
        return { content: [{ type: 'text', text }] };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text', text: `Error: ${msg}` }],
          isError: true,
        };
      }
    },
  );

  // 5. explore_sensor_metrics
  registry.registerTool(
    {
      name: 'explore_sensor_metrics',
      description:
        'List all available Prometheus metric names on a sensor, grouped by subsystem.',
      inputSchema: zodToJsonSchema(ExploreSensorMetricsSchema),
    },
    async (request) => {
      try {
        const params = ExploreSensorMetricsSchema.parse(request.params.arguments);
        const grouped = await service.exploreSensorMetrics(params.sensor);
        const sections = Object.entries(grouped)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(
            ([group, names]) =>
              `**${group}** (${names.length})\n${names.map((n) => `- ${n}`).join('\n')}`,
          );
        const total = Object.values(grouped).reduce((sum, names) => sum + names.length, 0);
        const text = [`**${total} metrics available:**`, '', ...sections].join('\n\n');
        return { content: [{ type: 'text', text }] };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text', text: `Error: ${msg}` }],
          isError: true,
        };
      }
    },
  );
}
