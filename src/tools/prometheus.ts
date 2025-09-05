import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ToolRegistry, ToolCategory } from "../tool-registry.js";
import { PrometheusService } from "../services/prometheus.js";
import { QueryPrometheusSchema } from "../types.js";
import { CommonSchemas } from "../common-schemas.js";

/**
 * Register Prometheus-related MCP tools
 */
export function registerPrometheusTools(
  registry: ToolRegistry,
  prometheusService: PrometheusService,
) {
  // Query Prometheus metrics
  registry.registerTool(
    {
      name: "query_prometheus",
      description: "Execute a PromQL query against a Prometheus datasource",
      inputSchema: zodToJsonSchema(QueryPrometheusSchema),
    },
    async (request) => {
      try {
        const params = QueryPrometheusSchema.parse(request.params.arguments);
        const result = await prometheusService.query(params);

        if (result.data.result.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No results found for query: ${params.query}`,
              },
            ],
          };
        }

        const resultText = result.data.result
          .map((item) => {
            if (item.value) {
              // Instant query result
              const metricLabels = Object.entries(item.metric)
                .map(([key, value]) => `${key}="${value}"`)
                .join(", ");
              return `${item.metric.__name__ || "metric"}{${metricLabels}} = ${item.value[1]} @ ${new Date(parseFloat(String(item.value[0])) * 1000).toISOString()}`;
            } else if (item.values) {
              // Range query result
              const metricLabels = Object.entries(item.metric)
                .map(([key, value]) => `${key}="${value}"`)
                .join(", ");
              return `${item.metric.__name__ || "metric"}{${metricLabels}}:\\n${item.values
                .map(
                  (v) =>
                    `  ${v[1]} @ ${new Date(parseFloat(String(v[0])) * 1000).toISOString()}`,
                )
                .join("\\n")}`;
            }
            return "Unknown result format";
          })
          .join("\\n\\n");

        return {
          content: [
            {
              type: "text",
              text:
                "**Prometheus Query Results**\\n\\n" +
                `Query: \`${params.query}\`\\n` +
                `Datasource: ${params.datasourceUid}\\n` +
                `Result Type: ${result.data.resultType}\\n` +
                `Results: ${result.data.result.length}\\n\\n${resultText}`,
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [
            {
              type: "text",
              text: `Error querying Prometheus: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Get Prometheus metadata
  registry.registerTool(
    {
      name: "get_prometheus_metadata",
      description: "Get metadata for all metrics from a Prometheus datasource",
      inputSchema: zodToJsonSchema(
        z.object({
          datasourceUid: z.string().describe("The Prometheus datasource UID"),
          limit: z
            .number()
            .describe("Limit the number of metrics returned")
            .default(100)
            .optional(),
        }),
      ),
    },
    async (request) => {
      try {
        const { datasourceUid, limit = 100 } = request.params.arguments as {
          datasourceUid: string;
          limit?: number;
        };

        const metadata =
          await prometheusService.getMetricMetadata(datasourceUid);

        return {
          content: [
            {
              type: "text",
              text: `**Prometheus Metadata (${Object.keys(metadata).length} metrics)**\\n\\n${Object.entries(
                metadata,
              )
                .slice(0, limit)
                .map(
                  ([metricName, metricData]) =>
                    `**${metricName}**\\n` +
                    `  Type: ${(metricData as any).type || "unknown"}\\n` +
                    `  Help: ${(metricData as any).help || "No description available"}`,
                )
                .join("\\n\\n")}`,
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [
            {
              type: "text",
              text: `Error getting Prometheus metadata: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Get Prometheus labels
  registry.registerTool(
    {
      name: "get_prometheus_labels",
      description: "Get all label names from a Prometheus datasource",
      inputSchema: zodToJsonSchema(
        z.object({
          datasourceUid: z.string().describe("The Prometheus datasource UID"),
          start: z
            .string()
            .describe("Start time (RFC3339 or Unix timestamp)")
            .optional(),
          end: z
            .string()
            .describe("End time (RFC3339 or Unix timestamp)")
            .optional(),
        }),
      ),
    },
    async (request) => {
      try {
        const {
          datasourceUid,
          start: _start,
          end: _end,
        } = request.params.arguments as {
          datasourceUid: string;
          start?: string;
          end?: string;
        };

        const labelsResult =
          await prometheusService.getLabelNames(datasourceUid);
        const labels = labelsResult.data;

        return {
          content: [
            {
              type: "text",
              text: `**Prometheus Labels (${labels.length} total)**\\n\\n${labels
                .map((label) => `- ${label}`)
                .join("\\n")}`,
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [
            {
              type: "text",
              text: `Error getting Prometheus labels: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Get Prometheus label values
  registry.registerTool(
    {
      name: "get_prometheus_label_values",
      description:
        "Get all values for a specific label from a Prometheus datasource",
      inputSchema: zodToJsonSchema(
        z.object({
          datasourceUid: z.string().describe("The Prometheus datasource UID"),
          label: z.string().describe("The label name to get values for"),
          start: z
            .string()
            .describe("Start time (RFC3339 or Unix timestamp)")
            .optional(),
          end: z
            .string()
            .describe("End time (RFC3339 or Unix timestamp)")
            .optional(),
        }),
      ),
    },
    async (request) => {
      try {
        const {
          datasourceUid,
          label,
          start: _start,
          end: _end,
        } = request.params.arguments as {
          datasourceUid: string;
          label: string;
          start?: string;
          end?: string;
        };

        const valuesResult = await prometheusService.getLabelValues(
          datasourceUid,
          label,
        );
        const values = valuesResult.data;

        return {
          content: [
            {
              type: "text",
              text: `**Values for label "${label}" (${values.length} total)**\\n\\n${values
                .map((value) => `- ${value}`)
                .join("\\n")}`,
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [
            {
              type: "text",
              text: `Error getting Prometheus label values: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Get Prometheus series
  registry.registerTool(
    {
      name: "get_prometheus_series",
      description:
        "Find series matching label matchers from a Prometheus datasource",
      inputSchema: zodToJsonSchema(
        z.object({
          datasourceUid: z.string().describe("The Prometheus datasource UID"),
          match: z
            .array(z.string())
            .describe(
              'Series selector as label matchers (e.g., ["{job=\\"prometheus\\"}"])',
            ),
          start: z
            .string()
            .describe("Start time (RFC3339 or Unix timestamp)")
            .optional(),
          end: z
            .string()
            .describe("End time (RFC3339 or Unix timestamp)")
            .optional(),
        }),
      ),
    },
    async (request) => {
      try {
        const { datasourceUid, match, start, end } = request.params
          .arguments as {
          datasourceUid: string;
          match: string[];
          start?: string;
          end?: string;
        };

        const seriesResult = await prometheusService.findSeries(
          datasourceUid,
          match,
          start,
          end,
        );
        const series = seriesResult.data;

        return {
          content: [
            {
              type: "text",
              text: `**Prometheus Series (${series.length} total)**\\n\\n${series
                .map((s) =>
                  Object.entries(s)
                    .map(([key, value]) => `${key}="${value}"`)
                    .join(", "),
                )
                .join("\\n")}`,
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [
            {
              type: "text",
              text: `Error getting Prometheus series: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Build Prometheus query - using enhanced registry and common schemas
  if ('registerExtendedTool' in registry) {
    (registry as any).registerExtendedTool(
      {
        name: "build_prometheus_query",
        description:
          "Help build a Prometheus query with suggestions for metric names and operators",
        inputSchema: zodToJsonSchema(CommonSchemas.prometheusBuilder),
        category: "prometheus" as ToolCategory,
        version: "1.0.0",
        metadata: {
          complexity: "medium",
          cacheableResult: false,
        },
      },
    async (request: { params: { arguments: any } }) => {
      try {
        const {
          metric,
          filters,
          function: func,
          timeWindow,
        } = request.params.arguments as {
          metric: string;
          filters?: Record<string, string>;
          function?: string;
          timeWindow?: string;
        };

        let query = metric;

        // Add filters
        if (filters && Object.keys(filters).length > 0) {
          const filterStr = Object.entries(filters)
            .map(([key, value]) => `${key}="${value}"`)
            .join(",");
          query = `${metric}{${filterStr}}`;
        }

        // Add function
        if (func) {
          if (func === "rate" && timeWindow) {
            query = `rate(${query}[${timeWindow}])`;
          } else if (["sum", "avg", "min", "max", "count"].includes(func)) {
            query = `${func}(${query})`;
          } else {
            query = `${func}(${query})`;
          }
        }

        return {
          content: [
            {
              type: "text",
              text:
                "**Built Prometheus Query:**\\n\\n" +
                `\`${query}\`\\n\\n` +
                "**Query Components:**\\n" +
                `- Base metric: ${metric}\\n${
                  filters ? `- Filters: ${JSON.stringify(filters)}\\n` : ""
                }${func ? `- Function: ${func}\\n` : ""}${
                  timeWindow ? `- Time window: ${timeWindow}\\n` : ""
                }\\n**Usage:**\\nCopy this query and use it with the \`query_prometheus\` tool.`,
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [
            {
              type: "text",
              text: `Error building Prometheus query: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
  }
}
