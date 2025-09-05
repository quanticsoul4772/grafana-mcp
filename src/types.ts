// Core types for Grafana MCP Server

import { z } from "zod";

// Configuration schema
export const ConfigSchema = z.object({
  GRAFANA_URL: z.string().url("GRAFANA_URL must be a valid URL"),
  GRAFANA_TOKEN: z.string().min(1, "GRAFANA_TOKEN is required"),
  GRAFANA_DEBUG: z.boolean().default(false),
  GRAFANA_TIMEOUT: z.number().int().positive().default(30000),
  GRAFANA_DISABLE_TOOLS: z.array(z.string()).default([]),
  GRAFANA_TLS_CERT_FILE: z.string().optional(),
  GRAFANA_TLS_KEY_FILE: z.string().optional(),
  GRAFANA_TLS_CA_FILE: z.string().optional(),
  GRAFANA_TLS_SKIP_VERIFY: z.boolean().default(false),
});

export type Config = z.infer<typeof ConfigSchema>;

// Tool categories that can be disabled
export type ToolCategory =
  | "dashboards"
  | "datasources"
  | "prometheus"
  | "loki"
  | "alerting"
  | "incident"
  | "sift"
  | "oncall"
  | "admin"
  | "navigation";

// Dashboard types
export interface Dashboard {
  id?: number;
  uid: string;
  title: string;
  tags: string[];
  uri: string;
  url: string;
  folderId?: number;
  folderUid?: string;
  folderTitle?: string;
  folderUrl?: string;
  isStarred?: boolean;
  type: string;
}

export interface DashboardDetail {
  dashboard: {
    id: number;
    uid: string;
    title: string;
    tags: string[];
    timezone: string;
    panels: Panel[];
    time: TimeRange;
    timepicker: any;
    templating: any;
    annotations: any;
    refresh: string;
    schemaVersion: number;
    version: number;
    links: any[];
  };
  meta: {
    type: string;
    canSave: boolean;
    canEdit: boolean;
    canAdmin: boolean;
    canStar: boolean;
    canDelete: boolean;
    slug: string;
    url: string;
    expires: string;
    created: string;
    updated: string;
    updatedBy: string;
    createdBy: string;
    version: number;
    hasAcl: boolean;
    isFolder: boolean;
    folderId: number;
    folderUid: string;
    folderTitle: string;
    folderUrl: string;
    provisioned: boolean;
    provisionedExternalId: string;
  };
}

export interface Panel {
  id: number;
  title: string;
  type: string;
  targets: Target[];
  datasource?: {
    uid: string;
    type: string;
  };
  gridPos: {
    h: number;
    w: number;
    x: number;
    y: number;
  };
}

export interface Target {
  expr?: string; // Prometheus query
  logQL?: string; // Loki query
  queryType?: string;
  refId: string;
  datasource?: {
    uid: string;
    type: string;
  };
}

export interface TimeRange {
  from: string;
  to: string;
}

// Datasource types
export interface Datasource {
  id: number;
  uid: string;
  name: string;
  type: string;
  url: string;
  access: string;
  isDefault: boolean;
  basicAuth: boolean;
  withCredentials: boolean;
  jsonData: Record<string, any>;
  readOnly: boolean;
}

// Prometheus types
export interface PrometheusQueryResult {
  status: string;
  data: {
    resultType: string;
    result: Array<{
      metric: Record<string, string>;
      value?: [number, string];
      values?: Array<[number, string]>;
    }>;
  };
}

export interface PrometheusMetric {
  __name__: string;
  [key: string]: string;
}

// Loki types
export interface LokiQueryResult {
  status: string;
  data: {
    resultType: string;
    result: Array<{
      stream: Record<string, string>;
      values: Array<[string, string]>;
    }>;
  };
}

// Alert types
export interface AlertRule {
  id: number;
  uid: string;
  title: string;
  condition: string;
  data: any[];
  intervalSeconds: number;
  noDataState: string;
  execErrState: string;
  for: string;
  annotations: Record<string, string>;
  labels: Record<string, string>;
  folderUID: string;
  ruleGroup: string;
  orgID: number;
  updated: string;
}

export interface ContactPoint {
  uid: string;
  name: string;
  type: string;
  settings: Record<string, any>;
  disableResolveMessage: boolean;
}

// Incident types (Grafana Incident)
export interface Incident {
  incidentID: string;
  title: string;
  status: string;
  severity: string;
  createdTime: string;
  modifiedTime: string;
  summary: string;
  heroImagePath: string;
  incidentStart: string;
  incidentEnd?: string;
  createdByUser: User;
  assignedUser?: User;
  labels: Label[];
  taskList: Task[];
  fieldValues: FieldValue[];
}

