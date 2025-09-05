import { GrafanaHttpClient } from "../http-client.js";
import { PrometheusQueryResult, PrometheusMetric } from "../types.js";
import { BaseHttpService } from "../core/base-service.js";
import { AsyncResult } from "../core/interfaces.js";

/**
 * Service for querying Prometheus datasources through Grafana
 */
export class PrometheusService extends BaseHttpService {
  constructor(httpClient: GrafanaHttpClient) {
    super('PrometheusService', httpClient, '1.0.0');
  }

  /**
   * Execute a Prometheus query (instant or range)
   */
  async query(options: {
    datasourceUid: string;
    query: string;
    start?: string;
    end?: string;
    step?: string;
    instant?: boolean;
  }): Promise<PrometheusQueryResult> {
    const { datasourceUid, query, start, end, step, instant = false } = options;

    const endpoint = instant ? "query" : "query_range";
    const params: Record<string, any> = { query };

    if (!instant) {
      // Range query parameters
      if (start) params.start = start;
      if (end) params.end = end;
      if (step) params.step = step;
    } else {
      // Instant query can have a time parameter
      if (start) params.time = start;
    }

    return this.httpClient.get<PrometheusQueryResult>(
      `/api/datasources/proxy/uid/${datasourceUid}/api/v1/${endpoint}`,
      params,
    );
  }

  /**
   * Execute an instant Prometheus query
   */
  async instantQuery(
    datasourceUid: string,
    query: string,
    time?: string,
  ): Promise<PrometheusQueryResult> {
    return this.query({
      datasourceUid,
      query,
      start: time,
      instant: true,
    });
  }

  /**
   * Execute a range Prometheus query
   */
  async rangeQuery(options: {
    datasourceUid: string;
    query: string;
    start: string;
    end: string;
    step?: string;
  }): Promise<PrometheusQueryResult> {
    return this.query({
      ...options,
      instant: false,
    });
  }

  /**
   * Get metric metadata
   */
  async getMetricMetadata(
    datasourceUid: string,
    metric?: string,
  ): Promise<Record<string, any[]>> {
    const params = metric ? { metric } : {};
    return this.httpClient.get(
      `/api/datasources/proxy/uid/${datasourceUid}/api/v1/metadata`,
      params,
    );
  }

  /**
   * List all metric names
   */
  async getMetricNames(datasourceUid: string): Promise<{ data: string[] }> {
    return this.httpClient.get(
      `/api/datasources/proxy/uid/${datasourceUid}/api/v1/label/__name__/values`,
    );
  }

  /**
   * List all label names
   */
  async getLabelNames(
    datasourceUid: string,
    match?: string[],
  ): Promise<{ data: string[] }> {
    const params: Record<string, any> = {};
    if (match && match.length > 0) {
      params["match[]"] = match;
    }

    return this.httpClient.get(
      `/api/datasources/proxy/uid/${datasourceUid}/api/v1/labels`,
      params,
    );
  }

  /**
   * List values for a specific label
   */
  async getLabelValues(
    datasourceUid: string,
    labelName: string,
    match?: string[],
  ): Promise<{ data: string[] }> {
    const params: Record<string, any> = {};
    if (match && match.length > 0) {
      params["match[]"] = match;
    }

    return this.httpClient.get(
      `/api/datasources/proxy/uid/${datasourceUid}/api/v1/label/${encodeURIComponent(labelName)}/values`,
      params,
    );
  }

  /**
   * Find series matching label selectors
   */
  async findSeries(
    datasourceUid: string,
    match: string[],
    start?: string,
    end?: string,
  ): Promise<{ data: PrometheusMetric[] }> {
    const params: Record<string, any> = {
      "match[]": match,
    };

    if (start) params.start = start;
    if (end) params.end = end;

    return this.httpClient.get(
      `/api/datasources/proxy/uid/${datasourceUid}/api/v1/series`,
      params,
    );
  }

  /**
   * Get target metadata (info about scrape targets)
   */
  async getTargets(
    datasourceUid: string,
    state?: "active" | "dropped" | "any",
  ): Promise<any> {
    const params = state ? { state } : {};
    return this.httpClient.get(
      `/api/datasources/proxy/uid/${datasourceUid}/api/v1/targets`,
      params,
    );
  }

  /**
   * Get alerting rules
   */
  async getAlertingRules(
    datasourceUid: string,
    type?: "alert" | "record",
  ): Promise<any> {
    const params = type ? { type } : {};
    return this.httpClient.get(
      `/api/datasources/proxy/uid/${datasourceUid}/api/v1/rules`,
      params,
    );
  }

  /**
   * Get alerts
   */
  async getAlerts(datasourceUid: string): Promise<any> {
    return this.httpClient.get(
      `/api/datasources/proxy/uid/${datasourceUid}/api/v1/alerts`,
    );
  }

  /**
   * Get Prometheus configuration
   */
  async getConfig(datasourceUid: string): Promise<any> {
    return this.httpClient.get(
      `/api/datasources/proxy/uid/${datasourceUid}/api/v1/status/config`,
    );
  }

  /**
   * Get Prometheus flags
   */
  async getFlags(datasourceUid: string): Promise<any> {
    return this.httpClient.get(
      `/api/datasources/proxy/uid/${datasourceUid}/api/v1/status/flags`,
    );
  }

  /**
   * Get Prometheus runtime information
   */
  async getRuntimeInfo(datasourceUid: string): Promise<any> {
    return this.httpClient.get(
      `/api/datasources/proxy/uid/${datasourceUid}/api/v1/status/runtimeinfo`,
    );
  }

  /**
   * Get Prometheus build information
   */
  async getBuildInfo(datasourceUid: string): Promise<any> {
    return this.httpClient.get(
      `/api/datasources/proxy/uid/${datasourceUid}/api/v1/status/buildinfo`,
    );
  }

  /**
   * Test if a datasource is a Prometheus datasource
   */
  async isPrometheusDatasource(datasourceUid: string): Promise<boolean> {
    try {
      await this.httpClient.get(
        `/api/datasources/proxy/uid/${datasourceUid}/api/v1/status/config`,
      );
      return true;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Parse Prometheus query for validation
   */
  parseQuery(query: string): { isValid: boolean; error?: string } {
    // Basic validation - could be enhanced with a proper PromQL parser
    if (!query || query.trim().length === 0) {
      return { isValid: false, error: "Query is empty" };
    }

    // Check for some common syntax errors
    const openBraces = (query.match(/{/g) || []).length;
    const closeBraces = (query.match(/}/g) || []).length;

    if (openBraces !== closeBraces) {
      return { isValid: false, error: "Unmatched braces in query" };
    }

    return { isValid: true };
  }

  /**
   * Format time value for Prometheus API
   */
  formatTime(time: string | number | Date): string {
    if (typeof time === "string") {
      // Assume it's already in the correct format or a relative time
      return time;
    }

    if (typeof time === "number") {
      // Unix timestamp
      return String(time);
    }

    if (time instanceof Date) {
      // Convert to Unix timestamp
      return Math.floor(time.getTime() / 1000).toString();
    }

    return String(time);
  }

  /**
   * Calculate default step for range queries
   */
  calculateDefaultStep(start: string, end: string): string {
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    const duration = endTime - startTime;

    // Default to ~250 points
    const points = 250;
    const step = Math.floor(duration / (points * 1000)); // Convert to seconds

    return `${Math.max(step, 15).toString()}s`; // Minimum 15 seconds
  }
}
