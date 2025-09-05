import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardService } from './dashboard.js';
import { GrafanaHttpClient } from '../http-client.js';
import type { Dashboard, DashboardDetail, Panel } from '../types.js';

// Mock the http client
const mockHttpClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
} as unknown as GrafanaHttpClient;

describe('DashboardService', () => {
  let service: DashboardService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DashboardService(mockHttpClient);
  });

  describe('constructor', () => {
    it('should create service with correct name and version', () => {
      expect(service.name).toBe('DashboardService');
      expect(service.version).toBe('1.0.0');
    });
  });

  describe('searchDashboards', () => {
    const mockDashboards: Dashboard[] = [
      {
        uid: 'dash1',
        title: 'Dashboard 1',
        tags: ['monitoring'],
        uri: 'db/dashboard-1',
        url: '/d/dash1/dashboard-1',
        type: 'dash-db',
      },
      {
        uid: 'dash2',
        title: 'Dashboard 2',
        tags: ['alerts'],
        uri: 'db/dashboard-2',
        url: '/d/dash2/dashboard-2',
        type: 'dash-db',
      },
    ];

    beforeEach(() => {
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockDashboards);
    });

    it('should search dashboards with default options', async () => {
      const result = await service.searchDashboards();

      expect(result).toEqual(mockDashboards);
      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/search', { limit: 1000 });
    });

    it('should search dashboards with query parameter', async () => {
      await service.searchDashboards({ query: 'monitoring' });

      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/search', {
        limit: 1000,
        query: 'monitoring',
      });
    });

    it('should search dashboards with tags', async () => {
      await service.searchDashboards({ tags: ['monitoring', 'prod'] });

      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/search', {
        limit: 1000,
        tag: ['monitoring', 'prod'],
      });
    });

    it('should search dashboards with starred filter', async () => {
      await service.searchDashboards({ starred: true });

      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/search', {
        limit: 1000,
        starred: true,
      });
    });

    it('should search dashboards with folderId', async () => {
      await service.searchDashboards({ folderId: 42 });

      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/search', {
        limit: 1000,
        folderId: 42,
      });
    });

    it('should search dashboards with type filter', async () => {
      await service.searchDashboards({ type: 'dash-folder' });

      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/search', {
        limit: 1000,
        type: 'dash-folder',
      });
    });

    it('should search dashboards with custom limit', async () => {
      await service.searchDashboards({ limit: 50 });

      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/search', {
        limit: 50,
      });
    });

    it('should search dashboards with multiple parameters', async () => {
      await service.searchDashboards({
        query: 'test',
        tags: ['tag1'],
        starred: false,
        folderId: 1,
        type: 'dash-db',
        limit: 100,
      });

      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/search', {
        query: 'test',
        tag: ['tag1'],
        starred: false,
        folderId: 1,
        type: 'dash-db',
        limit: 100,
      });
    });

    it('should handle empty tags array', async () => {
      await service.searchDashboards({ tags: [] });

      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/search', {
        limit: 1000,
      });
    });

    it('should handle zero folderId', async () => {
      await service.searchDashboards({ folderId: 0 });

      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/search', {
        limit: 1000,
        folderId: 0,
      });
    });

    it('should not include starred parameter when undefined', async () => {
      await service.searchDashboards({ starred: undefined });

      const calledParams = vi.mocked(mockHttpClient.get).mock.calls[0][1];
      expect(calledParams).not.toHaveProperty('starred');
    });
  });

  describe('searchDashboardsResult', () => {
    it('should return result wrapper', async () => {
      const mockDashboards: Dashboard[] = [
        {
          uid: 'dash1',
          title: 'Dashboard 1',
          tags: ['monitoring'],
          uri: 'db/dashboard-1',
          url: '/d/dash1/dashboard-1',
          type: 'dash-db',
        },
      ];

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockDashboards);

      const result = await service.searchDashboardsResult({ query: 'test' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockDashboards);
      expect(result.error).toBeUndefined();
    });

    it('should handle errors in result wrapper', async () => {
      const error = new Error('Search failed');
      vi.mocked(mockHttpClient.get).mockRejectedValue(error);

      const result = await service.searchDashboardsResult({ query: 'test' });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.data).toBeUndefined();
    });
  });

  describe('getDashboardByUid', () => {
    it('should get dashboard by UID', async () => {
      const mockDashboardDetail: DashboardDetail = {
        dashboard: {
          id: 1,
          uid: 'test-uid',
          title: 'Test Dashboard',
          tags: ['test'],
          timezone: 'UTC',
          panels: [],
          time: { from: 'now-1h', to: 'now' },
          timepicker: {},
          templating: { list: [] },
          annotations: { list: [] },
          refresh: '5s',
          schemaVersion: 30,
          version: 1,
          links: [],
        },
        meta: {
          type: 'db',
          canSave: true,
          canEdit: true,
          canAdmin: true,
          canStar: true,
          canDelete: true,
          slug: 'test-dashboard',
          url: '/d/test-uid/test-dashboard',
          expires: '0001-01-01T00:00:00Z',
          created: '2023-01-01T00:00:00Z',
          updated: '2023-01-02T00:00:00Z',
          updatedBy: 'admin',
          createdBy: 'admin',
          version: 1,
          hasAcl: false,
          isFolder: false,
          folderId: 0,
          folderUid: '',
          folderTitle: '',
          folderUrl: '',
          provisioned: false,
          provisionedExternalId: '',
        },
      };

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockDashboardDetail);

      const result = await service.getDashboardByUid('test-uid');

      expect(result).toEqual(mockDashboardDetail);
      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/dashboards/uid/test-uid');
    });
  });

  describe('updateDashboard', () => {
    it('should update dashboard with minimal options', async () => {
      const mockResponse = { id: 1, uid: 'test-uid', version: 2 };
      const dashboard = { uid: 'test-uid', title: 'Updated Dashboard' };

      vi.mocked(mockHttpClient.post).mockResolvedValue(mockResponse);

      const result = await service.updateDashboard({ dashboard });

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.post).toHaveBeenCalledWith('/api/dashboards/db', {
        dashboard,
        overwrite: false,
      });
    });

    it('should update dashboard with all options', async () => {
      const mockResponse = { id: 1, uid: 'test-uid', version: 2 };
      const dashboard = { uid: 'test-uid', title: 'Updated Dashboard' };

      vi.mocked(mockHttpClient.post).mockResolvedValue(mockResponse);

      const result = await service.updateDashboard({
        dashboard,
        folderId: 42,
        message: 'Update message',
        overwrite: true,
      });

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.post).toHaveBeenCalledWith('/api/dashboards/db', {
        dashboard,
        folderId: 42,
        message: 'Update message',
        overwrite: true,
      });
    });

    it('should handle zero folderId', async () => {
      const mockResponse = { id: 1, uid: 'test-uid', version: 2 };
      const dashboard = { uid: 'test-uid', title: 'Updated Dashboard' };

      vi.mocked(mockHttpClient.post).mockResolvedValue(mockResponse);

      await service.updateDashboard({
        dashboard,
        folderId: 0,
      });

      expect(mockHttpClient.post).toHaveBeenCalledWith('/api/dashboards/db', {
        dashboard,
        folderId: 0,
        overwrite: false,
      });
    });

    it('should not include folderId when undefined', async () => {
      const dashboard = { uid: 'test-uid', title: 'Updated Dashboard' };

      vi.mocked(mockHttpClient.post).mockResolvedValue({});

      await service.updateDashboard({
        dashboard,
        folderId: undefined,
        message: 'test',
      });

      const calledPayload = vi.mocked(mockHttpClient.post).mock.calls[0][1];
      expect(calledPayload).not.toHaveProperty('folderId');
      expect(calledPayload).toHaveProperty('message', 'test');
    });
  });

  describe('getDashboardPanelQueries', () => {
    it('should extract panel queries from dashboard', async () => {
      const mockDashboardDetail: DashboardDetail = {
        dashboard: {
          id: 1,
          uid: 'test-uid',
          title: 'Test Dashboard',
          tags: [],
          timezone: 'UTC',
          panels: [
            {
              id: 1,
              title: 'Panel 1',
              type: 'graph',
              targets: [
                {
                  refId: 'A',
                  expr: 'up',
                  queryType: 'prometheus',
                  datasource: { uid: 'prom-uid', type: 'prometheus' },
                },
                {
                  refId: 'B',
                  logQL: '{job="app"}',
                  queryType: 'loki',
                  datasource: { uid: 'loki-uid', type: 'loki' },
                },
              ],
              datasource: { uid: 'default-uid', type: 'prometheus' },
            } as Panel,
            {
              id: 2,
              title: 'Panel 2',
              type: 'stat',
              targets: [],
              datasource: { uid: 'stat-uid', type: 'stat' },
            } as Panel,
          ],
          time: { from: 'now-1h', to: 'now' },
          timepicker: {},
          templating: { list: [] },
          annotations: { list: [] },
          refresh: '5s',
          schemaVersion: 30,
          version: 1,
          links: [],
        },
        meta: {
          type: 'db',
          canSave: true,
          canEdit: true,
          canAdmin: true,
          canStar: true,
          canDelete: true,
          slug: 'test-dashboard',
          url: '/d/test-uid/test-dashboard',
          expires: '0001-01-01T00:00:00Z',
          created: '2023-01-01T00:00:00Z',
          updated: '2023-01-02T00:00:00Z',
          updatedBy: 'admin',
          createdBy: 'admin',
          version: 1,
          hasAcl: false,
          isFolder: false,
          folderId: 0,
          folderUid: '',
          folderTitle: '',
          folderUrl: '',
          provisioned: false,
          provisionedExternalId: '',
        },
      };

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockDashboardDetail);

      const result = await service.getDashboardPanelQueries('test-uid');

      expect(result).toEqual({
        uid: 'test-uid',
        title: 'Test Dashboard',
        panels: [
          {
            id: 1,
            title: 'Panel 1',
            type: 'graph',
            queries: [
              {
                refId: 'A',
                query: 'up',
                queryType: 'prometheus',
                datasource: { uid: 'prom-uid', type: 'prometheus' },
              },
              {
                refId: 'B',
                query: '{job="app"}',
                queryType: 'loki',
                datasource: { uid: 'loki-uid', type: 'loki' },
              },
            ],
            datasource: { uid: 'default-uid', type: 'prometheus' },
          },
          {
            id: 2,
            title: 'Panel 2',
            type: 'stat',
            queries: [],
            datasource: { uid: 'stat-uid', type: 'stat' },
          },
        ],
      });
    });

    it('should handle panels without targets', async () => {
      const mockDashboardDetail: DashboardDetail = {
        dashboard: {
          id: 1,
          uid: 'test-uid',
          title: 'Test Dashboard',
          tags: [],
          timezone: 'UTC',
          panels: [
            {
              id: 1,
              title: 'Panel 1',
              type: 'text',
              // No targets property
            } as Panel,
          ],
          time: { from: 'now-1h', to: 'now' },
          timepicker: {},
          templating: { list: [] },
          annotations: { list: [] },
          refresh: '5s',
          schemaVersion: 30,
          version: 1,
          links: [],
        },
        meta: {} as any,
      };

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockDashboardDetail);

      const result = await service.getDashboardPanelQueries('test-uid');

      expect(result.panels[0].queries).toEqual([]);
    });

    it('should handle targets without expr or logQL', async () => {
      const mockDashboardDetail: DashboardDetail = {
        dashboard: {
          id: 1,
          uid: 'test-uid',
          title: 'Test Dashboard',
          tags: [],
          timezone: 'UTC',
          panels: [
            {
              id: 1,
              title: 'Panel 1',
              type: 'graph',
              targets: [
                {
                  refId: 'A',
                  // No expr or logQL
                  queryType: 'custom',
                },
              ],
            } as Panel,
          ],
          time: { from: 'now-1h', to: 'now' },
          timepicker: {},
          templating: { list: [] },
          annotations: { list: [] },
          refresh: '5s',
          schemaVersion: 30,
          version: 1,
          links: [],
        },
        meta: {} as any,
      };

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockDashboardDetail);

      const result = await service.getDashboardPanelQueries('test-uid');

      expect(result.panels[0].queries[0].query).toBe('');
    });
  });

  describe('deleteDashboard', () => {
    it('should delete dashboard by UID', async () => {
      vi.mocked(mockHttpClient.delete).mockResolvedValue(undefined);

      await service.deleteDashboard('test-uid');

      expect(mockHttpClient.delete).toHaveBeenCalledWith('/api/dashboards/uid/test-uid');
    });
  });

  describe('getDashboardPermissions', () => {
    it('should get dashboard permissions', async () => {
      const mockPermissions = [
        { id: 1, userId: 1, permission: 1 },
        { id: 2, teamId: 1, permission: 2 },
      ];

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockPermissions);

      const result = await service.getDashboardPermissions('test-uid');

      expect(result).toEqual(mockPermissions);
      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/dashboards/uid/test-uid/permissions');
    });
  });

  describe('updateDashboardPermissions', () => {
    it('should update dashboard permissions', async () => {
      const permissions = [
        { userId: 1, permission: 1 },
        { teamId: 1, permission: 2 },
      ];

      vi.mocked(mockHttpClient.post).mockResolvedValue(undefined);

      await service.updateDashboardPermissions('test-uid', permissions);

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/dashboards/uid/test-uid/permissions',
        { items: permissions }
      );
    });
  });

  describe('getDashboardVersions', () => {
    it('should get dashboard versions', async () => {
      const mockVersions = [
        { id: 1, version: 1, created: '2023-01-01T00:00:00Z' },
        { id: 2, version: 2, created: '2023-01-02T00:00:00Z' },
      ];

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockVersions);

      const result = await service.getDashboardVersions('test-uid');

      expect(result).toEqual(mockVersions);
      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/dashboards/uid/test-uid/versions');
    });
  });

  describe('getDashboardVersion', () => {
    it('should get specific dashboard version', async () => {
      const mockVersion = {
        id: 1,
        version: 2,
        created: '2023-01-01T00:00:00Z',
        dashboard: { uid: 'test-uid', title: 'Test' },
      };

      vi.mocked(mockHttpClient.get).mockResolvedValue(mockVersion);

      const result = await service.getDashboardVersion('test-uid', 2);

      expect(result).toEqual(mockVersion);
      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/dashboards/uid/test-uid/versions/2');
    });
  });

  describe('restoreDashboardVersion', () => {
    it('should restore dashboard to specific version', async () => {
      const mockResponse = { id: 1, uid: 'test-uid', version: 2 };

      vi.mocked(mockHttpClient.post).mockResolvedValue(mockResponse);

      const result = await service.restoreDashboardVersion('test-uid', 2);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/dashboards/uid/test-uid/restore',
        { version: 2 }
      );
    });
  });

  describe('error handling', () => {
    it('should propagate HTTP client errors', async () => {
      const error = new Error('Network error');
      vi.mocked(mockHttpClient.get).mockRejectedValue(error);

      await expect(service.searchDashboards()).rejects.toThrow('Network error');
    });

    it('should handle malformed dashboard data', async () => {
      const malformedDashboard = {
        dashboard: {
          panels: null, // Invalid panels data
        },
      };

      vi.mocked(mockHttpClient.get).mockResolvedValue(malformedDashboard);

      await expect(service.getDashboardPanelQueries('test-uid')).rejects.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle empty dashboard list', async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue([]);

      const result = await service.searchDashboards();

      expect(result).toEqual([]);
    });

    it('should handle dashboard with empty panels array', async () => {
      const dashboardWithNoPanels: DashboardDetail = {
        dashboard: {
          id: 1,
          uid: 'test-uid',
          title: 'Empty Dashboard',
          tags: [],
          timezone: 'UTC',
          panels: [],
          time: { from: 'now-1h', to: 'now' },
          timepicker: {},
          templating: { list: [] },
          annotations: { list: [] },
          refresh: '5s',
          schemaVersion: 30,
          version: 1,
          links: [],
        },
        meta: {} as any,
      };

      vi.mocked(mockHttpClient.get).mockResolvedValue(dashboardWithNoPanels);

      const result = await service.getDashboardPanelQueries('test-uid');

      expect(result.panels).toEqual([]);
    });

    it('should handle large dashboard queries', async () => {
      const largeDashboard = {
        dashboard: {
          panels: Array.from({ length: 100 }, (_, i) => ({
            id: i,
            title: `Panel ${i}`,
            type: 'graph',
            targets: [
              {
                refId: 'A',
                expr: `query_${i}`,
                queryType: 'prometheus',
              },
            ],
          })),
        },
      };

      vi.mocked(mockHttpClient.get).mockResolvedValue(largeDashboard);

      const result = await service.getDashboardPanelQueries('test-uid');

      expect(result.panels).toHaveLength(100);
      expect(result.panels[99].title).toBe('Panel 99');
    });
  });
});