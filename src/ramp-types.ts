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
  suricataDropsPerSec: number;
  maxWorkerCpu: number;
  bufferUtilPct: number;
  systemMemoryPct: number;
  packetLag: number;
  activeConnections: number;
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

export interface TrendEntry {
  build: string;
  gbps: number;
  kpps: number;
  klps: number;
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

export const FleetVerdictSchema = z.object({
  build: z.string().min(1).describe('Build name from baselines.json'),
  profile: z.string().min(1).describe('Profile name (e.g., "NS2/Yes")'),
});

export const SensorTrendSchema = z.object({
  sensorType: z.string().min(1).describe('Sensor type (e.g., "AP3000", "AP5000")'),
  profile: z.string().min(1).describe('Profile name (e.g., "NS2/Yes")'),
});

// --- Result tool schemas ---

export const ListTestRunsSchema = z.object({
  date: z.string().optional().describe('Filter to specific date (YYYY-MM-DD)'),
  sensor: z.string().optional().describe('Filter by sensor name substring'),
});

export const GetTestResultSchema = z.object({
  path: z.string().min(1).describe('Full path to the test run directory'),
});

export const GetTestVitalsSchema = z.object({
  path: z.string().min(1).describe('Full path to the test run directory'),
});
