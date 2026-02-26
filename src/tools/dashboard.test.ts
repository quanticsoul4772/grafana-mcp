import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRegistry } from '../tool-registry.js';
import { DashboardService } from '../services/dashboard.js';
import { registerDashboardTools } from './dashboard.js';

const mockService = {
  searchDashboards: vi.fn(),
  getDashboardByUid: vi.fn(),
  updateDashboard: vi.fn(),
  getDashboardPanelQueries: vi.fn(),
  getDashboardVersions: vi.fn(),
  restoreDashboardVersion: vi.fn(),
  deleteDashboard: vi.fn(),
} as unknown as DashboardService;

describe('Dashboard Tools', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new ToolRegistry();
    registerDashboardTools(registry, mockService);
  });

  it('should register all 7 tools', () => {
    expect(registry.hasTool('search_dashboards')).toBe(true);
    expect(registry.hasTool('get_dashboard_by_uid')).toBe(true);
    expect(registry.hasTool('update_dashboard')).toBe(true);
    expect(registry.hasTool('get_dashboard_panel_queries')).toBe(true);
    expect(registry.hasTool('get_dashboard_versions')).toBe(true);
    expect(registry.hasTool('restore_dashboard_version')).toBe(true);
    expect(registry.hasTool('delete_dashboard')).toBe(true);
  });

  // ─── search_dashboards ───────────────────────────────────────────────

  describe('search_dashboards', () => {
    it('should call searchDashboards and format response', async () => {
      vi.mocked(mockService.searchDashboards).mockResolvedValue([
        {
          uid: 'dash-1',
          title: 'My Dashboard',
          url: '/d/dash-1',
          tags: ['production'],
          folderTitle: 'General',
          isStarred: false,
        },
      ]);

      const handler = registry.getHandler('search_dashboards')!;
      const result = await handler({ params: { arguments: { query: 'My' } } });

      expect(mockService.searchDashboards).toHaveBeenCalled();
      expect(result.content[0].text).toContain('Found 1 dashboards');
      expect(result.content[0].text).toContain('My Dashboard');
      expect(result.content[0].text).toContain('production');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.searchDashboards).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('search_dashboards')!;
      const result = await handler({ params: { arguments: {} } });
      expect(result.isError).toBe(true);
    });
  });

  // ─── get_dashboard_by_uid ────────────────────────────────────────────

  describe('get_dashboard_by_uid', () => {
    it('should call getDashboardByUid and format response', async () => {
      vi.mocked(mockService.getDashboardByUid).mockResolvedValue({
        dashboard: {
          uid: 'dash-1',
          id: 1,
          title: 'My Dashboard',
          version: 3,
          tags: ['prod'],
          timezone: 'browser',
          refresh: '5s',
          panels: [
            { id: 1, title: 'CPU Usage', type: 'graph' },
          ],
          time: { from: 'now-6h', to: 'now' },
        },
        meta: {
          folderTitle: 'General',
          folderUid: 'folder-1',
          created: '2024-01-01',
          updated: '2024-01-02',
          createdBy: 'admin',
          updatedBy: 'admin',
          canEdit: true,
          canSave: true,
          provisioned: false,
        },
      });

      const handler = registry.getHandler('get_dashboard_by_uid')!;
      const result = await handler({ params: { arguments: { uid: 'dash-1' } } });

      expect(mockService.getDashboardByUid).toHaveBeenCalledWith('dash-1');
      expect(result.content[0].text).toContain('Dashboard: My Dashboard');
      expect(result.content[0].text).toContain('CPU Usage');
      expect(result.content[0].text).toContain('Version: 3');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.getDashboardByUid).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('get_dashboard_by_uid')!;
      const result = await handler({ params: { arguments: { uid: 'bad' } } });
      expect(result.isError).toBe(true);
    });
  });

  // ─── update_dashboard ────────────────────────────────────────────────

  describe('update_dashboard', () => {
    it('should call updateDashboard and format response', async () => {
      vi.mocked(mockService.updateDashboard).mockResolvedValue({
        uid: 'dash-1',
        id: 1,
        version: 4,
        url: '/d/dash-1',
        status: 'success',
      });

      const handler = registry.getHandler('update_dashboard')!;
      const result = await handler({
        params: {
          arguments: {
            dashboard: { uid: 'dash-1', title: 'Updated' },
            overwrite: true,
          },
        },
      });

      expect(mockService.updateDashboard).toHaveBeenCalled();
      expect(result.content[0].text).toContain('Dashboard updated successfully');
      expect(result.content[0].text).toContain('dash-1');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.updateDashboard).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('update_dashboard')!;
      const result = await handler({
        params: { arguments: { dashboard: { title: 'x' } } },
      });
      expect(result.isError).toBe(true);
    });
  });

  // ─── get_dashboard_panel_queries ─────────────────────────────────────

  describe('get_dashboard_panel_queries', () => {
    it('should call getDashboardPanelQueries and format response', async () => {
      vi.mocked(mockService.getDashboardPanelQueries).mockResolvedValue({
        uid: 'dash-1',
        title: 'My Dashboard',
        panels: [
          {
            id: 1,
            title: 'CPU Panel',
            type: 'timeseries',
            datasource: { type: 'prometheus', uid: 'prom-1' },
            queries: [
              { refId: 'A', query: 'up', datasource: { type: 'prometheus', uid: 'prom-1' } },
            ],
          },
        ],
      });

      const handler = registry.getHandler('get_dashboard_panel_queries')!;
      const result = await handler({ params: { arguments: { uid: 'dash-1' } } });

      expect(mockService.getDashboardPanelQueries).toHaveBeenCalledWith('dash-1');
      expect(result.content[0].text).toContain('Dashboard Panel Queries: My Dashboard');
      expect(result.content[0].text).toContain('CPU Panel');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.getDashboardPanelQueries).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('get_dashboard_panel_queries')!;
      const result = await handler({ params: { arguments: { uid: 'bad' } } });
      expect(result.isError).toBe(true);
    });
  });

  // ─── get_dashboard_versions ──────────────────────────────────────────

  describe('get_dashboard_versions', () => {
    it('should call getDashboardVersions and format response', async () => {
      vi.mocked(mockService.getDashboardVersions).mockResolvedValue([
        {
          version: 1,
          created: '2024-01-01',
          createdBy: 'admin',
          message: 'Initial commit',
          parentVersion: 0,
        },
      ]);

      const handler = registry.getHandler('get_dashboard_versions')!;
      const result = await handler({ params: { arguments: { uid: 'dash-1' } } });

      expect(mockService.getDashboardVersions).toHaveBeenCalledWith('dash-1');
      expect(result.content[0].text).toContain('Dashboard Versions for dash-1');
      expect(result.content[0].text).toContain('Version 1');
      expect(result.content[0].text).toContain('Initial commit');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.getDashboardVersions).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('get_dashboard_versions')!;
      const result = await handler({ params: { arguments: { uid: 'bad' } } });
      expect(result.isError).toBe(true);
    });
  });

  // ─── restore_dashboard_version ───────────────────────────────────────

  describe('restore_dashboard_version', () => {
    it('should call restoreDashboardVersion and format response', async () => {
      vi.mocked(mockService.restoreDashboardVersion).mockResolvedValue({
        uid: 'dash-1',
        version: 5,
        status: 'success',
      });

      const handler = registry.getHandler('restore_dashboard_version')!;
      const result = await handler({
        params: { arguments: { uid: 'dash-1', version: 2 } },
      });

      expect(mockService.restoreDashboardVersion).toHaveBeenCalledWith('dash-1', 2);
      expect(result.content[0].text).toContain('Dashboard restored to version 2');
      expect(result.content[0].text).toContain('dash-1');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.restoreDashboardVersion).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('restore_dashboard_version')!;
      const result = await handler({
        params: { arguments: { uid: 'bad', version: 1 } },
      });
      expect(result.isError).toBe(true);
    });
  });

  // ─── delete_dashboard ────────────────────────────────────────────────

  describe('delete_dashboard', () => {
    it('should call deleteDashboard and format response', async () => {
      vi.mocked(mockService.deleteDashboard).mockResolvedValue(undefined);

      const handler = registry.getHandler('delete_dashboard')!;
      const result = await handler({ params: { arguments: { uid: 'dash-1' } } });

      expect(mockService.deleteDashboard).toHaveBeenCalledWith('dash-1');
      expect(result.content[0].text).toContain('dash-1 deleted successfully');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.deleteDashboard).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('delete_dashboard')!;
      const result = await handler({ params: { arguments: { uid: 'bad' } } });
      expect(result.isError).toBe(true);
    });
  });
});