export interface User {
  userID: string;
  name: string;
  photoURL: string;
}

export interface Label {
  labelID: string;
  key: string;
  value: string;
  colorHex: string;
}

export interface Task {
  taskID: string;
  description: string;
  status: string;
  createdTime: string;
  modifiedTime: string;
  assignedUser?: User;
}

export interface FieldValue {
  fieldID: string;
  value: string;
}

// Sift types
export interface SiftInvestigation {
  uuid: string;
  name: string;
  created: string;
  modified: string;
  status: string;
  datasourceUid: string;
  description?: string;
}

export interface SiftAnalysis {
  uuid: string;
  name: string;
  created: string;
  type: string;
  status: string;
  result?: any;
}

// OnCall types
export interface OnCallSchedule {
  id: string;
  name: string;
  type: string;
  slack: {
    channel: string;
    userGroup: string;
  };
  team: string;
  timeZone: string;
}

export interface OnCallShift {
  id: string;
  name: string;
  level: number;
  start: string;
  end: string;
  users: OnCallUser[];
}

export interface OnCallUser {
  id: string;
  email: string;
  username: string;
  role: string;
  timezone: string;
}

export interface OnCallTeam {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
}

// Admin types
export interface Team {
  id: number;
  uid: string;
  name: string;
  email: string;
  avatarUrl: string;
  memberCount: number;
  permission: string;
}

export interface GrafanaUser {
  id: number;
  email: string;
  name: string;
  login: string;
  theme: string;
  orgId: number;
  isGrafanaAdmin: boolean;
  isDisabled: boolean;
  authLabels: string[];
  isExternal: boolean;
  updatedAt: string;
  createdAt: string;
  avatarUrl: string;
}

// Navigation/deeplink types
export interface DeepLink {
  url: string;
  type: "dashboard" | "panel" | "explore";
  title?: string;
}

// Error types
export interface GrafanaError {
  message: string;
  status?: number;
  error?: string;
  details?: any;
}

// HTTP client types
export interface HttpClientConfig {
  baseURL: string;
  timeout: number;
  headers: Record<string, string>;
  debug: boolean;
  tlsConfig?: TLSConfig;
}

export interface TLSConfig {
  certFile?: string;
  keyFile?: string;
  caFile?: string;
  skipVerify: boolean;
}

// Tool parameter schemas
export const SearchDashboardsSchema = z.object({
  query: z.string().optional(),
  tags: z.array(z.string()).optional(),
  starred: z.boolean().optional(),
  folderId: z.number().optional(),
  type: z.string().optional(),
  limit: z.number().int().positive().max(5000).default(1000),
});

export const GetDashboardSchema = z.object({
  uid: z.string().min(1),
});

export const UpdateDashboardSchema = z.object({
  dashboard: z.record(z.any()),
  folderId: z.number().optional(),
  message: z.string().optional(),
  overwrite: z.boolean().default(false),
});

export const GetDatasourceSchema = z.object({
  uid: z.string().min(1),
});

export const GetDatasourceByNameSchema = z.object({
  name: z.string().min(1),
});

export const QueryPrometheusSchema = z.object({
  datasourceUid: z.string().min(1),
  query: z.string().min(1),
  start: z.string().optional(),
  end: z.string().optional(),
  step: z.string().optional(),
  instant: z.boolean().default(false),
});

export const QueryLokiSchema = z.object({
  datasourceUid: z.string().min(1),
  query: z.string().min(1),
  start: z.string().optional(),
  end: z.string().optional(),
  limit: z.number().int().positive().max(5000).default(100),
  direction: z.enum(["forward", "backward"]).default("backward"),
});

export const GenerateDeepLinkSchema = z.object({
  type: z.enum(["dashboard", "panel", "explore"]),
  dashboardUid: z.string().optional(),
  panelId: z.number().optional(),
  datasourceUid: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  refresh: z.string().optional(),
  vars: z.record(z.string()).optional(),
});

export const CreateIncidentSchema = z.object({
  title: z.string().min(1),
  summary: z.string().optional(),
  severity: z.enum(["critical", "high", "medium", "low"]).default("medium"),
  labels: z
    .array(
      z.object({
        key: z.string(),
        value: z.string(),
      }),
    )
    .optional(),
});

export const AddActivityToIncidentSchema = z.object({
  incidentId: z.string().min(1),
  body: z.string().min(1),
  activityKind: z
    .enum(["user_note", "status_change", "severity_change"])
    .default("user_note"),
});
