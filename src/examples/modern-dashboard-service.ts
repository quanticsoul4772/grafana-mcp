/**
 * Example of a modern dashboard service using the new architecture patterns
 */

import { z } from "zod";
import { BaseHttpService } from "../core/base-service.js";
import { Tool, ToolService } from "../core/tool-system.js";
import { HandleErrors, ValidationError, NotFoundError } from "../core/error-handling.js";
import { GrafanaHttpClient } from "../http-client.js";
import { AsyncResult } from "../core/interfaces.js";

/**
 * Input schemas for tools
 */
const SearchDashboardsSchema = z.object({
  query: z.string().optional(),
  tags: z.array(z.string()).optional(),
  starred: z.boolean().optional(),
  folderId: z.number().optional(),
  limit: z.number().min(1).max(5000).default(1000),
});

const GetDashboardSchema = z.object({
  uid: z.string().min(1),
  version: z.number().optional(),
});

const CreateDashboardSchema = z.object({
  dashboard: z.object({
    title: z.string().min(1),
    tags: z.array(z.string()).optional(),
    folderId: z.number().optional(),
    panels: z.array(z.any()).default([]),
  }),
  folderId: z.number().optional(),
  overwrite: z.boolean().default(false),
});

/**
 * Dashboard types
 */
interface Dashboard {
  id?: number;
  uid: string;
  title: string;
  tags: string[];
  folderId?: number;
  folderTitle?: string;
  uri: string;
  url: string;
  type: string;
  starred: boolean;
}

interface DashboardDetail extends Dashboard {
  dashboard: any;
  meta: {
    type: string;
    canSave: boolean;
    canEdit: boolean;
    canAdmin: boolean;
    canStar: boolean;
    created: string;
    updated: string;
    version: number;
  };
}

/**
 * Modern Dashboard Service using new patterns
 */
@ToolService('dashboards')
export class ModernDashboardService extends BaseHttpService {
  constructor(httpClient: GrafanaHttpClient) {
    super('ModernDashboardService', httpClient, '2.0.0');
  }

  /**
   * Search for dashboards with comprehensive error handling
   */
  @Tool({
    name: 'search_dashboards',
    description: 'Search for dashboards by title, tags, or other metadata with advanced filtering',
    category: 'dashboards',
    tags: ['search', 'filter'],
    schema: SearchDashboardsSchema
  })
  @HandleErrors('searchDashboards')
  async searchDashboards(request: any): Promise<any> {
    const params = SearchDashboardsSchema.parse(request.params.arguments);
    
    const result = await this.searchDashboardsResult(params);
    
    if (!result.success) {
      throw result.error;
    }

    return {
      content: [
        {
          type: "text",
          text: `Found ${result.data.length} dashboards:\n\n` +
                result.data.map(d => 
                  `• **${d.title}** (${d.uid})\n` +
                  `  Tags: ${d.tags.join(', ') || 'none'}\n` +
                  `  URL: ${d.url}`
                ).join('\n\n'),
        },
      ],
    };
  }

  /**
   * Get dashboard by UID
   */
  @Tool({
    name: 'get_dashboard',
    description: 'Retrieve a specific dashboard by its UID',
    category: 'dashboards',
    tags: ['retrieve'],
    schema: GetDashboardSchema
  })
  @HandleErrors('getDashboard')
  async getDashboard(request: any): Promise<any> {
    const { uid, version } = GetDashboardSchema.parse(request.params.arguments);
    
    const result = await this.getDashboardResult(uid, version);
    
    if (!result.success) {
      throw result.error;
    }

    const dashboard = result.data;
    
    return {
      content: [
        {
          type: "text",
          text: `# Dashboard: ${dashboard.dashboard.title}\n\n` +
                `**UID:** ${dashboard.uid}\n` +
                `**ID:** ${dashboard.id || 'N/A'}\n` +
                `**Version:** ${dashboard.meta.version}\n` +
                `**Tags:** ${dashboard.dashboard.tags?.join(', ') || 'none'}\n` +
                `**Panels:** ${dashboard.dashboard.panels?.length || 0}\n` +
                `**Created:** ${dashboard.meta.created}\n` +
                `**Updated:** ${dashboard.meta.updated}\n\n` +
                `**Permissions:**\n` +
                `- Can Save: ${dashboard.meta.canSave}\n` +
                `- Can Edit: ${dashboard.meta.canEdit}\n` +
                `- Can Admin: ${dashboard.meta.canAdmin}`,
        },
      ],
    };
  }

