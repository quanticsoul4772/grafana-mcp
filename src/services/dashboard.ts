import { GrafanaHttpClient } from "../http-client.js";
import { Dashboard, DashboardDetail, Panel, Target } from "../types.js";

/**
 * Service for managing Grafana dashboards
 */
export class DashboardService {
  constructor(private httpClient: GrafanaHttpClient) {}

  /**
   * Search for dashboards
   */
  async searchDashboards(
    options: {
      query?: string;
      tags?: string[];
      starred?: boolean;
      folderId?: number;
      type?: string;
      limit?: number;
    } = {},
  ): Promise<Dashboard[]> {
    const params: Record<string, any> = {
      limit: options.limit || 1000,
    };

    if (options.query) {
      params.query = options.query;
    }

    if (options.tags && options.tags.length > 0) {
      params.tag = options.tags;
    }

    if (options.starred !== undefined) {
      params.starred = options.starred;
    }

    if (options.folderId !== undefined) {
      params.folderId = options.folderId;
    }

    if (options.type) {
      params.type = options.type;
    }

    return this.httpClient.get<Dashboard[]>("/api/search", params);
  }

  /**
   * Get dashboard by UID
   */
  async getDashboardByUid(uid: string): Promise<DashboardDetail> {
    return this.httpClient.get<DashboardDetail>(`/api/dashboards/uid/${uid}`);
  }

  /**
   * Update or create dashboard
   */
  async updateDashboard(options: {
    dashboard: Record<string, any>;
    folderId?: number;
    message?: string;
    overwrite?: boolean;
  }): Promise<any> {
    const payload: Record<string, any> = {
      dashboard: options.dashboard,
      overwrite: options.overwrite || false,
    };

    if (options.folderId !== undefined) {
      payload.folderId = options.folderId;
    }

    if (options.message) {
      payload.message = options.message;
    }

    return this.httpClient.post("/api/dashboards/db", payload);
  }

  /**
   * Get panel queries and datasource information from a dashboard
   */
  async getDashboardPanelQueries(uid: string): Promise<{
    uid: string;
    title: string;
    panels: Array<{
      id: number;
      title: string;
      type: string;
      queries: Array<{
        refId: string;
        query: string;
        queryType?: string;
        datasource?: {
          uid: string;
          type: string;
        };
      }>;
      datasource?: {
        uid: string;
        type: string;
      };
    }>;
  }> {
    const dashboardDetail = await this.getDashboardByUid(uid);
    const dashboard = dashboardDetail.dashboard;

    const panels = dashboard.panels.map((panel: Panel) => {
      const queries =
        panel.targets?.map((target: Target) => ({
          refId: target.refId,
          query: target.expr || target.logQL || "",
          queryType: target.queryType,
          datasource: target.datasource,
        })) || [];

      return {
        id: panel.id,
        title: panel.title,
        type: panel.type,
        queries,
        datasource: panel.datasource,
      };
    });

    return {
      uid: dashboard.uid,
      title: dashboard.title,
      panels,
    };
  }

  /**
   * Delete dashboard by UID
   */
  async deleteDashboard(uid: string): Promise<void> {
    await this.httpClient.delete(`/api/dashboards/uid/${uid}`);
  }

  /**
   * Get dashboard permissions
   */
  async getDashboardPermissions(uid: string): Promise<any[]> {
    return this.httpClient.get(`/api/dashboards/uid/${uid}/permissions`);
  }

  /**
   * Update dashboard permissions
   */
  async updateDashboardPermissions(
    uid: string,
    permissions: any[],
  ): Promise<void> {
    await this.httpClient.post(`/api/dashboards/uid/${uid}/permissions`, {
      items: permissions,
    });
  }

  /**
   * Get dashboard versions
   */
  async getDashboardVersions(uid: string): Promise<any[]> {
    return this.httpClient.get(`/api/dashboards/uid/${uid}/versions`);
  }

  /**
   * Get specific dashboard version
   */
  async getDashboardVersion(uid: string, version: number): Promise<any> {
    return this.httpClient.get(
      `/api/dashboards/uid/${uid}/versions/${version}`,
    );
  }

  /**
   * Restore dashboard to specific version
   */
  async restoreDashboardVersion(uid: string, version: number): Promise<any> {
    return this.httpClient.post(`/api/dashboards/uid/${uid}/restore`, {
      version,
    });
  }
}
