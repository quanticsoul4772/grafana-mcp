import { GrafanaHttpClient } from "../http-client.js";
import { Datasource } from "../types.js";

/**
 * Service for managing Grafana datasources
 */
export class DatasourceService {
  constructor(private httpClient: GrafanaHttpClient) {}

  /**
   * List all datasources
   */
  async listDatasources(): Promise<Datasource[]> {
    return this.httpClient.get<Datasource[]>("/api/datasources");
  }

  /**
   * Get datasource by UID
   */
  async getDatasourceByUid(uid: string): Promise<Datasource> {
    return this.httpClient.get<Datasource>(`/api/datasources/uid/${uid}`);
  }

  /**
   * Get datasource by name
   */
  async getDatasourceByName(name: string): Promise<Datasource> {
    return this.httpClient.get<Datasource>(
      `/api/datasources/name/${encodeURIComponent(name)}`,
    );
  }

  /**
   * Get datasource by ID
   */
  async getDatasourceById(id: number): Promise<Datasource> {
    return this.httpClient.get<Datasource>(`/api/datasources/${id}`);
  }

  /**
   * Create datasource
   */
  async createDatasource(datasource: Partial<Datasource>): Promise<any> {
    return this.httpClient.post("/api/datasources", datasource);
  }

  /**
   * Update datasource
   */
  async updateDatasource(
    id: number,
    datasource: Partial<Datasource>,
  ): Promise<any> {
    return this.httpClient.put(`/api/datasources/${id}`, datasource);
  }

  /**
   * Delete datasource by ID
   */
  async deleteDatasourceById(id: number): Promise<void> {
    await this.httpClient.delete(`/api/datasources/${id}`);
  }

  /**
   * Delete datasource by UID
   */
  async deleteDatasourceByUid(uid: string): Promise<void> {
    await this.httpClient.delete(`/api/datasources/uid/${uid}`);
  }

  /**
   * Delete datasource by name
   */
  async deleteDatasourceByName(name: string): Promise<void> {
    await this.httpClient.delete(
      `/api/datasources/name/${encodeURIComponent(name)}`,
    );
  }

  /**
   * Test datasource connection
   */
  async testDatasource(datasource: Partial<Datasource>): Promise<any> {
    return this.httpClient.post("/api/datasources/test", datasource);
  }

  /**
   * Test datasource connection by UID
   */
  async testDatasourceByUid(uid: string): Promise<any> {
    return this.httpClient.get(`/api/datasources/uid/${uid}/health`);
  }

  /**
   * Proxy request to datasource
   */
  async proxyDatasourceRequest(
    uid: string,
    path: string,
    method: "GET" | "POST" = "GET",
    data?: any,
    params?: Record<string, any>,
  ): Promise<any> {
    const url = `/api/datasources/proxy/uid/${uid}/${path}`;

    switch (method) {
      case "GET":
        return this.httpClient.get(url, params);
      case "POST":
        return this.httpClient.post(url, data);
      default:
        throw new Error(`Unsupported HTTP method: ${method}`);
    }
  }

  /**
   * Get datasource permissions
   */
  async getDatasourcePermissions(id: number): Promise<any[]> {
    return this.httpClient.get(`/api/datasources/${id}/permissions`);
  }

  /**
   * Update datasource permissions
   */
  async updateDatasourcePermissions(
    id: number,
    permissions: any[],
  ): Promise<void> {
    await this.httpClient.post(
      `/api/datasources/${id}/permissions`,
      permissions,
    );
  }

  /**
   * Get datasources by type
   */
  async getDatasourcesByType(type: string): Promise<Datasource[]> {
    const datasources = await this.listDatasources();
    return datasources.filter((ds) => ds.type === type);
  }

  /**
   * Get default datasource
   */
  async getDefaultDatasource(): Promise<Datasource | null> {
    const datasources = await this.listDatasources();
    return datasources.find((ds) => ds.isDefault) || null;
  }

  /**
   * Check if datasource exists by UID
   */
  async datasourceExists(uid: string): Promise<boolean> {
    try {
      await this.getDatasourceByUid(uid);
      return true;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Check if datasource exists by name
   */
  async datasourceExistsByName(name: string): Promise<boolean> {
    try {
      await this.getDatasourceByName(name);
      return true;
    } catch (_error) {
      return false;
    }
  }
}
