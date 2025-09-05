import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ToolRegistry } from '../tool-registry.js';
import { NavigationService } from '../services/navigation.js';
import { GenerateDeepLinkSchema } from '../types.js';

/**
 * Register navigation-related MCP tools
 */
export function registerNavigationTools(
  registry: ToolRegistry,
  navigationService: NavigationService,
) {
  // Generate deeplink
  registry.registerTool(
    {
      name: 'generate_deeplink',
      description:
        'Generate a deeplink URL for Grafana dashboards, panels, or explore view',
      inputSchema: zodToJsonSchema(GenerateDeepLinkSchema),
    },
    async (request) => {
      try {
        const params = GenerateDeepLinkSchema.parse(request.params.arguments);
        const deeplink = navigationService.generateDeepLink(params);

        let description = '';
        switch (params.type) {
          case 'dashboard':
            description = params.dashboardUid
              ? `Dashboard: ${params.dashboardUid}`
              : 'Dashboard (UID required)';
            break;
          case 'panel':
            description = `Panel ${params.panelId} in dashboard ${params.dashboardUid}`;
            break;
          case 'explore':
            description = params.datasourceUid
              ? `Explore view with datasource: ${params.datasourceUid}`
              : 'Explore view';
            break;
        }

        return {
          content: [
            {
              type: 'text',
              text:
                '**Generated Deeplink**\\n\\n' +
                `**Type:** ${params.type}\\n` +
                `**Description:** ${description}\\n` +
                `**URL:** ${deeplink.url}\\n\\n` +
                `**Parameters:**\\n${
                  params.from ? `- From: ${params.from}\\n` : ''
                }${params.to ? `- To: ${params.to}\\n` : ''}${
                  params.refresh ? `- Refresh: ${params.refresh}\\n` : ''
                }${
                  params.vars && Object.keys(params.vars).length > 0
                    ? `- Variables: ${Object.entries(params.vars)
                        .map(([k, v]) => `${k}=${v}`)
                        .join(', ')}\\n`
                    : ''
                }\\n**Usage:**\\nClick or copy this URL to navigate directly to the specified Grafana view.`,
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';
        return {
          content: [
            {
              type: 'text',
              text: `Error generating deeplink: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Generate dashboard URL
  registry.registerTool(
    {
      name: 'generate_dashboard_url',
      description:
        'Generate a URL for a specific dashboard with optional time range and variables',
      inputSchema: zodToJsonSchema(
        z.object({
          dashboardUid: z.string().min(1),
          from: z.string().optional(),
          to: z.string().optional(),
          refresh: z.string().optional(),
          variables: z.record(z.string()).optional(),
          panelId: z.number().optional(),
        }),
      ),
    },
    async (request) => {
      try {
        const params = request.params.arguments as {
          dashboardUid: string;
          from?: string;
          to?: string;
          refresh?: string;
          variables?: Record<string, string>;
          panelId?: number;
        };

        // Use the correct service method name
        const deeplink = navigationService.generateDashboardLink(
          params.dashboardUid,
          {
            panelId: params.panelId,
            from: params.from,
            to: params.to,
            refresh: params.refresh,
            vars: params.variables,
          },
        );

        return {
          content: [
            {
              type: 'text',
              text:
                '**Dashboard URL Generated**\\n\\n' +
                `**Dashboard UID:** ${params.dashboardUid}\\n` +
                `**URL:** ${deeplink.url}\\n\\n` +
                `**Parameters:**\\n${
                  params.from ? `- From: ${params.from}\\n` : ''
                }${params.to ? `- To: ${params.to}\\n` : ''}${
                  params.refresh ? `- Refresh: ${params.refresh}\\n` : ''
                }${
                  params.variables && Object.keys(params.variables).length > 0
                    ? `- Variables: ${Object.entries(params.variables)
                        .map(([k, v]) => `${k}=${v}`)
                        .join(', ')}\\n`
                    : ''
                }${params.panelId ? `- Panel ID: ${params.panelId}\\n` : ''}`,
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';
        return {
          content: [
            {
              type: 'text',
              text: `Error generating dashboard URL: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Generate panel URL
  registry.registerTool(
    {
      name: 'generate_panel_url',
      description:
        'Generate a URL for a specific panel with optional time range',
      inputSchema: zodToJsonSchema(
        z.object({
          dashboardUid: z.string().min(1),
          panelId: z.number(),
          from: z.string().optional(),
          to: z.string().optional(),
          refresh: z.string().optional(),
          variables: z.record(z.string()).optional(),
        }),
      ),
    },
    async (request) => {
      try {
        const params = request.params.arguments as {
          dashboardUid: string;
          panelId: number;
          from?: string;
          to?: string;
          refresh?: string;
          variables?: Record<string, string>;
        };

        // Use the correct service method name
        const deeplink = navigationService.generatePanelLink(
          params.dashboardUid,
          params.panelId,
          {
            from: params.from,
            to: params.to,
            refresh: params.refresh,
            vars: params.variables,
          },
        );

        return {
          content: [
            {
              type: 'text',
              text:
                '**Panel URL Generated**\\n\\n' +
                `**Dashboard UID:** ${params.dashboardUid}\\n` +
                `**Panel ID:** ${params.panelId}\\n` +
                `**URL:** ${deeplink.url}\\n\\n` +
                `**Parameters:**\\n${
                  params.from ? `- From: ${params.from}\\n` : ''
                }${params.to ? `- To: ${params.to}\\n` : ''}${
                  params.refresh ? `- Refresh: ${params.refresh}\\n` : ''
                }${
                  params.variables && Object.keys(params.variables).length > 0
                    ? `- Variables: ${Object.entries(params.variables)
                        .map(([k, v]) => `${k}=${v}`)
                        .join(', ')}\\n`
                    : ''
                }`,
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';
        return {
          content: [
            {
              type: 'text',
              text: `Error generating panel URL: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Generate explore URL
  registry.registerTool(
    {
      name: 'generate_explore_url',
      description:
        'Generate a URL for the Explore view with optional datasource and query',
      inputSchema: zodToJsonSchema(
        z.object({
          datasourceUid: z.string().min(1),
          query: z.string().optional(),
          from: z.string().optional(),
          to: z.string().optional(),
          refresh: z.string().optional(),
          queryType: z.string().optional(),
        }),
      ),
    },
    async (request) => {
      try {
        const params = request.params.arguments as {
          datasourceUid: string;
          query?: string;
          from?: string;
          to?: string;
          refresh?: string;
          queryType?: string;
        };

        // Use the correct service method name
        const deeplink = navigationService.generateExploreLink(
          params.datasourceUid,
          {
            query: params.query,
            from: params.from,
            to: params.to,
            refresh: params.refresh,
            queryType: params.queryType,
          },
        );

        return {
          content: [
            {
              type: 'text',
              text:
                '**Explore URL Generated**\\n\\n' +
                `**URL:** ${deeplink.url}\\n\\n` +
                '**Parameters:**\\n' +
                `- Datasource UID: ${params.datasourceUid}\\n${
                  params.query ? `- Query: ${params.query}\\n` : ''
                }${params.from ? `- From: ${params.from}\\n` : ''}${
                  params.to ? `- To: ${params.to}\\n` : ''
                }${
                  params.refresh ? `- Refresh: ${params.refresh}\\n` : ''
                }${params.queryType ? `- Query Type: ${params.queryType}\\n` : ''}`,
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';
        return {
          content: [
            {
              type: 'text',
              text: `Error generating explore URL: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Generate Prometheus explore URL
  registry.registerTool(
    {
      name: 'generate_prometheus_explore_url',
      description:
        'Generate an Explore URL for Prometheus queries with specific options',
      inputSchema: zodToJsonSchema(
        z.object({
          datasourceUid: z.string().min(1),
          query: z.string().min(1),
          from: z.string().optional(),
          to: z.string().optional(),
          refresh: z.string().optional(),
          step: z.string().optional(),
          range: z.boolean().optional(),
        }),
      ),
    },
    async (request) => {
      try {
        const params = request.params.arguments as {
          datasourceUid: string;
          query: string;
          from?: string;
          to?: string;
          refresh?: string;
          step?: string;
          range?: boolean;
        };

        const deeplink = navigationService.generatePrometheusExploreLink(
          params.datasourceUid,
          params.query,
          {
            from: params.from,
            to: params.to,
            refresh: params.refresh,
            step: params.step,
            range: params.range,
          },
        );

        return {
          content: [
            {
              type: 'text',
              text:
                '**Prometheus Explore URL Generated**\\n\\n' +
                `**URL:** ${deeplink.url}\\n\\n` +
                '**Parameters:**\\n' +
                `- Datasource UID: ${params.datasourceUid}\\n` +
                `- Query: ${params.query}\\n${
                  params.from ? `- From: ${params.from}\\n` : ''
                }${params.to ? `- To: ${params.to}\\n` : ''}${
                  params.refresh ? `- Refresh: ${params.refresh}\\n` : ''
                }${
                  params.step ? `- Step: ${params.step}\\n` : ''
                }- Range Query: ${params.range !== false}\\n`,
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';
        return {
          content: [
            {
              type: 'text',
              text: `Error generating Prometheus explore URL: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Generate Loki explore URL
  registry.registerTool(
    {
      name: 'generate_loki_explore_url',
      description: 'Generate an Explore URL for Loki log queries',
      inputSchema: zodToJsonSchema(
        z.object({
          datasourceUid: z.string().min(1),
          query: z.string().min(1),
          from: z.string().optional(),
          to: z.string().optional(),
          refresh: z.string().optional(),
        }),
      ),
    },
    async (request) => {
      try {
        const params = request.params.arguments as {
          datasourceUid: string;
          query: string;
          from?: string;
          to?: string;
          refresh?: string;
        };

        const deeplink = navigationService.generateLokiExploreLink(
          params.datasourceUid,
          params.query,
          {
            from: params.from,
            to: params.to,
            refresh: params.refresh,
          },
        );

        return {
          content: [
            {
              type: 'text',
              text:
                '**Loki Explore URL Generated**\\n\\n' +
                `**URL:** ${deeplink.url}\\n\\n` +
                '**Parameters:**\\n' +
                `- Datasource UID: ${params.datasourceUid}\\n` +
                `- Query: ${params.query}\\n${
                  params.from ? `- From: ${params.from}\\n` : ''
                }${
                  params.to ? `- To: ${params.to}\\n` : ''
                }${params.refresh ? `- Refresh: ${params.refresh}\\n` : ''}`,
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';
        return {
          content: [
            {
              type: 'text',
              text: `Error generating Loki explore URL: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Get time range presets
  registry.registerTool(
    {
      name: 'get_time_range_presets',
      description: 'Get common time range presets for Grafana',
      inputSchema: zodToJsonSchema(z.object({})),
    },
    async (_request) => {
      try {
        const presets = navigationService.getTimeRangePresets();

        return {
          content: [
            {
              type: 'text',
              text: `**Time Range Presets**\\n\\n${presets
                .map(
                  (preset) =>
                    `**${preset.label}**\\n` +
                    `  From: ${preset.from}\\n` +
                    `  To: ${preset.to}\\n`,
                )
                .join('\\n')}`,
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';
        return {
          content: [
            {
              type: 'text',
              text: `Error getting time range presets: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Validate time range
  registry.registerTool(
    {
      name: 'validate_time_range',
      description: 'Validate a time range for Grafana usage',
      inputSchema: zodToJsonSchema(
        z.object({
          from: z.string().min(1),
          to: z.string().min(1),
        }),
      ),
    },
    async (request) => {
      try {
        const { from, to } = request.params.arguments as {
          from: string;
          to: string;
        };
        const validation = navigationService.validateTimeRange(from, to);

        return {
          content: [
            {
              type: 'text',
              text:
                '**Time Range Validation**\\n\\n' +
                `**From:** ${from}\\n` +
                `**To:** ${to}\\n` +
                `**Valid:** ${validation.isValid ? 'Yes' : 'No'}\\n${
                  validation.error ? `**Error:** ${validation.error}\\n` : ''
                }${
                  validation.isValid
                    ? '\\n**Parsed Times:**\\n' +
                      `- From: ${navigationService.parseTimeRange(from, to).from}\\n` +
                      `- To: ${navigationService.parseTimeRange(from, to).to}\\n`
                    : ''
                }`,
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';
        return {
          content: [
            {
              type: 'text',
              text: `Error validating time range: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
