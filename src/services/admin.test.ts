import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminService } from './admin.js';
import { GrafanaHttpClient } from '../http-client.js';

// Mock the http client
const mockHttpClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
} as unknown as GrafanaHttpClient;

describe('AdminService', () => {
  let service: AdminService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AdminService(mockHttpClient);
  });

  // ─── Teams ───────────────────────────────────────────────────────────

  describe('Teams', () => {
    it('listTeams should search teams with default pagination', async () => {
      const mockResponse = {
        teams: [{ id: 1, name: 'Team A', uid: 'team-a' }],
        totalCount: 1,
        page: 1,
        perPage: 1000,
      };
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockResponse);

      const result = await service.listTeams();

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/teams/search', {
        page: 1,
        perpage: 1000,
      });
    });

    it('listTeams should accept custom pagination', async () => {
      const mockResponse = { teams: [], totalCount: 0, page: 2, perPage: 50 };
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockResponse);

      const result = await service.listTeams(2, 50);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/teams/search', {
        page: 2,
        perpage: 50,
      });
    });

    it('getTeamById should fetch team by numeric ID', async () => {
      const mockTeam = { id: 5, name: 'Team Five', uid: 'team-5' };
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockTeam);

      const result = await service.getTeamById(5);

      expect(result).toEqual(mockTeam);
      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/teams/5');
    });

    it('getTeamByUid should return matching team from list', async () => {
      const teams = [
        { id: 1, name: 'Alpha', uid: 'uid-alpha' },
        { id: 2, name: 'Beta', uid: 'uid-beta' },
      ];
      vi.mocked(mockHttpClient.get).mockResolvedValue({
        teams,
        totalCount: 2,
        page: 1,
        perPage: 1000,
      });

      const result = await service.getTeamByUid('uid-beta');

      expect(result).toEqual(teams[1]);
    });

    it('getTeamByUid should throw when team not found', async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue({
        teams: [],
        totalCount: 0,
        page: 1,
        perPage: 1000,
      });

      await expect(service.getTeamByUid('nonexistent')).rejects.toThrow(
        'Team not found: nonexistent',
      );
    });

    it('createTeam should post new team', async () => {
      const mockResponse = { teamId: 10, message: 'Team created' };
      vi.mocked(mockHttpClient.post).mockResolvedValue(mockResponse);

      const result = await service.createTeam({
        name: 'New Team',
        email: 'team@example.com',
      });

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.post).toHaveBeenCalledWith('/api/teams', {
        name: 'New Team',
        email: 'team@example.com',
      });
    });

    it('updateTeam should put team updates', async () => {
      const mockResponse = { message: 'Team updated' };
      vi.mocked(mockHttpClient.put).mockResolvedValue(mockResponse);

      const result = await service.updateTeam(3, { name: 'Renamed' });

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.put).toHaveBeenCalledWith('/api/teams/3', {
        name: 'Renamed',
      });
    });

    it('deleteTeam should delete team by ID', async () => {
      vi.mocked(mockHttpClient.delete).mockResolvedValue(undefined);

      await service.deleteTeam(7);

      expect(mockHttpClient.delete).toHaveBeenCalledWith('/api/teams/7');
    });

    it('getTeamMembers should fetch members list', async () => {
      const mockMembers = [
        { userId: 1, login: 'alice' },
        { userId: 2, login: 'bob' },
      ];
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockMembers);

      const result = await service.getTeamMembers(4);

      expect(result).toEqual(mockMembers);
      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/teams/4/members');
    });

    it('addTeamMember should post userId to team members', async () => {
      const mockResponse = { message: 'Member added' };
      vi.mocked(mockHttpClient.post).mockResolvedValue(mockResponse);

      const result = await service.addTeamMember(4, 10);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/teams/4/members',
        { userId: 10 },
      );
    });

    it('removeTeamMember should delete member from team', async () => {
      vi.mocked(mockHttpClient.delete).mockResolvedValue(undefined);

      await service.removeTeamMember(4, 10);

      expect(mockHttpClient.delete).toHaveBeenCalledWith(
        '/api/teams/4/members/10',
      );
    });

    it('updateTeamMemberPermissions should put permission for member', async () => {
      const mockResponse = { message: 'Permission updated' };
      vi.mocked(mockHttpClient.put).mockResolvedValue(mockResponse);

      const result = await service.updateTeamMemberPermissions(4, 10, 'Admin');

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.put).toHaveBeenCalledWith(
        '/api/teams/4/members/10',
        { permission: 'Admin' },
      );
    });

    it('getTeamPreferences should fetch team preferences', async () => {
      const mockPrefs = { theme: 'dark', homeDashboardUID: 'abc' };
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockPrefs);

      const result = await service.getTeamPreferences(2);

      expect(result).toEqual(mockPrefs);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/teams/2/preferences',
      );
    });

    it('updateTeamPreferences should put updated preferences', async () => {
      const prefs = { theme: 'light' };
      const mockResponse = { message: 'Preferences updated' };
      vi.mocked(mockHttpClient.put).mockResolvedValue(mockResponse);

      const result = await service.updateTeamPreferences(2, prefs);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.put).toHaveBeenCalledWith(
        '/api/teams/2/preferences',
        prefs,
      );
    });
  });

  // ─── Users ───────────────────────────────────────────────────────────

  describe('Users', () => {
    it('listUsers should search org users with default pagination', async () => {
      const mockResponse = {
        users: [{ id: 1, login: 'admin', email: 'admin@localhost' }],
        totalCount: 1,
        page: 1,
        perPage: 1000,
      };
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockResponse);

      const result = await service.listUsers();

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/org/users', {
        page: 1,
        perpage: 1000,
      });
    });

    it('listUsers should accept custom pagination', async () => {
      const mockResponse = {
        users: [],
        totalCount: 0,
        page: 3,
        perPage: 25,
      };
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockResponse);

      const result = await service.listUsers(3, 25);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/org/users', {
        page: 3,
        perpage: 25,
      });
    });

    it('getUserById should fetch user by numeric ID', async () => {
      const mockUser = { id: 42, login: 'testuser', email: 'test@example.com' };
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockUser);

      const result = await service.getUserById(42);

      expect(result).toEqual(mockUser);
      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/users/42');
    });

    it('getUserByLogin should lookup user by login or email', async () => {
      const mockUser = { id: 1, login: 'alice', email: 'alice@example.com' };
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockUser);

      const result = await service.getUserByLogin('alice');

      expect(result).toEqual(mockUser);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/users/lookup?loginOrEmail=alice',
      );
    });

    it('getUserByLogin should encode special characters', async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue({});

      await service.getUserByLogin('user@domain.com');

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/users/lookup?loginOrEmail=user%40domain.com',
      );
    });

    it('getCurrentUser should fetch the authenticated user', async () => {
      const mockUser = { id: 1, login: 'admin', isGrafanaAdmin: true };
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockUser);

      const result = await service.getCurrentUser();

      expect(result).toEqual(mockUser);
      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/user');
    });

    it('createUser should post new user to admin endpoint', async () => {
      const newUser = {
        name: 'New User',
        email: 'new@example.com',
        login: 'newuser',
        password: 'secret123',
        orgId: 1,
      };
      const mockResponse = { id: 99, message: 'User created' };
      vi.mocked(mockHttpClient.post).mockResolvedValue(mockResponse);

      const result = await service.createUser(newUser);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/admin/users',
        newUser,
      );
    });

    it('updateUser should put user updates', async () => {
      const mockResponse = { message: 'User updated' };
      vi.mocked(mockHttpClient.put).mockResolvedValue(mockResponse);

      const result = await service.updateUser(42, { name: 'Updated Name' });

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.put).toHaveBeenCalledWith('/api/users/42', {
        name: 'Updated Name',
      });
    });

    it('deleteUser should delete user via admin endpoint', async () => {
      vi.mocked(mockHttpClient.delete).mockResolvedValue(undefined);

      await service.deleteUser(42);

      expect(mockHttpClient.delete).toHaveBeenCalledWith(
        '/api/admin/users/42',
      );
    });

    it('updateUserPassword should put new password', async () => {
      const mockResponse = { message: 'Password updated' };
      vi.mocked(mockHttpClient.put).mockResolvedValue(mockResponse);

      const result = await service.updateUserPassword(42, 'newpass123');

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.put).toHaveBeenCalledWith(
        '/api/admin/users/42/password',
        { password: 'newpass123' },
      );
    });

    it('updateUserPermissions should put grafana admin flag', async () => {
      const mockResponse = { message: 'Permissions updated' };
      vi.mocked(mockHttpClient.put).mockResolvedValue(mockResponse);

      const result = await service.updateUserPermissions(42, true);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.put).toHaveBeenCalledWith(
        '/api/admin/users/42/permissions',
        { isGrafanaAdmin: true },
      );
    });

    it('setUserStatus should post disable endpoint when disabled=true', async () => {
      const mockResponse = { message: 'User disabled' };
      vi.mocked(mockHttpClient.post).mockResolvedValue(mockResponse);

      const result = await service.setUserStatus(42, true);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/admin/users/42/disable',
      );
    });

    it('setUserStatus should post enable endpoint when disabled=false', async () => {
      const mockResponse = { message: 'User enabled' };
      vi.mocked(mockHttpClient.post).mockResolvedValue(mockResponse);

      const result = await service.setUserStatus(42, false);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/admin/users/42/enable',
      );
    });

    it('getUserOrganizations should fetch user orgs', async () => {
      const mockOrgs = [
        { orgId: 1, name: 'Main Org', role: 'Admin' },
        { orgId: 2, name: 'Dev Org', role: 'Viewer' },
      ];
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockOrgs);

      const result = await service.getUserOrganizations(42);

      expect(result).toEqual(mockOrgs);
      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/users/42/orgs');
    });

    it('getUserTeams should fetch user teams', async () => {
      const mockTeams = [{ id: 1, name: 'Team A' }];
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockTeams);

      const result = await service.getUserTeams(42);

      expect(result).toEqual(mockTeams);
      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/users/42/teams');
    });
  });

  // ─── Organizations ──────────────────────────────────────────────────

  describe('Orgs', () => {
    it('getCurrentOrganization should fetch current org', async () => {
      const mockOrg = { id: 1, name: 'Main Org' };
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockOrg);

      const result = await service.getCurrentOrganization();

      expect(result).toEqual(mockOrg);
      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/org');
    });

    it('updateCurrentOrganization should put org updates', async () => {
      const mockResponse = { message: 'Organization updated' };
      vi.mocked(mockHttpClient.put).mockResolvedValue(mockResponse);

      const result = await service.updateCurrentOrganization({
        name: 'Renamed Org',
      });

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.put).toHaveBeenCalledWith('/api/org', {
        name: 'Renamed Org',
      });
    });

    it('getOrganizationUsers should fetch org users', async () => {
      const mockUsers = [
        { userId: 1, login: 'admin', role: 'Admin' },
        { userId: 2, login: 'editor', role: 'Editor' },
      ];
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockUsers);

      const result = await service.getOrganizationUsers();

      expect(result).toEqual(mockUsers);
      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/org/users');
    });

    it('addUserToOrganization should post login and role', async () => {
      const mockResponse = { message: 'User added to organization' };
      vi.mocked(mockHttpClient.post).mockResolvedValue(mockResponse);

      const result = await service.addUserToOrganization(
        'editor@example.com',
        'Editor',
      );

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.post).toHaveBeenCalledWith('/api/org/users', {
        loginOrEmail: 'editor@example.com',
        role: 'Editor',
      });
    });

    it('updateUserRoleInOrganization should patch user role', async () => {
      const mockResponse = { message: 'Organization user updated' };
      vi.mocked(mockHttpClient.patch).mockResolvedValue(mockResponse);

      const result = await service.updateUserRoleInOrganization(5, 'Admin');

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.patch).toHaveBeenCalledWith('/api/org/users/5', {
        role: 'Admin',
      });
    });

    it('removeUserFromOrganization should delete org user', async () => {
      vi.mocked(mockHttpClient.delete).mockResolvedValue(undefined);

      await service.removeUserFromOrganization(5);

      expect(mockHttpClient.delete).toHaveBeenCalledWith('/api/org/users/5');
    });
  });

  // ─── Folders ────────────────────────────────────────────────────────

  describe('Folders', () => {
    it('listFolders should fetch all folders', async () => {
      const mockFolders = [
        { uid: 'folder-a', title: 'Folder A' },
        { uid: 'folder-b', title: 'Folder B' },
      ];
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockFolders);

      const result = await service.listFolders();

      expect(result).toEqual(mockFolders);
      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/folders');
    });

    it('getFolderByUid should fetch folder by UID', async () => {
      const mockFolder = { uid: 'folder-a', title: 'Folder A', id: 1 };
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockFolder);

      const result = await service.getFolderByUid('folder-a');

      expect(result).toEqual(mockFolder);
      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/folders/folder-a');
    });

    it('createFolder should post new folder', async () => {
      const mockResponse = { uid: 'new-folder', title: 'New Folder', id: 10 };
      vi.mocked(mockHttpClient.post).mockResolvedValue(mockResponse);

      const result = await service.createFolder({
        title: 'New Folder',
        uid: 'new-folder',
        parentUid: 'parent-uid',
      });

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.post).toHaveBeenCalledWith('/api/folders', {
        title: 'New Folder',
        uid: 'new-folder',
        parentUid: 'parent-uid',
      });
    });

    it('updateFolder should put folder updates', async () => {
      const mockResponse = { uid: 'folder-a', title: 'Updated', version: 2 };
      vi.mocked(mockHttpClient.put).mockResolvedValue(mockResponse);

      const result = await service.updateFolder('folder-a', {
        title: 'Updated',
        version: 1,
      });

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.put).toHaveBeenCalledWith('/api/folders/folder-a', {
        title: 'Updated',
        version: 1,
      });
    });

    it('deleteFolder should delete folder by UID', async () => {
      vi.mocked(mockHttpClient.delete).mockResolvedValue(undefined);

      await service.deleteFolder('folder-a');

      expect(mockHttpClient.delete).toHaveBeenCalledWith(
        '/api/folders/folder-a',
      );
    });

    it('getFolderPermissions should fetch folder permissions', async () => {
      const mockPerms = [
        { role: 'Viewer', permission: 1 },
        { role: 'Editor', permission: 2 },
      ];
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockPerms);

      const result = await service.getFolderPermissions('folder-a');

      expect(result).toEqual(mockPerms);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/folders/folder-a/permissions',
      );
    });

    it('updateFolderPermissions should post permissions with items wrapper', async () => {
      const permissions = [
        { role: 'Viewer', permission: 1 },
        { teamId: 1, permission: 2 },
      ];
      vi.mocked(mockHttpClient.post).mockResolvedValue(undefined);

      await service.updateFolderPermissions('folder-a', permissions);

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/folders/folder-a/permissions',
        { items: permissions },
      );
    });
  });

  // ─── API Keys ───────────────────────────────────────────────────────

  describe('API Keys', () => {
    it('listApiKeys should fetch all API keys', async () => {
      const mockKeys = [
        { id: 1, name: 'key-1', role: 'Admin' },
        { id: 2, name: 'key-2', role: 'Viewer' },
      ];
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockKeys);

      const result = await service.listApiKeys();

      expect(result).toEqual(mockKeys);
      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/auth/keys');
    });

    it('createApiKey should post new API key', async () => {
      const mockResponse = { id: 3, name: 'new-key', key: 'eyJ...' };
      vi.mocked(mockHttpClient.post).mockResolvedValue(mockResponse);

      const result = await service.createApiKey({
        name: 'new-key',
        role: 'Editor',
        secondsToLive: 3600,
      });

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.post).toHaveBeenCalledWith('/api/auth/keys', {
        name: 'new-key',
        role: 'Editor',
        secondsToLive: 3600,
      });
    });

    it('deleteApiKey should delete API key by ID', async () => {
      vi.mocked(mockHttpClient.delete).mockResolvedValue(undefined);

      await service.deleteApiKey(3);

      expect(mockHttpClient.delete).toHaveBeenCalledWith('/api/auth/keys/3');
    });
  });

  // ─── Service Accounts ──────────────────────────────────────────────

  describe('Service Accounts', () => {
    it('listServiceAccounts should fetch all service accounts', async () => {
      const mockAccounts = [
        { id: 1, name: 'sa-1', role: 'Admin', isDisabled: false },
      ];
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockAccounts);

      const result = await service.listServiceAccounts();

      expect(result).toEqual(mockAccounts);
      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/serviceaccounts');
    });

    it('getServiceAccountById should fetch service account by ID', async () => {
      const mockAccount = { id: 5, name: 'sa-5', role: 'Viewer' };
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockAccount);

      const result = await service.getServiceAccountById(5);

      expect(result).toEqual(mockAccount);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/serviceaccounts/5',
      );
    });

    it('createServiceAccount should post new service account', async () => {
      const newAccount = {
        name: 'sa-new',
        role: 'Editor' as const,
        isDisabled: false,
      };
      const mockResponse = { id: 10, ...newAccount };
      vi.mocked(mockHttpClient.post).mockResolvedValue(mockResponse);

      const result = await service.createServiceAccount(newAccount);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/serviceaccounts',
        newAccount,
      );
    });

    it('updateServiceAccount should patch service account', async () => {
      const updates = { name: 'sa-renamed', role: 'Admin' as const };
      const mockResponse = { id: 5, ...updates };
      vi.mocked(mockHttpClient.patch).mockResolvedValue(mockResponse);

      const result = await service.updateServiceAccount(5, updates);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.patch).toHaveBeenCalledWith(
        '/api/serviceaccounts/5',
        updates,
      );
    });

    it('deleteServiceAccount should delete service account by ID', async () => {
      vi.mocked(mockHttpClient.delete).mockResolvedValue(undefined);

      await service.deleteServiceAccount(5);

      expect(mockHttpClient.delete).toHaveBeenCalledWith(
        '/api/serviceaccounts/5',
      );
    });

    it('listServiceAccountTokens should fetch tokens for a service account', async () => {
      const mockTokens = [
        { id: 1, name: 'token-1', created: '2023-01-01' },
        { id: 2, name: 'token-2', created: '2023-06-01' },
      ];
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockTokens);

      const result = await service.listServiceAccountTokens(5);

      expect(result).toEqual(mockTokens);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/serviceaccounts/5/tokens',
      );
    });

    it('createServiceAccountToken should post new token', async () => {
      const tokenInput = { name: 'new-token', secondsToLive: 86400 };
      const mockResponse = { id: 3, name: 'new-token', key: 'glsa_...' };
      vi.mocked(mockHttpClient.post).mockResolvedValue(mockResponse);

      const result = await service.createServiceAccountToken(5, tokenInput);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/serviceaccounts/5/tokens',
        tokenInput,
      );
    });

    it('deleteServiceAccountToken should delete token by IDs', async () => {
      vi.mocked(mockHttpClient.delete).mockResolvedValue(undefined);

      await service.deleteServiceAccountToken(5, 3);

      expect(mockHttpClient.delete).toHaveBeenCalledWith(
        '/api/serviceaccounts/5/tokens/3',
      );
    });
  });
});
