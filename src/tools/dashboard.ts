import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ToolRegistry } from "../tool-registry.js";
import { DashboardService } from "../services/dashboard.js";
import {
  SearchDashboardsSchema,
  GetDashboardSchema,
  UpdateDashboardSchema,
} from "../types.js";
import { handleToolError } from "../error-handler.js";

/**
 * Register dashboard-related MCP tools
 */
export function registerDashboardTools(
  registry: ToolRegistry,
  dashboardService: DashboardService,
) {
  // Search dashboards
  registry.registerTool(
    {
      name: "search_dashboards",
      description: "Search for dashboards by title, tags, or other metadata",
      inputSchema: zodToJsonSchema(SearchDashboardsSchema),
    },
    async (request) => {
      try {
        const params = SearchDashboardsSchema.parse(request.params.arguments);
        const dashboards = await dashboardService.searchDashboards(params);

        return {
          content: [
            {
              type: "text",
              text: `Found ${dashboards.length} dashboards:\\n\\n${dashboards
                .map(
                  (d) =>
                    `**${d.title}** (${d.uid})\\n` +
                    `  URL: ${d.url}\\n` +
                    `  Tags: ${d.tags.join(", ") || "None"}\\n` +
                    `  Folder: ${d.folderTitle || "General"}\\n` +
                    `  Starred: ${d.isStarred ? "Yes" : "No"}`,
                )
                .join("\\n\\n")}`,
            },
          ],
        };
      } catch (error) {
        return handleToolError(error, "search_dashboards", "search");
      }
    },
  );

  // Get dashboard by UID
  registry.registerTool(
    {
      name: "get_dashboard_by_uid",
      description: "Get full dashboard details using its unique identifier",
      inputSchema: zodToJsonSchema(GetDashboardSchema),
    },
    async (request) => {
      try {
        const { uid } = GetDashboardSchema.parse(request.params.arguments);
        const dashboardDetail = await dashboardService.getDashboardByUid(uid);

        const dashboard = dashboardDetail.dashboard;
        const meta = dashboardDetail.meta;

        return {
          content: [
            {
              type: "text",
              text:
                `**Dashboard: ${dashboard.title}**\\n\\n` +
                "**Basic Info:**\\n" +
                `- UID: ${dashboard.uid}\\n` +
                `- ID: ${dashboard.id}\\n` +
                `- Version: ${dashboard.version}\\n` +
                `- Tags: ${dashboard.tags.join(", ") || "None"}\\n` +
                `- Timezone: ${dashboard.timezone}\\n` +
                `- Refresh: ${dashboard.refresh || "None"}\\n\\n` +
                "**Folder Info:**\\n" +
                `- Folder: ${meta.folderTitle}\\n` +
                `- Folder UID: ${meta.folderUid}\\n\\n` +
                "**Metadata:**\\n" +
                `- Created: ${meta.created}\\n` +
                `- Updated: ${meta.updated}\\n` +
                `- Created by: ${meta.createdBy}\\n` +
                `- Updated by: ${meta.updatedBy}\\n` +
                `- Can Edit: ${meta.canEdit}\\n` +
                `- Can Save: ${meta.canSave}\\n` +
                `- Provisioned: ${meta.provisioned}\\n\\n` +
                `**Panels: ${dashboard.panels.length} panels**\\n${dashboard.panels
                  .map(
                    (panel) =>
                      `- Panel ${panel.id}: "${panel.title}" (${panel.type})`,
                  )
                  .join("\\n")}${
                  dashboard.panels.length > 0
                    ? "\\n\\n**Time Range:**\\n" +
                      `- From: ${dashboard.time?.from}\\n` +
                      `- To: ${dashboard.time?.to}`
                    : ""
                }`,
            },
          ],
        };
      } catch (error) {
        return handleToolError(error, "get_dashboard_by_uid", "get");
      }
    },
  );

  // Update or create dashboard
  registry.registerTool(
    {
      name: "update_dashboard",
      description:
        "Update an existing dashboard or create a new one. Use with caution due to context window limitations.",
      inputSchema: zodToJsonSchema(UpdateDashboardSchema),
    },
    async (request) => {
      try {
        const params = UpdateDashboardSchema.parse(request.params.arguments);
        const result = await dashboardService.updateDashboard(params);

        return {
          content: [
            {
              type: "text",
              text:
                `Dashboard ${params.overwrite ? "updated" : "created"} successfully:\\n\\n` +
                `- Dashboard UID: ${result.uid}\\n` +
                `- Dashboard ID: ${result.id}\\n` +
                `- Version: ${result.version}\\n` +
                `- URL: ${result.url}\\n` +
                `- Status: ${result.status}\\n${
                  params.message ? `- Message: ${params.message}\\n` : ""
                }`,
            },
          ],
        };
      } catch (error) {
        return handleToolError(error, "update_dashboard", "update");
      }
    },
  );

  // Get dashboard panel queries
  registry.registerTool(
    {
      name: "get_dashboard_panel_queries",
      description:
        "Get the title, query string, and datasource information from every panel in a dashboard",
      inputSchema: zodToJsonSchema(GetDashboardSchema),
    },
    async (request) => {
      try {
        const { uid } = GetDashboardSchema.parse(request.params.arguments);
        const panelInfo = await dashboardService.getDashboardPanelQueries(uid);

        return {
          content: [
            {
              type: "text",
              text:
                `**Dashboard Panel Queries: ${panelInfo.title}**\\n\\n` +
                `Dashboard UID: ${panelInfo.uid}\\n` +
                `Total Panels: ${panelInfo.panels.length}\\n\\n${panelInfo.panels
                  .map((panel) => {
                    const queries =
                      panel.queries.length > 0
                        ? panel.queries
                            .map(
                              (q) =>
                                `    - ${q.refId}: ${q.query}${q.datasource ? ` (${q.datasource.type}: ${q.datasource.uid})` : ""}`,
                            )
                            .join("\\n")
                        : "    No queries defined";

                    return (
                      `**Panel ${panel.id}: ${panel.title}**\\n` +
                      `  Type: ${panel.type}\\n${
                        panel.datasource
                          ? `  Default Datasource: ${panel.datasource.type} (${panel.datasource.uid})\\n`
                          : ""
                      }  Queries:\\n${queries}`
                    );
                  })
                  .join("\\n\\n")}`,
            },
          ],
        };
      } catch (error) {
        return handleToolError(error, "get_dashboard_panel_queries", "get");
      }
    },
  );

  // Get dashboard versions
  registry.registerTool(
    {
      name: "get_dashboard_versions",
      description: "Get version history for a dashboard",
      inputSchema: zodToJsonSchema(GetDashboardSchema),
    },
    async (request) => {
      try {
        const { uid } = GetDashboardSchema.parse(request.params.arguments);
        const versions = await dashboardService.getDashboardVersions(uid);

        return {
          content: [
            {
              type: "text",
              text:
                `**Dashboard Versions for ${uid}:**\\n\\n` +
                `Total Versions: ${versions.length}\\n\\n${versions
                  .map(
                    (version) =>
                      `**Version ${version.version}**\\n` +
                      `  Created: ${version.created}\\n` +
                      `  Created by: ${version.createdBy}\\n` +
                      `  Message: ${version.message || "No message"}\\n` +
                      `  Parent Version: ${version.parentVersion || "None"}`,
                  )
                  .join("\\n\\n")}`,
            },
          ],
        };
      } catch (error) {
        return handleToolError(error, "get_dashboard_versions", "get");
      }
    },
  );

  // Restore dashboard version
  registry.registerTool(
    {
      name: "restore_dashboard_version",
      description: "Restore a dashboard to a specific version",
      inputSchema: zodToJsonSchema(
        z.object({
          uid: z.string().min(1),
          version: z.number().int().positive(),
        }),
      ),
    },
    async (request) => {
      try {
        const { uid, version } = request.params.arguments as {
          uid: string;
          version: number;
        };
        const result = await dashboardService.restoreDashboardVersion(
          uid,
          version,
        );

        return {
          content: [
            {
              type: "text",
              text:
                `Dashboard restored to version ${version}:\\n\\n` +
                `- Dashboard UID: ${result.uid}\\n` +
                `- Current Version: ${result.version}\\n` +
                `- Status: ${result.status}`,
            },
          ],
        };
      } catch (error) {
        return handleToolError(error, "restore_dashboard_version", "restore");
      }
    },
  );

  // Delete dashboard
  registry.registerTool(
    {
      name: "delete_dashboard",
      description: "Delete a dashboard by UID",
      inputSchema: zodToJsonSchema(GetDashboardSchema),
    },
    async (request) => {
      try {
        const { uid } = GetDashboardSchema.parse(request.params.arguments);
        await dashboardService.deleteDashboard(uid);

        return {
          content: [
            {
              type: "text",
              text: `Dashboard ${uid} deleted successfully.`,
            },
          ],
        };
      } catch (error) {
        return handleToolError(error, "delete_dashboard", "delete");
      }
    },
  );
}
