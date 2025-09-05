import { z } from 'zod';

/**
 * Common reusable Zod schemas for better type safety and consistency
 */

// Basic identifier schemas
export const UidSchema = z.string().min(1, 'UID cannot be empty');
export const IdSchema = z.number().int().positive();

// Branded types for better type safety
export type DashboardUID = string & { readonly __brand: 'DashboardUID' };
export type DataSourceUID = string & { readonly __brand: 'DataSourceUID' };
export type AlertRuleUID = string & { readonly __brand: 'AlertRuleUID' };
export type FolderUID = string & { readonly __brand: 'FolderUID' };

// Schema factories for branded types
export const createBrandedUidSchema = <T extends string>(brand: T) =>
  z.string().min(1, `${brand} UID cannot be empty`) as unknown as z.ZodType<string & { readonly __brand: T }>;

export const DashboardUIDSchema = createBrandedUidSchema('DashboardUID');
export const DataSourceUIDSchema = createBrandedUidSchema('DataSourceUID');
export const AlertRuleUIDSchema = createBrandedUidSchema('AlertRuleUID');
export const FolderUIDSchema = createBrandedUidSchema('FolderUID');

// Time range schemas
export const TimeRangeSchema = z.object({
  from: z.string().describe("Start time (RFC3339 or relative like '5m')"),
  to: z.string().describe("End time (RFC3339 or relative like 'now')"),
});

export const OptionalTimeRangeSchema = z.object({
  start: z.string().describe('Start time (RFC3339 or Unix timestamp)').optional(),
  end: z.string().describe('End time (RFC3339 or Unix timestamp)').optional(),
});

// Pagination schemas
export const PaginationSchema = z.object({
  page: z.number().int().positive().default(1).describe('Page number (1-based)'),
  limit: z.number().int().positive().max(1000).default(100).describe('Items per page (max 1000)'),
});

export const PerPageSchema = z.object({
  page: z.number().int().positive().default(1),
  perpage: z.number().int().positive().max(1000).default(1000),
});

// Common field schemas
export const TagsSchema = z.array(z.string()).optional().describe('Tags for filtering');
export const FolderSchema = z.string().optional().describe('Folder name or UID');

// Query schemas
export const PromQLQuerySchema = z.string().min(1, 'PromQL query cannot be empty');
export const LogQLQuerySchema = z.string().min(1, 'LogQL query cannot be empty');

// Extended query schemas with validation
export const PrometheusQueryParamsSchema = z.object({
  query: PromQLQuerySchema,
  datasourceUid: DataSourceUIDSchema,
  start: z.string().optional(),
  end: z.string().optional(),
  step: z.string().optional().describe('Query resolution step width'),
});

export const LokiQueryParamsSchema = z.object({
  query: LogQLQuerySchema,
  datasourceUid: DataSourceUIDSchema,
  limit: z.number().int().positive().max(5000).default(1000),
  direction: z.enum(['forward', 'backward']).default('backward'),
  ...OptionalTimeRangeSchema.shape,
});

// Search schemas
export const SearchSchema = z.object({
  query: z.string().optional().describe('Search query string'),
  tags: TagsSchema,
  folder: FolderSchema,
  ...PaginationSchema.shape,
});

// Labels and series schemas
export const LabelMatchersSchema = z.array(z.string()).describe(
  'Label matchers (e.g., ["{job=\\"prometheus\\"}"])',
);

export const LabelsSchema = z.record(z.string()).describe(
  'Labels as key-value pairs (e.g., {"job": "nginx", "level": "error"})',
);

// Advanced query building schemas
export const MetricFiltersSchema = z.record(z.string()).optional().describe(
  'Label filters as key-value pairs',
);

export const PrometheusBuilderSchema = z.object({
  metric: z.string().min(1, 'Base metric name required'),
  filters: MetricFiltersSchema,
  function: z.string().optional().describe('Prometheus function (rate, sum, avg, etc.)'),
  timeWindow: z.string().optional().describe('Time window for functions (e.g., "5m")'),
});

export const LokiBuilderSchema = z.object({
  labels: LabelsSchema,
  filter: z.string().optional().describe('Log line filter pattern'),
  operation: z.enum(['rate', 'count_over_time', 'sum', 'avg', 'min', 'max']).optional(),
  timeWindow: z.string().optional().describe('Time window for operations (e.g., "5m")'),
  filterType: z.enum(['contains', 'regex', 'exact']).default('contains').optional(),
});

// Configuration schemas
export const DatasourceTestSchema = z.object({
  uid: DataSourceUIDSchema,
});

export const DashboardUpdateSchema = z.object({
  dashboard: z.record(z.any()).describe('Full dashboard JSON configuration'),
  folderId: z.number().int().optional().describe('Folder ID (0 for General)'),
  folderUid: FolderUIDSchema.optional(),
  overwrite: z.boolean().default(false).describe('Overwrite existing dashboard'),
  message: z.string().optional().describe('Commit message'),
});

// Alert schemas  
export const AlertRuleSchema = z.object({
  uid: AlertRuleUIDSchema.optional(),
  title: z.string().min(1, 'Alert rule title required'),
  condition: z.string().min(1, 'Alert condition required'),
  data: z.array(z.record(z.any())),
  intervalSeconds: z.number().int().positive().default(60),
  noDataState: z.enum(['NoData', 'Alerting', 'OK']).default('NoData'),
  execErrState: z.enum(['Alerting', 'OK']).default('Alerting'),
  for: z.string().default('5m').describe('Duration before alerting'),
  annotations: z.record(z.string()).optional(),
  labels: z.record(z.string()).optional(),
});

// Validation helpers
export const createValidationError = (field: string, message: string) => ({
  field,
  message,
  code: 'VALIDATION_ERROR' as const,
});

export const validateTimeRange = (start?: string, end?: string) => {
  const errors: ReturnType<typeof createValidationError>[] = [];
  
  if (start && end) {
    const startTime = new Date(start);
    const endTime = new Date(end);
    
    if (isNaN(startTime.getTime())) {
      errors.push(createValidationError('start', 'Invalid start time format'));
    }
    
    if (isNaN(endTime.getTime())) {
      errors.push(createValidationError('end', 'Invalid end time format'));
    }
    
    if (startTime > endTime) {
      errors.push(createValidationError('timeRange', 'Start time must be before end time'));
    }
  }
  
  return errors;
};

// Export commonly used combined schemas
export const CommonSchemas = {
  uid: UidSchema,
  id: IdSchema,
  dashboardUid: DashboardUIDSchema,
  datasourceUid: DataSourceUIDSchema,
  timeRange: TimeRangeSchema,
  optionalTimeRange: OptionalTimeRangeSchema,
  pagination: PaginationSchema,
  perPage: PerPageSchema,
  tags: TagsSchema,
  folder: FolderSchema,
  search: SearchSchema,
  prometheusQuery: PrometheusQueryParamsSchema,
  lokiQuery: LokiQueryParamsSchema,
  prometheusBuilder: PrometheusBuilderSchema,
  lokiBuilder: LokiBuilderSchema,
  dashboardUpdate: DashboardUpdateSchema,
  alertRule: AlertRuleSchema,
} as const;