import { GrafanaHttpClient } from "../http-client.js";
import { LokiQueryResult } from "../types.js";

/**
 * Service for querying Loki datasources through Grafana
 */
export class LokiService {
  constructor(private httpClient: GrafanaHttpClient) {}

  /**
   * Execute a Loki query (logs or metrics)
   */
  async query(options: {
    datasourceUid: string;
    query: string;
    start?: string;
    end?: string;
    limit?: number;
    direction?: "forward" | "backward";
    step?: string;
  }): Promise<LokiQueryResult> {
    const {
      datasourceUid,
      query,
      start,
      end,
      limit = 100,
      direction = "backward",
      step,
    } = options;

    // Determine if this is a metric query or log query
    const isMetricQuery = this.isMetricQuery(query);
    const endpoint = isMetricQuery ? "query_range" : "query_range";

    const params: Record<string, any> = {
      query,
      limit,
      direction,
    };

    if (start) params.start = this.formatTime(start);
    if (end) params.end = this.formatTime(end);
    if (step && isMetricQuery) params.step = step;

    return this.httpClient.get<LokiQueryResult>(
      `/api/datasources/proxy/uid/${datasourceUid}/loki/api/v1/${endpoint}`,
      params,
    );
  }

  /**
   * Execute a Loki log query
   */
  async queryLogs(options: {
    datasourceUid: string;
    query: string;
    start?: string;
    end?: string;
    limit?: number;
    direction?: "forward" | "backward";
  }): Promise<LokiQueryResult> {
    return this.query({
      ...options,
    });
  }

  /**
   * Execute a Loki metric query
   */
  async queryMetrics(options: {
    datasourceUid: string;
    query: string;
    start: string;
    end: string;
    step?: string;
  }): Promise<LokiQueryResult> {
    return this.query({
      ...options,
      step:
        options.step || this.calculateDefaultStep(options.start, options.end),
    });
  }

  /**
   * Execute an instant Loki query
   */
  async instantQuery(
    datasourceUid: string,
    query: string,
    time?: string,
    limit = 100,
  ): Promise<LokiQueryResult> {
    const params: Record<string, any> = {
      query,
      limit,
    };

    if (time) params.time = this.formatTime(time);

    return this.httpClient.get<LokiQueryResult>(
      `/api/datasources/proxy/uid/${datasourceUid}/loki/api/v1/query`,
      params,
    );
  }

  /**
   * Get label names
   */
  async getLabelNames(
    datasourceUid: string,
    start?: string,
    end?: string,
  ): Promise<{ data: string[] }> {
    const params: Record<string, any> = {};
    if (start) params.start = this.formatTime(start);
    if (end) params.end = this.formatTime(end);

    return this.httpClient.get(
      `/api/datasources/proxy/uid/${datasourceUid}/loki/api/v1/labels`,
      params,
    );
  }

  /**
   * Get values for a specific label
   */
  async getLabelValues(
    datasourceUid: string,
    labelName: string,
    start?: string,
    end?: string,
    query?: string,
  ): Promise<{ data: string[] }> {
    const params: Record<string, any> = {};
    if (start) params.start = this.formatTime(start);
    if (end) params.end = this.formatTime(end);
    if (query) params.query = query;

    return this.httpClient.get(
      `/api/datasources/proxy/uid/${datasourceUid}/loki/api/v1/label/${encodeURIComponent(labelName)}/values`,
      params,
    );
  }

  /**
   * Get series (streams) information
   */
  async getSeries(
    datasourceUid: string,
    match: string[],
    start?: string,
    end?: string,
  ): Promise<{ data: Array<Record<string, string>> }> {
    const params: Record<string, any> = {
      "match[]": match,
    };

    if (start) params.start = this.formatTime(start);
    if (end) params.end = this.formatTime(end);

    return this.httpClient.get(
      `/api/datasources/proxy/uid/${datasourceUid}/loki/api/v1/series`,
      params,
    );
  }

  /**
   * Get index statistics
   */
  async getIndexStats(
    datasourceUid: string,
    query: string,
    start?: string,
    end?: string,
  ): Promise<any> {
    const params: Record<string, any> = {
      query,
    };

    if (start) params.start = this.formatTime(start);
    if (end) params.end = this.formatTime(end);

    return this.httpClient.get(
      `/api/datasources/proxy/uid/${datasourceUid}/loki/api/v1/index/stats`,
      params,
    );
  }

  /**
   * Get volume (cardinality) statistics
   */
  async getVolumeStats(
    datasourceUid: string,
    query: string,
    start: string,
    end: string,
    step?: string,
  ): Promise<any> {
    const params: Record<string, any> = {
      query,
      start: this.formatTime(start),
      end: this.formatTime(end),
    };

    if (step) params.step = step;

    return this.httpClient.get(
      `/api/datasources/proxy/uid/${datasourceUid}/loki/api/v1/index/volume`,
      params,
    );
  }

