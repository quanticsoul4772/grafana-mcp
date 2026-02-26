import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRegistry } from '../tool-registry.js';
import { AdminService } from '../services/admin.js';
import { registerAdminTools } from './admin.js';

const mockService = {
  listTeams: vi.fn(),
  getTeamByUid: vi.fn(),
  listUsers: vi.fn(),
  getCurrentUser: vi.fn(),
  listFolders: vi.fn(),
  getFolderByUid: vi.fn(),
  listApiKeys: vi.fn(),
  listServiceAccounts: vi.fn(),
  getCurrentOrganization: vi.fn(),
} as unknown as AdminService;

describe('Admin Tools', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new ToolRegistry();
    registerAdminTools(registry, mockService);
  });

  it('should register all 9 tools', () => {
    expect(registry.hasTool('list_teams')).toBe(true);
    expect(registry.hasTool('get_team_by_uid')).toBe(true);
    expect(registry.hasTool('list_users')).toBe(true);
    expect(registry.hasTool('get_current_user')).toBe(true);
    expect(registry.hasTool('list_folders')).toBe(true);
    expect(registry.hasTool('get_folder_by_uid')).toBe(true);
    expect(registry.hasTool('list_api_keys')).toBe(true);
    expect(registry.hasTool('list_service_accounts')).toBe(true);
    expect(registry.hasTool('get_current_organization')).toBe(true);
  });

  // ─── list_teams ──────────────────────────────────────────────────────

  describe('list_teams', () => {
    it('should call listTeams and format response', async () => {
      vi.mocked(mockService.listTeams).mockResolvedValue({
        totalCount: 1,
        teams: [
          {
            id: 1,
            name: 'Team A',
            uid: 'team-a-uid',
            email: 'team@example.com',
            memberCount: 5,
            permission: 0,
          },
        ],
      });

      const handler = registry.getHandler('list_teams')!;
      const result = await handler({ params: { arguments: {} } });

      expect(mockService.listTeams).toHaveBeenCalledWith(1, 1000);
      expect(result.content[0].text).toContain('Teams (1 total)');
      expect(result.content[0].text).toContain('Team A');
      expect(result.content[0].text).toContain('team-a-uid');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.listTeams).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('list_teams')!;
      const result = await handler({ params: { arguments: {} } });
      expect(result.isError).toBe(true);
    });
  });

  // ─── get_team_by_uid ─────────────────────────────────────────────────

  describe('get_team_by_uid', () => {
    it('should call getTeamByUid and format response', async () => {
      vi.mocked(mockService.getTeamByUid).mockResolvedValue({
        id: 1,
        name: 'Team A',
        uid: 'team-a-uid',
        email: 'team@example.com',
        memberCount: 5,
        permission: 0,
        avatarUrl: '/avatar/team-a',
      });

      const handler = registry.getHandler('get_team_by_uid')!;
      const result = await handler({ params: { arguments: { uid: 'team-a-uid' } } });

      expect(mockService.getTeamByUid).toHaveBeenCalledWith('team-a-uid');
      expect(result.content[0].text).toContain('Team: Team A');
      expect(result.content[0].text).toContain('team-a-uid');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.getTeamByUid).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('get_team_by_uid')!;
      const result = await handler({ params: { arguments: { uid: 'bad' } } });
      expect(result.isError).toBe(true);
    });
  });

  // ─── list_users ──────────────────────────────────────────────────────

  describe('list_users', () => {
    it('should call listUsers and format response', async () => {
      vi.mocked(mockService.listUsers).mockResolvedValue({
        totalCount: 1,
        users: [
          {
            id: 1,
            name: 'Admin',
            login: 'admin',
            email: 'admin@example.com',
            isGrafanaAdmin: true,
            isDisabled: false,
            updatedAt: '2024-01-01',
          },
        ],
      });

      const handler = registry.getHandler('list_users')!;
      const result = await handler({ params: { arguments: {} } });

      expect(mockService.listUsers).toHaveBeenCalledWith(1, 1000);
      expect(result.content[0].text).toContain('Users (1 total)');
      expect(result.content[0].text).toContain('Admin');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.listUsers).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('list_users')!;
      const result = await handler({ params: { arguments: {} } });
      expect(result.isError).toBe(true);
    });
  });

  // ─── get_current_user ────────────────────────────────────────────────

  describe('get_current_user', () => {
    it('should call getCurrentUser and format response', async () => {
      vi.mocked(mockService.getCurrentUser).mockResolvedValue({
        id: 1,
        name: 'Admin',
        login: 'admin',
        email: 'admin@example.com',
        theme: 'dark',
        orgId: 1,
        isGrafanaAdmin: true,
        isDisabled: false,
        isExternal: false,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      });

      const handler = registry.getHandler('get_current_user')!;
      const result = await handler({ params: { arguments: {} } });

      expect(mockService.getCurrentUser).toHaveBeenCalled();
      expect(result.content[0].text).toContain('Current User: Admin');
      expect(result.content[0].text).toContain('admin@example.com');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.getCurrentUser).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('get_current_user')!;
      const result = await handler({ params: { arguments: {} } });
      expect(result.isError).toBe(true);
    });
  });

  // ─── list_folders ────────────────────────────────────────────────────

  describe('list_folders', () => {
    it('should call listFolders and format response', async () => {
      vi.mocked(mockService.listFolders).mockResolvedValue([
        {
          id: 1,
          title: 'General',
          uid: 'general-uid',
          url: '/dashboards/f/general-uid',
        },
      ]);

      const handler = registry.getHandler('list_folders')!;
      const result = await handler({ params: { arguments: {} } });

      expect(mockService.listFolders).toHaveBeenCalled();
      expect(result.content[0].text).toContain('Folders (1 total)');
      expect(result.content[0].text).toContain('General');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.listFolders).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('list_folders')!;
      const result = await handler({ params: { arguments: {} } });
      expect(result.isError).toBe(true);
    });
  });

  // ─── get_folder_by_uid ───────────────────────────────────────────────

  describe('get_folder_by_uid', () => {
    it('should call getFolderByUid and format response', async () => {
      vi.mocked(mockService.getFolderByUid).mockResolvedValue({
        id: 1,
        title: 'General',
        uid: 'general-uid',
        url: '/dashboards/f/general-uid',
        version: 1,
        created: '2024-01-01',
        updated: '2024-01-01',
        createdBy: 'admin',
        updatedBy: 'admin',
        canSave: true,
        canEdit: true,
        canAdmin: true,
        canDelete: true,
      });

      const handler = registry.getHandler('get_folder_by_uid')!;
      const result = await handler({ params: { arguments: { uid: 'general-uid' } } });

      expect(mockService.getFolderByUid).toHaveBeenCalledWith('general-uid');
      expect(result.content[0].text).toContain('Folder: General');
      expect(result.content[0].text).toContain('general-uid');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.getFolderByUid).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('get_folder_by_uid')!;
      const result = await handler({ params: { arguments: { uid: 'bad' } } });
      expect(result.isError).toBe(true);
    });
  });

  // ─── list_api_keys ───────────────────────────────────────────────────

  describe('list_api_keys', () => {
    it('should call listApiKeys and format response', async () => {
      vi.mocked(mockService.listApiKeys).mockResolvedValue([
        {
          id: 1,
          name: 'api-key-1',
          role: 'Admin',
          created: '2024-01-01',
          expiration: null,
          lastUsedAt: null,
        },
      ]);

      const handler = registry.getHandler('list_api_keys')!;
      const result = await handler({ params: { arguments: {} } });

      expect(mockService.listApiKeys).toHaveBeenCalled();
      expect(result.content[0].text).toContain('API Keys (1 total)');
      expect(result.content[0].text).toContain('api-key-1');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.listApiKeys).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('list_api_keys')!;
      const result = await handler({ params: { arguments: {} } });
      expect(result.isError).toBe(true);
    });
  });

  // ─── list_service_accounts ───────────────────────────────────────────

  describe('list_service_accounts', () => {
    it('should call listServiceAccounts and format response', async () => {
      vi.mocked(mockService.listServiceAccounts).mockResolvedValue([
        {
          id: 1,
          name: 'sa-test',
          login: 'sa-test',
          role: 'Viewer',
          isDisabled: false,
          created: '2024-01-01',
          avatarUrl: '/avatar/sa-test',
        },
      ]);

      const handler = registry.getHandler('list_service_accounts')!;
      const result = await handler({ params: { arguments: {} } });

      expect(mockService.listServiceAccounts).toHaveBeenCalled();
      expect(result.content[0].text).toContain('Service Accounts (1 total)');
      expect(result.content[0].text).toContain('sa-test');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.listServiceAccounts).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('list_service_accounts')!;
      const result = await handler({ params: { arguments: {} } });
      expect(result.isError).toBe(true);
    });
  });

  // ─── get_current_organization ────────────────────────────────────────

  describe('get_current_organization', () => {
    it('should call getCurrentOrganization and format response', async () => {
      vi.mocked(mockService.getCurrentOrganization).mockResolvedValue({
        id: 1,
        name: 'Main Org.',
        address1: '123 Main St',
        city: 'Springfield',
        country: 'US',
        state: 'IL',
        zipCode: '62704',
      });

      const handler = registry.getHandler('get_current_organization')!;
      const result = await handler({ params: { arguments: {} } });

      expect(mockService.getCurrentOrganization).toHaveBeenCalled();
      expect(result.content[0].text).toContain('Current Organization: Main Org.');
      expect(result.content[0].text).toContain('123 Main St');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.getCurrentOrganization).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('get_current_organization')!;
      const result = await handler({ params: { arguments: {} } });
      expect(result.isError).toBe(true);
    });
  });
});
