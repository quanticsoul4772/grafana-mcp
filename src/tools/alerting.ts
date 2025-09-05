import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ToolRegistry } from '../tool-registry.js';
import { AlertingService } from '../services/alerting.js';

/**
 * Register alerting-related MCP tools
 */
export function registerAlertingTools(
  registry: ToolRegistry,
  alertingService: AlertingService,
) {
  // List alert rules
  registry.registerTool(
    {
      name: 'list_alert_rules',
      description: 'List all alert rules in Grafana',
      inputSchema: zodToJsonSchema(
        z.object({
          folderUID: z.string().optional(),
          ruleGroup: z.string().optional(),
        }),
      ),
    },
    async (request) => {
      try {
        const { folderUID, ruleGroup } = request.params.arguments as {
          folderUID?: string;
          ruleGroup?: string;
        };

        let rules = await alertingService.listAlertRules();

        // Filter by folderUID if provided
        if (folderUID) {
          rules = rules.filter((rule) => rule.folderUID === folderUID);
        }

        // Filter by ruleGroup if provided
        if (ruleGroup) {
          rules = rules.filter((rule) => rule.ruleGroup === ruleGroup);
        }

        return {
          content: [
            {
              type: 'text',
              text: `**Alert Rules (${rules.length} total)**\\n\\n${rules
                .map(
                  (rule) =>
                    `**${rule.title}** (${rule.uid})\\n` +
                    `  Folder: ${rule.folderUID}\\n` +
                    `  Rule Group: ${rule.ruleGroup}\\n` +
                    `  Condition: ${rule.condition}\\n` +
                    `  Interval: ${rule.intervalSeconds}s\\n` +
                    `  For: ${rule.for}\\n` +
                    `  No Data State: ${rule.noDataState}\\n` +
                    `  Exec Error State: ${rule.execErrState}\\n` +
                    `  Updated: ${rule.updated}`,
                )
                .join('\\n\\n')}`,
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
              text: `Error listing alert rules: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Get alert rule by UID
  registry.registerTool(
    {
      name: 'get_alert_rule',
      description: 'Get detailed information about a specific alert rule',
      inputSchema: zodToJsonSchema(
        z.object({
          uid: z.string().min(1),
        }),
      ),
    },
    async (request) => {
      try {
        const { uid } = request.params.arguments as { uid: string };
        const rule = await alertingService.getAlertRuleByUid(uid);

        return {
          content: [
            {
              type: 'text',
              text:
                `**Alert Rule: ${rule.title}**\\n\\n` +
                '**Basic Information:**\\n' +
                `- UID: ${rule.uid}\\n` +
                `- Title: ${rule.title}\\n` +
                `- Folder UID: ${rule.folderUID}\\n` +
                `- Rule Group: ${rule.ruleGroup}\\n` +
                `- Org ID: ${rule.orgID}\\n\\n` +
                '**Configuration:**\\n' +
                `- Condition: ${rule.condition}\\n` +
                `- Interval: ${rule.intervalSeconds} seconds\\n` +
                `- For Duration: ${rule.for}\\n` +
                `- No Data State: ${rule.noDataState}\\n` +
                `- Execution Error State: ${rule.execErrState}\\n\\n` +
                '**Metadata:**\\n' +
                `- Updated: ${rule.updated}\\n\\n` +
                `**Labels:**\\n${
                  Object.keys(rule.labels).length > 0
                    ? Object.entries(rule.labels)
                        .map(([key, value]) => `- ${key}: ${value}`)
                        .join('\\n')
                    : 'No labels defined'
                }\\n\\n` +
                `**Annotations:**\\n${
                  Object.keys(rule.annotations).length > 0
                    ? Object.entries(rule.annotations)
                        .map(([key, value]) => `- ${key}: ${value}`)
                        .join('\\n')
                    : 'No annotations defined'
                }\\n\\n` +
                `**Query Data:**\\n${rule.data
                  .map(
                    (query: any, index: number) =>
                      `Query ${index + 1}: ${JSON.stringify(query, null, 2)}`,
                  )
                  .join('\\n\\n')}`,
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
              text: `Error getting alert rule: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Create alert rule
  registry.registerTool(
    {
      name: 'create_alert_rule',
      description: 'Create a new alert rule',
      inputSchema: zodToJsonSchema(
        z.object({
          title: z.string().min(1),
          condition: z.string().min(1),
          data: z.array(z.any()),
          folderUID: z.string().min(1),
          ruleGroup: z.string().min(1),
          intervalSeconds: z.number().default(60),
          forDuration: z.string().default('5m'),
          noDataState: z.enum(['NoData', 'Alerting', 'OK']).default('NoData'),
          execErrState: z.enum(['Alerting', 'OK']).default('Alerting'),
          labels: z.record(z.string()).optional(),
          annotations: z.record(z.string()).optional(),
        }),
      ),
    },
    async (request) => {
      try {
        const params = request.params.arguments as any;
        const result = await alertingService.createAlertRule(params);

        return {
          content: [
            {
              type: 'text',
              text:
                'Alert rule created successfully:\\n\\n' +
                `- UID: ${result.uid}\\n` +
                `- Title: ${result.title}\\n` +
                `- Folder: ${result.folderUID}\\n` +
                `- Rule Group: ${result.ruleGroup}`,
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
              text: `Error creating alert rule: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Update alert rule
  registry.registerTool(
    {
      name: 'update_alert_rule',
      description: 'Update an existing alert rule',
      inputSchema: zodToJsonSchema(
        z.object({
          uid: z.string().min(1),
          title: z.string().optional(),
          condition: z.string().optional(),
          data: z.array(z.any()).optional(),
          intervalSeconds: z.number().optional(),
          forDuration: z.string().optional(),
          noDataState: z.enum(['NoData', 'Alerting', 'OK']).optional(),
          execErrState: z.enum(['Alerting', 'OK']).optional(),
          labels: z.record(z.string()).optional(),
          annotations: z.record(z.string()).optional(),
        }),
      ),
    },
    async (request) => {
      try {
        const params = request.params.arguments as any;
        const result = await alertingService.updateAlertRule(
          params.uid,
          params,
        );

        return {
          content: [
            {
              type: 'text',
              text:
                'Alert rule updated successfully:\\n\\n' +
                `- UID: ${result.uid}\\n` +
                `- Title: ${result.title}\\n` +
                `- Updated: ${result.updated}`,
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
              text: `Error updating alert rule: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Delete alert rule
  registry.registerTool(
    {
      name: 'delete_alert_rule',
      description: 'Delete an alert rule by UID',
      inputSchema: zodToJsonSchema(
        z.object({
          uid: z.string().min(1),
        }),
      ),
    },
    async (request) => {
      try {
        const { uid } = request.params.arguments as { uid: string };
        await alertingService.deleteAlertRule(uid);

        return {
          content: [
            {
              type: 'text',
              text: `Alert rule ${uid} deleted successfully.`,
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
              text: `Error deleting alert rule: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // List contact points
  registry.registerTool(
    {
      name: 'list_contact_points',
      description: 'List all notification contact points',
      inputSchema: zodToJsonSchema(z.object({})),
    },
    async () => {
      try {
        const contactPoints = await alertingService.listContactPoints();

        return {
          content: [
            {
              type: 'text',
              text: `**Contact Points (${contactPoints.length} total)**\\n\\n${contactPoints
                .map(
                  (cp) =>
                    `**${cp.name}** (${cp.uid})\\n` +
                    `  Type: ${cp.type}\\n` +
                    `  Disable Resolve Message: ${cp.disableResolveMessage}\\n` +
                    `  Settings: ${Object.keys(cp.settings).length} configuration items`,
                )
                .join('\\n\\n')}`,
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
              text: `Error listing contact points: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Get contact point
  registry.registerTool(
    {
      name: 'get_contact_point',
      description: 'Get detailed information about a specific contact point',
      inputSchema: zodToJsonSchema(
        z.object({
          uid: z.string().min(1),
        }),
      ),
    },
    async (request) => {
      try {
        const { uid } = request.params.arguments as { uid: string };
        const contactPoint = await alertingService.getContactPointByUid(uid);

        return {
          content: [
            {
              type: 'text',
              text:
                `**Contact Point: ${contactPoint.name}**\\n\\n` +
                `- UID: ${contactPoint.uid}\\n` +
                `- Type: ${contactPoint.type}\\n` +
                `- Disable Resolve Message: ${contactPoint.disableResolveMessage}\\n\\n` +
                `**Settings:**\\n${Object.entries(contactPoint.settings)
                  .map(
                    ([key, value]) =>
                      `- ${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`,
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
              text: `Error getting contact point: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Test contact point
  registry.registerTool(
    {
      name: 'test_contact_point',
      description: 'Send a test notification to a contact point',
      inputSchema: zodToJsonSchema(
        z.object({
          uid: z.string().min(1),
          message: z
            .string()
            .default('Test notification from Grafana MCP Server'),
        }),
      ),
    },
    async (request) => {
      try {
        const { uid, message = 'Test notification from Grafana MCP Server' } =
          request.params.arguments as {
            uid: string;
            message?: string;
          };

        const contactPoint = await alertingService.getContactPointByUid(uid);
        const result = await alertingService.testContactPoint(contactPoint);

        return {
          content: [
            {
              type: 'text',
              text:
                `Test notification sent to contact point ${uid}:\\n\\n` +
                `Status: ${result.status || 'Success'}\\n` +
                `Message: ${message}\\n${
                  result.details
                    ? `Details: ${JSON.stringify(result.details, null, 2)}`
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
              text: `Error testing contact point: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Get alert rule groups
  registry.registerTool(
    {
      name: 'list_alert_rule_groups',
      description: 'List all alert rule groups',
      inputSchema: zodToJsonSchema(
        z.object({
          folderUID: z.string().optional(),
        }),
      ),
    },
    async (request) => {
      try {
        const { folderUID: _folderUID } = request.params.arguments as {
          folderUID?: string;
        };
        const groups = await alertingService.getAlertRuleGroups();

        return {
          content: [
            {
              type: 'text',
              text: `**Alert Rule Groups (${groups.length} total)**\\n\\n${groups
                .map(
                  (group: any) =>
                    `**${group.name}**\\n` +
                    `  Folder: ${group.folderUID}\\n` +
                    `  Interval: ${group.interval}\\n` +
                    `  Rules: ${group.rules.length}`,
                )
                .join('\\n\\n')}`,
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
              text: `Error listing alert rule groups: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
