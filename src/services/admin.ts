import { GrafanaHttpClient } from "../http-client.js";
import { Team, GrafanaUser } from "../types.js";

/**
 * Service for managing Grafana admin operations (teams, users, etc.)
 */
export class AdminService {
  constructor(private httpClient: GrafanaHttpClient) {}

  // Team management

  /**
   * List all teams
   */
  async listTeams(
    page = 1,
    perpage = 1000,
  ): Promise<{
    teams: Team[];
    totalCount: number;
    page: number;
    perPage: number;
  }> {
    const params = { page, perpage };
    return this.httpClient.get("/api/teams/search", params);
  }

  /**
   * Get team by ID
   */
  async getTeamById(id: number): Promise<Team> {
    return this.httpClient.get<Team>(`/api/teams/${id}`);
  }

  /**
   * Get team by UID
   */
  async getTeamByUid(uid: string): Promise<Team> {
    const teams = await this.listTeams();
    const team = teams.teams.find((t) => t.uid === uid);

    if (!team) {
      throw new Error(`Team not found: ${uid}`);
    }

    return team;
  }

  /**
   * Create team
   */
  async createTeam(team: { name: string; email?: string }): Promise<any> {
    return this.httpClient.post("/api/teams", team);
  }

  /**
   * Update team
   */
  async updateTeam(id: number, team: Partial<Team>): Promise<any> {
    return this.httpClient.put(`/api/teams/${id}`, team);
  }

  /**
   * Delete team
   */
  async deleteTeam(id: number): Promise<void> {
    await this.httpClient.delete(`/api/teams/${id}`);
  }

  /**
   * Get team members
   */
  async getTeamMembers(id: number): Promise<any[]> {
    return this.httpClient.get(`/api/teams/${id}/members`);
  }

  /**
   * Add team member
   */
  async addTeamMember(teamId: number, userId: number): Promise<any> {
    return this.httpClient.post(`/api/teams/${teamId}/members`, { userId });
  }

  /**
   * Remove team member
   */
  async removeTeamMember(teamId: number, userId: number): Promise<void> {
    await this.httpClient.delete(`/api/teams/${teamId}/members/${userId}`);
  }

  /**
   * Update team member permissions
   */
  async updateTeamMemberPermissions(
    teamId: number,
    userId: number,
    permission: "Member" | "Admin",
  ): Promise<any> {
    return this.httpClient.put(`/api/teams/${teamId}/members/${userId}`, {
      permission,
    });
  }

  /**
   * Get team preferences
   */
  async getTeamPreferences(id: number): Promise<any> {
    return this.httpClient.get(`/api/teams/${id}/preferences`);
  }

  /**
   * Update team preferences
   */
  async updateTeamPreferences(id: number, preferences: any): Promise<any> {
    return this.httpClient.put(`/api/teams/${id}/preferences`, preferences);
  }

  // User management

  /**
   * List all users in organization
   */
  async listUsers(
    page = 1,
    perpage = 1000,
  ): Promise<{
    users: GrafanaUser[];
    totalCount: number;
    page: number;
    perPage: number;
  }> {
    const params = { page, perpage };
    return this.httpClient.get("/api/org/users", params);
  }

  /**
   * Get user by ID
   */
  async getUserById(id: number): Promise<GrafanaUser> {
    return this.httpClient.get<GrafanaUser>(`/api/users/${id}`);
  }

  /**
   * Get user by login
   */
  async getUserByLogin(login: string): Promise<GrafanaUser> {
    return this.httpClient.get<GrafanaUser>(
      `/api/users/lookup?loginOrEmail=${encodeURIComponent(login)}`,
    );
  }

  /**
   * Get current user
   */
  async getCurrentUser(): Promise<GrafanaUser> {
    return this.httpClient.get<GrafanaUser>("/api/user");
  }

  /**
   * Create user
   */
  async createUser(user: {
    name: string;
    email: string;
    login: string;
    password: string;
    orgId?: number;
  }): Promise<any> {
    return this.httpClient.post("/api/admin/users", user);
  }

  /**
   * Update user
   */
  async updateUser(id: number, user: Partial<GrafanaUser>): Promise<any> {
    return this.httpClient.put(`/api/users/${id}`, user);
  }

  /**
   * Delete user
   */
  async deleteUser(id: number): Promise<void> {
    await this.httpClient.delete(`/api/admin/users/${id}`);
  }

  /**
   * Update user password
   */
  async updateUserPassword(id: number, password: string): Promise<any> {
    return this.httpClient.put(`/api/admin/users/${id}/password`, { password });
  }

  /**
   * Update user permissions
   */
  async updateUserPermissions(
    id: number,
    isGrafanaAdmin: boolean,
  ): Promise<any> {
    return this.httpClient.put(`/api/admin/users/${id}/permissions`, {
      isGrafanaAdmin,
    });
  }

  /**
   * Disable/enable user
   */
  async setUserStatus(id: number, disabled: boolean): Promise<any> {
    const endpoint = disabled ? "disable" : "enable";
    return this.httpClient.post(`/api/admin/users/${id}/${endpoint}`);
  }

  /**
   * Get user organizations
   */
  async getUserOrganizations(id: number): Promise<any[]> {
    return this.httpClient.get(`/api/users/${id}/orgs`);
  }

