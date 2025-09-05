import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ToolRegistry } from "../tool-registry.js";
import { AdminService } from "../services/admin.js";

/**
 * Register admin-related MCP tools
 */
export function registerAdminTools(
  registry: ToolRegistry,
  adminService: AdminService,
) {
  // List teams
  registry.registerTool(
    {
      name: "list_teams",
      description: "List all teams in the organization",
      inputSchema: zodToJsonSchema(
        z.object({
          page: z.number().int().positive().default(1),
          perpage: z.number().int().positive().max(1000).default(1000),
        }),
      ),
    },
    async (request) => {
      try {
        const params = request.params.arguments as {
          page?: number;
          perpage?: number;
        };
        const result = await adminService.listTeams(
          params.page || 1,
          params.perpage || 1000,
        );

        return {
          content: [
            {
              type: "text",
              text: `**Teams (${result.totalCount} total)**\\n\\n${result.teams
                .map(
                  (team) =>
                    `**${team.name}** (${team.uid})\\n` +
                    `  ID: ${team.id}\\n` +
                    `  Email: ${team.email}\\n` +
                    `  Members: ${team.memberCount}\\n` +
                    `  Permission: ${team.permission}`,
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
              text: `Error listing teams: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Get team by UID
  registry.registerTool(
    {
      name: "get_team_by_uid",
      description: "Get team details by UID",
      inputSchema: zodToJsonSchema(
        z.object({
          uid: z.string().min(1),
        }),
      ),
    },
    async (request) => {
      try {
        const { uid } = request.params.arguments as { uid: string };
        const team = await adminService.getTeamByUid(uid);

        return {
          content: [
            {
              type: "text",
              text:
                `**Team: ${team.name}**\\n\\n` +
                `- UID: ${team.uid}\\n` +
                `- ID: ${team.id}\\n` +
                `- Email: ${team.email}\\n` +
                `- Members: ${team.memberCount}\\n` +
                `- Permission: ${team.permission}\\n` +
                `- Avatar URL: ${team.avatarUrl}`,
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
              text: `Error getting team: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // List users
  registry.registerTool(
    {
      name: "list_users",
      description: "List all users in the organization",
      inputSchema: zodToJsonSchema(
        z.object({
          page: z.number().int().positive().default(1),
          perpage: z.number().int().positive().max(1000).default(1000),
        }),
      ),
    },
    async (request) => {
      try {
        const params = request.params.arguments as {
          page?: number;
          perpage?: number;
        };
        const result = await adminService.listUsers(
          params.page || 1,
          params.perpage || 1000,
        );

        return {
          content: [
            {
              type: "text",
              text: `**Users (${result.totalCount} total)**\\n\\n${result.users
                .map(
                  (user) =>
                    `**${user.name}** (${user.login})\\n` +
                    `  ID: ${user.id}\\n` +
                    `  Email: ${user.email}\\n` +
                    `  Admin: ${user.isGrafanaAdmin ? "Yes" : "No"}\\n` +
                    `  Disabled: ${user.isDisabled ? "Yes" : "No"}\\n` +
                    `  Last Updated: ${user.updatedAt}`,
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
              text: `Error listing users: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Get current user
  registry.registerTool(
    {
      name: "get_current_user",
      description: "Get current user information",
      inputSchema: zodToJsonSchema(z.object({})),
    },
    async (_request) => {
      try {
        const user = await adminService.getCurrentUser();

        return {
          content: [
            {
              type: "text",
              text:
                `**Current User: ${user.name}**\\n\\n` +
                `- ID: ${user.id}\\n` +
                `- Login: ${user.login}\\n` +
                `- Email: ${user.email}\\n` +
                `- Theme: ${user.theme}\\n` +
                `- Organization ID: ${user.orgId}\\n` +
                `- Grafana Admin: ${user.isGrafanaAdmin ? "Yes" : "No"}\\n` +
                `- Disabled: ${user.isDisabled ? "Yes" : "No"}\\n` +
                `- External: ${user.isExternal ? "Yes" : "No"}\\n` +
                `- Created: ${user.createdAt}\\n` +
                `- Updated: ${user.updatedAt}`,
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
              text: `Error getting current user: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // List folders
  registry.registerTool(
    {
      name: "list_folders",
      description: "List all folders",
      inputSchema: zodToJsonSchema(z.object({})),
    },
    async (_request) => {
      try {
        const folders = await adminService.listFolders();

        return {
          content: [
            {
              type: "text",
              text: `**Folders (${folders.length} total)**\\n\\n${folders
                .map(
                  (folder) =>
                    `**${folder.title}** (${folder.uid})\\n` +
                    `  ID: ${folder.id}\\n` +
                    `  URL: ${folder.url}\\n${
                      folder.parentUid ? `  Parent: ${folder.parentUid}\\n` : ""
                    }`,
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
              text: `Error listing folders: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Get folder by UID
  registry.registerTool(
    {
      name: "get_folder_by_uid",
      description: "Get folder details by UID",
      inputSchema: zodToJsonSchema(
        z.object({
          uid: z.string().min(1),
        }),
      ),
    },
    async (request) => {
      try {
        const { uid } = request.params.arguments as { uid: string };
        const folder = await adminService.getFolderByUid(uid);

        return {
          content: [
            {
              type: "text",
              text:
                `**Folder: ${folder.title}**\\n\\n` +
                `- UID: ${folder.uid}\\n` +
                `- ID: ${folder.id}\\n` +
                `- URL: ${folder.url}\\n` +
                `- Version: ${folder.version}\\n` +
                `- Created: ${folder.created}\\n` +
                `- Updated: ${folder.updated}\\n` +
                `- Created By: ${folder.createdBy}\\n` +
                `- Updated By: ${folder.updatedBy}\\n${
                  folder.parentUid ? `- Parent UID: ${folder.parentUid}\\n` : ""
                }- Can Save: ${folder.canSave ? "Yes" : "No"}\\n` +
                `- Can Edit: ${folder.canEdit ? "Yes" : "No"}\\n` +
                `- Can Admin: ${folder.canAdmin ? "Yes" : "No"}\\n` +
                `- Can Delete: ${folder.canDelete ? "Yes" : "No"}`,
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
              text: `Error getting folder: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // List API keys
  registry.registerTool(
    {
      name: "list_api_keys",
      description: "List all API keys",
      inputSchema: zodToJsonSchema(z.object({})),
    },
    async (_request) => {
      try {
        const apiKeys = await adminService.listApiKeys();

        return {
          content: [
            {
              type: "text",
              text: `**API Keys (${apiKeys.length} total)**\\n\\n${apiKeys
                .map(
                  (key) =>
                    `**${key.name}**\\n` +
                    `  ID: ${key.id}\\n` +
                    `  Role: ${key.role}\\n` +
                    `  Created: ${key.created}\\n` +
                    `  Expires: ${key.expiration || "Never"}\\n` +
                    `  Last Used: ${key.lastUsedAt || "Never"}`,
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
              text: `Error listing API keys: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // List service accounts
  registry.registerTool(
    {
      name: "list_service_accounts",
      description: "List all service accounts",
      inputSchema: zodToJsonSchema(z.object({})),
    },
    async (_request) => {
      try {
        const serviceAccounts = await adminService.listServiceAccounts();

        return {
          content: [
            {
              type: "text",
              text: `**Service Accounts (${serviceAccounts.length} total)**\\n\\n${serviceAccounts
                .map(
                  (sa) =>
                    `**${sa.name}**\\n` +
                    `  ID: ${sa.id}\\n` +
                    `  Login: ${sa.login}\\n` +
                    `  Role: ${sa.role}\\n` +
                    `  Disabled: ${sa.isDisabled ? "Yes" : "No"}\\n` +
                    `  Created: ${sa.created}\\n` +
                    `  Avatar URL: ${sa.avatarUrl}`,
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
              text: `Error listing service accounts: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Get current organization
  registry.registerTool(
    {
      name: "get_current_organization",
      description: "Get current organization information",
      inputSchema: zodToJsonSchema(z.object({})),
    },
    async (_request) => {
      try {
        const org = await adminService.getCurrentOrganization();

        return {
          content: [
            {
              type: "text",
              text:
                `**Current Organization: ${org.name}**\\n\\n` +
                `- ID: ${org.id}\\n` +
                `- Address: ${org.address1 || "N/A"}\\n` +
                `- City: ${org.city || "N/A"}\\n` +
                `- Country: ${org.country || "N/A"}\\n` +
                `- State: ${org.state || "N/A"}\\n` +
                `- ZIP Code: ${org.zipCode || "N/A"}`,
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
              text: `Error getting current organization: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
