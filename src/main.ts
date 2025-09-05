#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { config } from "./config.js";
import { GrafanaHttpClient } from "./http-client.js";
import { ToolRegistry } from "./tool-registry.js";

// Import services
import { DashboardService } from "./services/dashboard.js";
import { DatasourceService } from "./services/datasource.js";
import { PrometheusService } from "./services/prometheus.js";
import { LokiService } from "./services/loki.js";
import { AlertingService } from "./services/alerting.js";
import { AdminService } from "./services/admin.js";
import { NavigationService } from "./services/navigation.js";

// Import tool registrations
import { registerDashboardTools } from "./tools/dashboard.js";
import { registerAdminTools } from "./tools/admin.js";
import { registerDatasourceTools } from "./tools/datasource.js";
import { registerPrometheusTools } from "./tools/prometheus.js";
import { registerLokiTools } from "./tools/loki.js";
import { registerAlertingTools } from "./tools/alerting.js";
import { registerNavigationTools } from "./tools/navigation.js";

/**
 * Main entry point for the Grafana MCP Server
 */
async function main() {
  try {
    // Create HTTP client
    const httpClient = new GrafanaHttpClient(config);

    // Create services
    const dashboardService = new DashboardService(httpClient);
    const datasourceService = new DatasourceService(httpClient);
    const prometheusService = new PrometheusService(httpClient);
    const lokiService = new LokiService(httpClient);
    const alertingService = new AlertingService(httpClient);
    const adminService = new AdminService(httpClient);
    const navigationService = new NavigationService(config);

    // Create tool registry
    const toolRegistry = new ToolRegistry();

    // Create MCP server
    const server = new Server(
      {
        name: "grafana-mcp",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    // Track which tools are disabled
    const disabledTools = config.GRAFANA_DISABLE_TOOLS || [];
    const isToolCategoryEnabled = (category: string) =>
      !disabledTools.includes(category);

    // Register tools by category - only register tools that have been converted
    if (isToolCategoryEnabled("dashboards")) {
      registerDashboardTools(toolRegistry, dashboardService);
    }

    if (isToolCategoryEnabled("admin")) {
      registerAdminTools(toolRegistry, adminService);
    }

    if (isToolCategoryEnabled("datasources")) {
      registerDatasourceTools(toolRegistry, datasourceService);
    }

    if (isToolCategoryEnabled("prometheus")) {
      registerPrometheusTools(toolRegistry, prometheusService);
    }

    if (isToolCategoryEnabled("loki")) {
      registerLokiTools(toolRegistry, lokiService);
    }

    if (isToolCategoryEnabled("alerting")) {
      registerAlertingTools(toolRegistry, alertingService);
    }

    if (isToolCategoryEnabled("navigation")) {
      registerNavigationTools(toolRegistry, navigationService);
    }

    // Implement proper MCP request handlers
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (config.GRAFANA_DEBUG) {
        console.error(`[DEBUG] Tool called: ${name} with args:`, args);
      }

      try {
        // Get the handler from the registry
        const handler = toolRegistry.getHandler(name);
        if (!handler) {
          return {
            content: [
              {
                type: "text",
                text: `Tool "${name}" not found`,
              },
            ],
            isError: true,
          };
        }

        // Call the handler with the proper request format
        const result = await handler({ params: { arguments: args } });
        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";
        console.error(`[ERROR] Tool ${name} failed:`, errorMessage);

        return {
          content: [
            {
              type: "text",
              text: `Error executing tool ${name}: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    });

    // Implement list tools handler
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = toolRegistry.getTools().map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }));

      if (config.GRAFANA_DEBUG) {
        console.error(
          `[DEBUG] Available tools: ${tools.map((t) => t.name).join(", ")}`,
        );
      }

      return { tools };
    });

    // Connect to stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Log startup information
    console.error("[INFO] Grafana MCP Server started");
    console.error(`[INFO] Connected to Grafana at: ${config.GRAFANA_URL}`);
    console.error(
      `[INFO] Debug mode: ${config.GRAFANA_DEBUG ? "enabled" : "disabled"}`,
    );
    console.error(`[INFO] Timeout: ${config.GRAFANA_TIMEOUT}ms`);
    console.error(`[INFO] Registered ${toolRegistry.getTools().length} tools`);

    if (disabledTools.length > 0) {
      console.error(
        `[INFO] Disabled tool categories: ${disabledTools.join(", ")}`,
      );
    }
  } catch (error) {
    console.error("[ERROR] Failed to start Grafana MCP Server:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.error("[INFO] Shutting down Grafana MCP Server...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.error("[INFO] Shutting down Grafana MCP Server...");
  process.exit(0);
});

// Start the server
main().catch((error) => {
  console.error("[ERROR] Unhandled error:", error);
  process.exit(1);
});