  /**
   * Get volume range statistics
   */
  async getVolumeRangeStats(
    datasourceUid: string,
    query: string,
    start: string,
    end: string,
    step?: string,
    limit?: number,
  ): Promise<any> {
    const params: Record<string, any> = {
      query,
      start: this.formatTime(start),
      end: this.formatTime(end),
    };

    if (step) params.step = step;
    if (limit) params.limit = limit;

    return this.httpClient.get(
      `/api/datasources/proxy/uid/${datasourceUid}/loki/api/v1/index/volume_range`,
      params,
    );
  }

  /**
   * Test if a datasource is a Loki datasource
   */
  async isLokiDatasource(datasourceUid: string): Promise<boolean> {
    try {
      await this.httpClient.get(
        `/api/datasources/proxy/uid/${datasourceUid}/loki/api/v1/labels`,
      );
      return true;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Check if query is a metric query (contains aggregation functions)
   */
  private isMetricQuery(query: string): boolean {
    const metricFunctions = [
      "rate",
      "rate_counter",
      "bytes_rate",
      "bytes_over_time",
      "count_over_time",
      "sum_over_time",
      "avg_over_time",
      "max_over_time",
      "min_over_time",
      "stddev_over_time",
      "stdvar_over_time",
      "quantile_over_time",
      "first_over_time",
      "last_over_time",
      "absent_over_time",
    ];

    const aggregationFunctions = [
      "sum",
      "min",
      "max",
      "avg",
      "stddev",
      "stdvar",
      "count",
      "count_values",
      "bottomk",
      "topk",
      "quantile",
    ];

    const allFunctions = [...metricFunctions, ...aggregationFunctions];

    return allFunctions.some(
      (func) => query.includes(`${func}(`) || query.includes(`${func} (`),
    );
  }

  /**
   * Parse LogQL query for validation
   */
  parseQuery(query: string): {
    isValid: boolean;
    error?: string;
    type: "log" | "metric";
  } {
    if (!query || query.trim().length === 0) {
      return { isValid: false, error: "Query is empty", type: "log" };
    }

    // Basic validation
    const openBraces = (query.match(/{/g) || []).length;
    const closeBraces = (query.match(/}/g) || []).length;

    if (openBraces !== closeBraces) {
      return {
        isValid: false,
        error: "Unmatched braces in query",
        type: "log",
      };
    }

    const openParens = (query.match(/\(/g) || []).length;
    const closeParens = (query.match(/\)/g) || []).length;

    if (openParens !== closeParens) {
      return {
        isValid: false,
        error: "Unmatched parentheses in query",
        type: "log",
      };
    }

    const type = this.isMetricQuery(query) ? "metric" : "log";
    return { isValid: true, type };
  }

  /**
   * Format time value for Loki API
   */
  formatTime(time: string | number | Date): string {
    if (typeof time === "string") {
      // If it looks like a Unix timestamp in nanoseconds, return as-is
      if (/^\\d{19}$/.test(time)) {
        return time;
      }

      // If it looks like a Unix timestamp in seconds, convert to nanoseconds
      if (/^\\d{10}$/.test(time)) {
        return (parseInt(time) * 1000000000).toString();
      }

      // Otherwise, try to parse as date and convert
      const date = new Date(time);
      if (!isNaN(date.getTime())) {
        return (date.getTime() * 1000000).toString(); // Convert to nanoseconds
      }

      // Return as-is if we can't parse it
      return time;
    }

    if (typeof time === "number") {
      // Assume it's milliseconds, convert to nanoseconds
      return (time * 1000000).toString();
    }

    if (time instanceof Date) {
      // Convert to nanoseconds
      return (time.getTime() * 1000000).toString();
    }

    return String(time);
  }

  /**
   * Calculate default step for metric queries
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

  /**
   * Build LogQL selector string from labels
   */
  buildSelector(labels: Record<string, string>): string {
    const selectors = Object.entries(labels)
      .map(([key, value]) => `${key}="${value}"`)
      .join(", ");

    return `{${selectors}}`;
  }

  /**
   * Build a basic LogQL query with filters
   */
  buildLogQuery(
    labels: Record<string, string>,
    filters?: string[],
    lineFormat?: string,
  ): string {
    let query = this.buildSelector(labels);

    if (filters && filters.length > 0) {
      query += ` ${filters.join(" ")}`;
    }

    if (lineFormat) {
      query += ` | line_format "${lineFormat}"`;
    }

    return query;
  }

  /**
   * Build a metric query
   */
  buildMetricQuery(
    labels: Record<string, string>,
    metricFunction: string,
    range: string,
    filters?: string[],
  ): string {
    let query = this.buildSelector(labels);

    if (filters && filters.length > 0) {
      query += ` ${filters.join(" ")}`;
    }

    query += ` | ${metricFunction}[${range}]`;

    return query;
  }
}
