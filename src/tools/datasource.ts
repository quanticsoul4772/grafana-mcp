import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ToolRegistry } from '../tool-registry.js';
import { DatasourceService } from '../services/datasource.js';
import { GetDatasourceSchema, GetDatasourceByNameSchema } from '../types.js';

/**
 * Register datasource-related MCP tools
 */
export function registerDatasourceTools(
  registry: ToolRegistry,
  datasourceService: DatasourceService,
) {
  // List datasources
  registry.registerTool(
    {
      name: 'list_datasources',
      description: 'List all configured datasources with their details',
      inputSchema: zodToJsonSchema(z.object({})),
    },
    async () => {
      try {
        const datasources = await datasourceService.listDatasources();

        return {
          content: [
            {
              type: 'text',
              text: `**Configured Datasources (${datasources.length} total):**\\n\\n${datasources
                .map(
                  (ds) =>
                    `**${ds.name}** (${ds.type})\\n` +
                    `  - UID: ${ds.uid}\\n` +
                    `  - ID: ${ds.id}\\n` +
                    `  - URL: ${ds.url}\\n` +
                    `  - Access: ${ds.access}\\n` +
                    `  - Default: ${ds.isDefault ? 'Yes' : 'No'}\\n` +
                    `  - Read Only: ${ds.readOnly ? 'Yes' : 'No'}\\n` +
                    `  - Basic Auth: ${ds.basicAuth ? 'Enabled' : 'Disabled'}`,
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
              text: `Error listing datasources: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Get datasource by UID
  registry.registerTool(
    {
      name: 'get_datasource_by_uid',
      description: 'Get detailed information about a datasource using its UID',
      inputSchema: zodToJsonSchema(GetDatasourceSchema),
    },
    async (request) => {
      try {
        const { uid } = GetDatasourceSchema.parse(request.params.arguments);
        const datasource = await datasourceService.getDatasourceByUid(uid);

        return {
          content: [
            {
              type: 'text',
              text:
                `**Datasource Details: ${datasource.name}**\\n\\n` +
                '**Basic Information:**\\n' +
                `- Name: ${datasource.name}\\n` +
                `- Type: ${datasource.type}\\n` +
                `- UID: ${datasource.uid}\\n` +
                `- ID: ${datasource.id}\\n` +
                `- URL: ${datasource.url}\\n\\n` +
                '**Configuration:**\\n' +
                `- Access Mode: ${datasource.access}\\n` +
                `- Default Datasource: ${datasource.isDefault ? 'Yes' : 'No'}\\n` +
                `- Read Only: ${datasource.readOnly ? 'Yes' : 'No'}\\n` +
                `- Basic Authentication: ${datasource.basicAuth ? 'Enabled' : 'Disabled'}\\n` +
                `- With Credentials: ${datasource.withCredentials ? 'Yes' : 'No'}\\n\\n` +
                `**JSON Configuration:**\\n${
                  Object.keys(datasource.jsonData).length > 0
                    ? Object.entries(datasource.jsonData)
                        .map(
                          ([key, value]) =>
                            `- ${key}: ${JSON.stringify(value)}`,
                        )
                        .join('\\n')
                    : 'No additional configuration'
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
              text: `Error getting datasource: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Get datasource by name
  registry.registerTool(
    {
      name: 'get_datasource_by_name',
      description: 'Get detailed information about a datasource using its name',
      inputSchema: zodToJsonSchema(GetDatasourceByNameSchema),
    },
    async (request) => {
      try {
        const { name } = GetDatasourceByNameSchema.parse(
          request.params.arguments,
        );
        const datasource = await datasourceService.getDatasourceByName(name);

        return {
          content: [
            {
              type: 'text',
              text:
                `**Datasource Details: ${datasource.name}**\\n\\n` +
                '**Basic Information:**\\n' +
                `- Name: ${datasource.name}\\n` +
                `- Type: ${datasource.type}\\n` +
                `- UID: ${datasource.uid}\\n` +
                `- ID: ${datasource.id}\\n` +
                `- URL: ${datasource.url}\\n\\n` +
                '**Configuration:**\\n' +
                `- Access Mode: ${datasource.access}\\n` +
                `- Default Datasource: ${datasource.isDefault ? 'Yes' : 'No'}\\n` +
                `- Read Only: ${datasource.readOnly ? 'Yes' : 'No'}\\n` +
                `- Basic Authentication: ${datasource.basicAuth ? 'Enabled' : 'Disabled'}\\n` +
                `- With Credentials: ${datasource.withCredentials ? 'Yes' : 'No'}\\n\\n` +
                `**JSON Configuration:**\\n${
                  Object.keys(datasource.jsonData).length > 0
                    ? Object.entries(datasource.jsonData)
                        .map(
                          ([key, value]) =>
                            `- ${key}: ${JSON.stringify(value)}`,
                        )
                        .join('\\n')
                    : 'No additional configuration'
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
              text: `Error getting datasource: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Test datasource connection
  registry.registerTool(
    {
      name: 'test_datasource_connection',
      description: 'Test the connection to a datasource by UID',
      inputSchema: zodToJsonSchema(GetDatasourceSchema),
    },
    async (request) => {
      try {
        const { uid } = GetDatasourceSchema.parse(request.params.arguments);
        const result = await datasourceService.testDatasourceByUid(uid);

        return {
          content: [
            {
              type: 'text',
              text:
                '**Datasource Connection Test Results:**\\n\\n' +
                `Status: ${result.status || 'Unknown'}\\n` +
                `Message: ${result.message || 'No message provided'}\\n${
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
              text: `Error testing datasource connection: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Get datasources by type
  registry.registerTool(
    {
      name: 'get_datasources_by_type',
      description:
        'Get all datasources of a specific type (e.g., prometheus, loki, mysql)',
      inputSchema: zodToJsonSchema(
        z.object({
          type: z.string().describe('The datasource type to filter by'),
        }),
      ),
    },
    async (request) => {
      try {
        const { type } = request.params.arguments as { type: string };
        const datasources = await datasourceService.getDatasourcesByType(type);

        if (datasources.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No datasources found of type: ${type}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `**${type.charAt(0).toUpperCase() + type.slice(1)} Datasources (${datasources.length} found):**\\n\\n${datasources
                .map(
                  (ds) =>
                    `**${ds.name}**\\n` +
                    `  - UID: ${ds.uid}\\n` +
                    `  - URL: ${ds.url}\\n` +
                    `  - Default: ${ds.isDefault ? 'Yes' : 'No'}\\n` +
                    `  - Access: ${ds.access}`,
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
              text: `Error getting datasources by type: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Get default datasource
  registry.registerTool(
    {
      name: 'get_default_datasource',
      description: 'Get the default datasource for the organization',
      inputSchema: zodToJsonSchema(z.object({})),
    },
    async () => {
      try {
        const datasource = await datasourceService.getDefaultDatasource();

        if (!datasource) {
          return {
            content: [
              {
                type: 'text',
                text: 'No default datasource found in this organization.',
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text:
                `**Default Datasource: ${datasource.name}**\\n\\n` +
                `- Type: ${datasource.type}\\n` +
                `- UID: ${datasource.uid}\\n` +
                `- URL: ${datasource.url}\\n` +
                `- Access: ${datasource.access}`,
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
              text: `Error getting default datasource: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Check if datasource exists
  registry.registerTool(
    {
      name: 'check_datasource_exists',
      description: 'Check if a datasource exists by UID or name',
      inputSchema: zodToJsonSchema(
        z
          .object({
            uid: z.string().describe('The datasource UID to check').optional(),
            name: z
              .string()
              .describe('The datasource name to check')
              .optional(),
          })
          .refine((data) => data.uid || data.name, {
            message: 'Either uid or name must be provided',
          }),
      ),
    },
    async (request) => {
      try {
        const { uid, name } = request.params.arguments as {
          uid?: string;
          name?: string;
        };

        let exists = false;
        let identifier = '';

        if (uid) {
          exists = await datasourceService.datasourceExists(uid);
          identifier = `UID: ${uid}`;
        } else if (name) {
          exists = await datasourceService.datasourceExistsByName(name);
          identifier = `Name: ${name}`;
        }

        return {
          content: [
            {
              type: 'text',
              text: `Datasource with ${identifier} ${exists ? 'exists' : 'does not exist'}.`,
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
              text: `Error checking datasource existence: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