  /**
   * Get user teams
   */
  async getUserTeams(id: number): Promise<any[]> {
    return this.httpClient.get(`/api/users/${id}/teams`);
  }

  // Organization management

  /**
   * Get current organization
   */
  async getCurrentOrganization(): Promise<any> {
    return this.httpClient.get("/api/org");
  }

  /**
   * Update current organization
   */
  async updateCurrentOrganization(org: { name?: string }): Promise<any> {
    return this.httpClient.put("/api/org", org);
  }

  /**
   * Get organization users
   */
  async getOrganizationUsers(): Promise<any[]> {
    return this.httpClient.get("/api/org/users");
  }

  /**
   * Add user to organization
   */
  async addUserToOrganization(
    loginOrEmail: string,
    role: "Viewer" | "Editor" | "Admin",
  ): Promise<any> {
    return this.httpClient.post("/api/org/users", {
      loginOrEmail,
      role,
    });
  }

  /**
   * Update user role in organization
   */
  async updateUserRoleInOrganization(
    userId: number,
    role: "Viewer" | "Editor" | "Admin",
  ): Promise<any> {
    return this.httpClient.patch(`/api/org/users/${userId}`, { role });
  }

  /**
   * Remove user from organization
   */
  async removeUserFromOrganization(userId: number): Promise<void> {
    await this.httpClient.delete(`/api/org/users/${userId}`);
  }

  // Folder management

  /**
   * List folders
   */
  async listFolders(): Promise<any[]> {
    return this.httpClient.get("/api/folders");
  }

  /**
   * Get folder by UID
   */
  async getFolderByUid(uid: string): Promise<any> {
    return this.httpClient.get(`/api/folders/${uid}`);
  }

  /**
   * Create folder
   */
  async createFolder(folder: {
    title: string;
    uid?: string;
    parentUid?: string;
  }): Promise<any> {
    return this.httpClient.post("/api/folders", folder);
  }

  /**
   * Update folder
   */
  async updateFolder(
    uid: string,
    folder: {
      title?: string;
      version?: number;
    },
  ): Promise<any> {
    return this.httpClient.put(`/api/folders/${uid}`, folder);
  }

  /**
   * Delete folder
   */
  async deleteFolder(uid: string): Promise<void> {
    await this.httpClient.delete(`/api/folders/${uid}`);
  }

  /**
   * Get folder permissions
   */
  async getFolderPermissions(uid: string): Promise<any[]> {
    return this.httpClient.get(`/api/folders/${uid}/permissions`);
  }

  /**
   * Update folder permissions
   */
  async updateFolderPermissions(
    uid: string,
    permissions: any[],
  ): Promise<void> {
    await this.httpClient.post(`/api/folders/${uid}/permissions`, {
      items: permissions,
    });
  }

  // API key management

  /**
   * List API keys
   */
  async listApiKeys(): Promise<any[]> {
    return this.httpClient.get("/api/auth/keys");
  }

  /**
   * Create API key
   */
  async createApiKey(apiKey: {
    name: string;
    role: "Viewer" | "Editor" | "Admin";
    secondsToLive?: number;
  }): Promise<any> {
    return this.httpClient.post("/api/auth/keys", apiKey);
  }

  /**
   * Delete API key
   */
  async deleteApiKey(id: number): Promise<void> {
    await this.httpClient.delete(`/api/auth/keys/${id}`);
  }

  // Service account management

  /**
   * List service accounts
   */
  async listServiceAccounts(): Promise<any[]> {
    return this.httpClient.get("/api/serviceaccounts");
  }

  /**
   * Get service account by ID
   */
  async getServiceAccountById(id: number): Promise<any> {
    return this.httpClient.get(`/api/serviceaccounts/${id}`);
  }

  /**
   * Create service account
   */
  async createServiceAccount(serviceAccount: {
    name: string;
    role: "Viewer" | "Editor" | "Admin";
    isDisabled?: boolean;
  }): Promise<any> {
    return this.httpClient.post("/api/serviceaccounts", serviceAccount);
  }

  /**
   * Update service account
   */
  async updateServiceAccount(
    id: number,
    serviceAccount: {
      name?: string;
      role?: "Viewer" | "Editor" | "Admin";
      isDisabled?: boolean;
    },
  ): Promise<any> {
    return this.httpClient.patch(`/api/serviceaccounts/${id}`, serviceAccount);
  }

  /**
   * Delete service account
   */
  async deleteServiceAccount(id: number): Promise<void> {
    await this.httpClient.delete(`/api/serviceaccounts/${id}`);
  }

  /**
   * List service account tokens
   */
  async listServiceAccountTokens(serviceAccountId: number): Promise<any[]> {
    return this.httpClient.get(
      `/api/serviceaccounts/${serviceAccountId}/tokens`,
    );
  }

  /**
   * Create service account token
   */
  async createServiceAccountToken(
    serviceAccountId: number,
    token: {
      name: string;
      secondsToLive?: number;
    },
  ): Promise<any> {
    return this.httpClient.post(
      `/api/serviceaccounts/${serviceAccountId}/tokens`,
      token,
    );
  }

  /**
   * Delete service account token
   */
  async deleteServiceAccountToken(
    serviceAccountId: number,
    tokenId: number,
  ): Promise<void> {
    await this.httpClient.delete(
      `/api/serviceaccounts/${serviceAccountId}/tokens/${tokenId}`,
    );
  }
}