  /**
   * Create a new dashboard
   */
  @Tool({
    name: 'create_dashboard',
    description: 'Create a new dashboard with the specified configuration',
    category: 'dashboards',
    tags: ['create'],
    schema: CreateDashboardSchema
  })
  @HandleErrors('createDashboard')
  async createDashboard(request: any): Promise<any> {
    const params = CreateDashboardSchema.parse(request.params.arguments);
    
    const result = await this.createDashboardResult(params);
    
    if (!result.success) {
      throw result.error;
    }

    const response = result.data;
    
    return {
      content: [
        {
          type: "text",
          text: `✅ Dashboard created successfully!\n\n` +
                `**Title:** ${response.dashboard.title}\n` +
                `**UID:** ${response.dashboard.uid}\n` +
                `**ID:** ${response.dashboard.id}\n` +
                `**Version:** ${response.version}\n` +
                `**URL:** ${response.url}\n` +
                `**Status:** ${response.status}`,
        },
      ],
    };
  }

  // Business logic methods with Result pattern

  /**
   * Search dashboards with Result wrapper
   */
  async searchDashboardsResult(params: z.infer<typeof SearchDashboardsSchema>): AsyncResult<Dashboard[]> {
    return this.execute(async () => {
      const queryParams: Record<string, any> = {
        limit: params.limit,
      };

      if (params.query) queryParams.query = params.query;
      if (params.tags?.length) queryParams.tag = params.tags;
      if (params.starred !== undefined) queryParams.starred = params.starred;
      if (params.folderId !== undefined) queryParams.folderId = params.folderId;

      const response = await this.httpClient.get('/api/search', { params: queryParams });
      
      if (!Array.isArray(response.data)) {
        throw new ValidationError('Invalid response format from Grafana API');
      }

      return response.data as Dashboard[];
    }, 'searchDashboards');
  }

  /**
   * Get dashboard by UID with Result wrapper
   */
  async getDashboardResult(uid: string, version?: number): AsyncResult<DashboardDetail> {
    return this.execute(async () => {
      const url = version 
        ? `/api/dashboards/uid/${uid}?version=${version}`
        : `/api/dashboards/uid/${uid}`;
      
      try {
        const response = await this.httpClient.get(url);
        return response.data as DashboardDetail;
      } catch (error: any) {
        if (error.status === 404) {
          throw new NotFoundError('Dashboard', uid);
        }
        throw error;
      }
    }, 'getDashboard');
  }

  /**
   * Create dashboard with Result wrapper
   */
  async createDashboardResult(params: z.infer<typeof CreateDashboardSchema>): AsyncResult<any> {
    return this.execute(async () => {
      const payload = {
        dashboard: {
          ...params.dashboard,
          id: null, // Ensure new dashboard
        },
        folderId: params.folderId || 0,
        overwrite: params.overwrite,
      };

      const response = await this.httpClient.post('/api/dashboards/db', payload);
      return response.data;
    }, 'createDashboard');
  }

  // Service lifecycle methods

  protected async onInitialize(): Promise<void> {
    await super.onInitialize();
    console.log(`📊 ${this.name} initialized successfully`);
  }

  protected async onCleanup(): Promise<void> {
    console.log(`🧹 ${this.name} cleanup completed`);
  }

  protected async onHealthCheck(): Promise<boolean> {
    try {
      // Test basic API connectivity
      await this.httpClient.get('/api/health');
      
      // Test dashboard API access
      await this.httpClient.get('/api/search?limit=1');
      
      return true;
    } catch (error) {
      console.warn(`${this.name} health check failed:`, error);
      return false;
    }
  }
}