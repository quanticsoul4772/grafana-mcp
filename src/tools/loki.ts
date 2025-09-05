import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ToolRegistry } from "../tool-registry.js";
import { LokiService } from "../services/loki.js";
import { QueryLokiSchema } from "../types.js";

/**
 * Register Loki-related MCP tools
 */
export function registerLokiTools(
  registry: ToolRegistry,
  lokiService: LokiService,
) {
  // Query Loki logs
  registry.registerTool(
    {
      name: "query_loki",
      description:
        "Execute a LogQL query against a Loki datasource to search logs",
      inputSchema: zodToJsonSchema(QueryLokiSchema),
    },
    async (request) => {
      try {
        const params = QueryLokiSchema.parse(request.params.arguments);
        const result = await lokiService.query(params);

        if (result.data.result.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No logs found for query: ${params.query}`,
              },
            ],
          };
        }

        const logEntries = result.data.result.flatMap((stream) =>
          stream.values.map(([timestamp, logLine]) => ({
            timestamp: new Date(parseInt(timestamp) / 1000000).toISOString(),
            labels: Object.entries(stream.stream)
              .map(([key, value]) => `${key}="${value}"`)
              .join(", "),
            message: logLine,
          })),
        );

        // Sort by timestamp (newest first)
        logEntries.sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );

        return {
          content: [
            {
              type: "text",
              text:
                "**Loki Query Results**\\n\\n" +
                `Query: \`${params.query}\`\\n` +
                `Datasource: ${params.datasourceUid}\\n` +
                `Log Entries: ${logEntries.length}\\n` +
                `Direction: ${params.direction}\\n\\n${logEntries
                  .slice(0, 50)
                  .map(
                    (entry) =>
                      `**${entry.timestamp}** {${entry.labels}}\\n${entry.message}`,
                  )
                  .join(
                    "\\n\\n",
                  )}${logEntries.length > 50 ? `\\n\\n... and ${logEntries.length - 50} more entries` : ""}`,
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
              text: `Error querying Loki: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Get Loki labels
  registry.registerTool(
    {
      name: "get_loki_labels",
      description: "Get all label names available in a Loki datasource",
      inputSchema: zodToJsonSchema(
        z.object({
          datasourceUid: z.string().describe("The Loki datasource UID"),
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
        const { datasourceUid, start, end } = request.params.arguments as {
          datasourceUid: string;
          start?: string;
          end?: string;
        };

        const labelsResult = await lokiService.getLabelNames(
          datasourceUid,
          start,
          end,
        );
        const labels = labelsResult.data;

        return {
          content: [
            {
              type: "text",
              text: `**Loki Labels (${labels.length} total)**\\n\\n${labels
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
              text: `Error getting Loki labels: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Get Loki label values
  registry.registerTool(
    {
      name: "get_loki_label_values",
      description: "Get all values for a specific label in a Loki datasource",
      inputSchema: zodToJsonSchema(
        z.object({
          datasourceUid: z.string().describe("The Loki datasource UID"),
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
        const { datasourceUid, label, start, end } = request.params
          .arguments as {
          datasourceUid: string;
          label: string;
          start?: string;
          end?: string;
        };

        const valuesResult = await lokiService.getLabelValues(
          datasourceUid,
          label,
          start,
          end,
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
              text: `Error getting Loki label values: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Get Loki series
  registry.registerTool(
    {
      name: "get_loki_series",
      description:
        "Get series (label combinations) matching label selectors from a Loki datasource",
      inputSchema: zodToJsonSchema(
        z.object({
          datasourceUid: z.string().describe("The Loki datasource UID"),
          match: z
            .array(z.string())
            .describe(
              'Series selectors as label matchers (e.g., ["{job=\\"varlogs\\"}"])',
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

        const seriesResult = await lokiService.getSeries(
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
              text: `**Loki Series (${series.length} total)**\\n\\n${series
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
              text: `Error getting Loki series: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Build LogQL query
  registry.registerTool(
    {
      name: "build_logql_query",
      description:
        "Help build a LogQL query with suggestions for log stream selectors and filters",
      inputSchema: zodToJsonSchema(
        z.object({
          labels: z
            .record(z.string())
            .describe(
              'Label selectors as key-value pairs (e.g., {"job": "nginx", "level": "error"})',
            ),
          filter: z
            .string()
            .describe("Log line filter pattern (regex or contains)")
            .optional(),
          operation: z
            .enum(["rate", "count_over_time", "sum", "avg", "min", "max"])
            .describe("LogQL operation/function to apply")
            .optional(),
          timeWindow: z
            .string()
            .describe('Time window for operations (e.g., "5m")')
            .optional(),
          filterType: z
            .enum(["contains", "regex", "exact"])
            .describe("Type of filter to apply")
            .default("contains")
            .optional(),
        }),
      ),
    },
    async (request) => {
      try {
        const {
          labels,
          filter,
          operation,
          timeWindow,
          filterType = "contains",
        } = request.params.arguments as {
          labels: Record<string, string>;
          filter?: string;
          operation?: string;
          timeWindow?: string;
          filterType?: "contains" | "regex" | "exact";
        };

        // Build stream selector
        const streamSelector = Object.entries(labels)
          .map(([key, value]) => `${key}="${value}"`)
          .join(",");

        let query = `{${streamSelector}}`;

        // Add filter
        if (filter) {
          switch (filterType) {
            case "regex":
              query += ` |~ \`${filter}\``;
              break;
            case "exact":
              query += ` |= "${filter}"`;
              break;
            case "contains":
            default:
              query += ` |= "${filter}"`;
              break;
          }
        }

        // Add operation
        if (operation && timeWindow) {
          switch (operation) {
            case "rate":
              query = `rate(${query}[${timeWindow}])`;
              break;
            case "count_over_time":
              query = `count_over_time(${query}[${timeWindow}])`;
              break;
            case "sum":
            case "avg":
            case "min":
            case "max":
              query = `${operation}(rate(${query}[${timeWindow}]))`;
              break;
          }
        }

        return {
          content: [
            {
              type: "text",
              text:
                "**Built LogQL Query:**\\n\\n" +
                `\`${query}\`\\n\\n` +
                "**Query Components:**\\n" +
                `- Stream selector: {${streamSelector}}\\n${
                  filter ? `- Filter: ${filter} (${filterType})\\n` : ""
                }${operation ? `- Operation: ${operation}\\n` : ""}${
                  timeWindow ? `- Time window: ${timeWindow}\\n` : ""
                }\\n**Usage:**\\nCopy this query and use it with the \`query_loki\` tool.\\n\\n` +
                "**LogQL Tips:**\\n" +
                "- Use `|=` for exact string matching\\n" +
                "- Use `|~` for regex matching\\n" +
                "- Use `!=` to exclude strings\\n" +
                "- Use `!~` to exclude regex patterns\\n" +
                '- Chain multiple filters: `{job="nginx"} |= "error" |~ "timeout.*"`',
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
              text: `Error building LogQL query: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Get Loki stats
  registry.registerTool(
    {
      name: "get_loki_stats",
      description:
        "Get statistics about ingestion and query performance from a Loki datasource",
      inputSchema: zodToJsonSchema(
        z.object({
          datasourceUid: z.string().describe("The Loki datasource UID"),
        }),
      ),
    },
    async (request) => {
      try {
        const { datasourceUid } = request.params.arguments as {
          datasourceUid: string;
        };
        const stats = await lokiService.getIndexStats(datasourceUid, "*");

        return {
          content: [
            {
              type: "text",
              text:
                "**Loki Statistics**\\n\\n" +
                `Datasource: ${datasourceUid}\\n\\n` +
                `**Ingestion Stats:**\\n${JSON.stringify(stats, null, 2)}`,
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
              text: `Error getting Loki stats: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
