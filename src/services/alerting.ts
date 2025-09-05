import { GrafanaHttpClient } from "../http-client.js";
import { AlertRule, ContactPoint } from "../types.js";

/**
 * Service for managing Grafana alerting
 */
export class AlertingService {
  constructor(private httpClient: GrafanaHttpClient) {}

  /**
   * List all alert rules
   */
  async listAlertRules(): Promise<AlertRule[]> {
    return this.httpClient.get<AlertRule[]>("/api/ruler/grafana/api/v1/rules");
  }

  /**
   * Get alert rule by UID
   */
  async getAlertRuleByUid(uid: string): Promise<AlertRule> {
    const rules = await this.listAlertRules();
    const rule = rules.find((r) => r.uid === uid);

    if (!rule) {
      throw new Error(`Alert rule not found: ${uid}`);
    }

    return rule;
  }

  /**
   * List alert rules by folder
   */
  async getAlertRulesByFolder(folderUid: string): Promise<AlertRule[]> {
    const rules = await this.listAlertRules();
    return rules.filter((r) => r.folderUID === folderUid);
  }

  /**
   * Create alert rule
   */
  async createAlertRule(rule: Partial<AlertRule>): Promise<any> {
    if (!rule.folderUID) {
      throw new Error("folderUID is required for creating alert rules");
    }

    return this.httpClient.post(
      `/api/ruler/grafana/api/v1/rules/${rule.folderUID}`,
      {
        ...rule,
      },
    );
  }

  /**
   * Update alert rule
   */
  async updateAlertRule(uid: string, rule: Partial<AlertRule>): Promise<any> {
    const existingRule = await this.getAlertRuleByUid(uid);

    return this.httpClient.put(
      `/api/ruler/grafana/api/v1/rules/${existingRule.folderUID}`,
      {
        ...existingRule,
        ...rule,
        uid,
      },
    );
  }

  /**
   * Delete alert rule
   */
  async deleteAlertRule(uid: string): Promise<void> {
    const rule = await this.getAlertRuleByUid(uid);
    await this.httpClient.delete(
      `/api/ruler/grafana/api/v1/rules/${rule.folderUID}/${uid}`,
    );
  }

  /**
   * Test alert rule
   */
  async testAlertRule(rule: Partial<AlertRule>): Promise<any> {
    return this.httpClient.post("/api/v1/eval", rule);
  }

  /**
   * Get alert rule evaluation
   */
  async getAlertRuleEvaluation(uid: string): Promise<any> {
    return this.httpClient.get(`/api/v1/rule/test/${uid}`);
  }

  /**
   * List contact points
   */
  async listContactPoints(): Promise<ContactPoint[]> {
    return this.httpClient.get<ContactPoint[]>(
      "/api/v1/provisioning/contact-points",
    );
  }

  /**
   * Get contact point by UID
   */
  async getContactPointByUid(uid: string): Promise<ContactPoint> {
    return this.httpClient.get<ContactPoint>(
      `/api/v1/provisioning/contact-points/${uid}`,
    );
  }

  /**
   * Create contact point
   */
  async createContactPoint(contactPoint: Partial<ContactPoint>): Promise<any> {
    return this.httpClient.post(
      "/api/v1/provisioning/contact-points",
      contactPoint,
    );
  }

  /**
   * Update contact point
   */
  async updateContactPoint(
    uid: string,
    contactPoint: Partial<ContactPoint>,
  ): Promise<any> {
    return this.httpClient.put(
      `/api/v1/provisioning/contact-points/${uid}`,
      contactPoint,
    );
  }

  /**
   * Delete contact point
   */
  async deleteContactPoint(uid: string): Promise<void> {
    await this.httpClient.delete(`/api/v1/provisioning/contact-points/${uid}`);
  }

  /**
   * Test contact point
   */
  async testContactPoint(contactPoint: Partial<ContactPoint>): Promise<any> {
    return this.httpClient.post(
      "/api/v1/provisioning/contact-points/test",
      contactPoint,
    );
  }

  /**
   * List notification policies
   */
  async listNotificationPolicies(): Promise<any[]> {
    return this.httpClient.get("/api/v1/provisioning/policies");
  }

  /**
   * Get notification policy tree
   */
  async getNotificationPolicyTree(): Promise<any> {
    return this.httpClient.get("/api/v1/provisioning/policies");
  }

  /**
   * Update notification policy tree
   */
  async updateNotificationPolicyTree(policyTree: any): Promise<any> {
    return this.httpClient.put("/api/v1/provisioning/policies", policyTree);
  }

  /**
   * List mute timings
   */
  async listMuteTimings(): Promise<any[]> {
    return this.httpClient.get("/api/v1/provisioning/mute-timings");
  }

  /**
   * Get mute timing by name
   */
  async getMuteTimingByName(name: string): Promise<any> {
    return this.httpClient.get(
      `/api/v1/provisioning/mute-timings/${encodeURIComponent(name)}`,
    );
  }

  /**
   * Create mute timing
   */
  async createMuteTiming(muteTiming: any): Promise<any> {
    return this.httpClient.post(
      "/api/v1/provisioning/mute-timings",
      muteTiming,
    );
  }

  /**
   * Update mute timing
   */
  async updateMuteTiming(name: string, muteTiming: any): Promise<any> {
    return this.httpClient.put(
      `/api/v1/provisioning/mute-timings/${encodeURIComponent(name)}`,
      muteTiming,
    );
  }

  /**
   * Delete mute timing
   */
  async deleteMuteTiming(name: string): Promise<void> {
    await this.httpClient.delete(
      `/api/v1/provisioning/mute-timings/${encodeURIComponent(name)}`,
    );
  }

  /**
   * List alert instances (current alert status)
   */
  async listAlertInstances(): Promise<any[]> {
    return this.httpClient.get("/api/alertmanager/grafana/api/v2/alerts");
  }

  /**
   * Get alert instances for a specific rule
   */
  async getAlertInstancesByRule(ruleUid: string): Promise<any[]> {
    const instances = await this.listAlertInstances();
    return instances.filter(
      (instance) =>
        instance.labels && instance.labels.__alert_rule_uid__ === ruleUid,
    );
  }

  /**
   * Silence alerts
   */
  async createSilence(silence: {
    matchers: Array<{
      name: string;
      value: string;
      isRegex?: boolean;
      isEqual?: boolean;
    }>;
    startsAt: string;
    endsAt: string;
    createdBy: string;
    comment: string;
  }): Promise<any> {
    return this.httpClient.post(
      "/api/alertmanager/grafana/api/v2/silences",
      silence,
    );
  }

  /**
   * List silences
   */
  async listSilences(): Promise<any[]> {
    return this.httpClient.get("/api/alertmanager/grafana/api/v2/silences");
  }

  /**
   * Get silence by ID
   */
  async getSilenceById(id: string): Promise<any> {
    return this.httpClient.get(
      `/api/alertmanager/grafana/api/v2/silence/${id}`,
    );
  }

  /**
   * Delete silence
   */
  async deleteSilence(id: string): Promise<void> {
    await this.httpClient.delete(
      `/api/alertmanager/grafana/api/v2/silence/${id}`,
    );
  }

  /**
   * Get alertmanager status
   */
  async getAlertmanagerStatus(): Promise<any> {
    return this.httpClient.get("/api/alertmanager/grafana/api/v2/status");
  }

  /**
   * Get alertmanager configuration
   */
  async getAlertmanagerConfig(): Promise<any> {
    return this.httpClient.get("/api/v1/provisioning/alertmanagers");
  }

  /**
   * Update alertmanager configuration
   */
  async updateAlertmanagerConfig(config: any): Promise<any> {
    return this.httpClient.put("/api/v1/provisioning/alertmanagers", config);
  }

  /**
   * Get alert rule groups
   */
  async getAlertRuleGroups(): Promise<any[]> {
    return this.httpClient.get("/api/ruler/grafana/api/v1/rules");
  }

  /**
   * Pause/unpause alert rule
   */
  async pauseAlertRule(uid: string, _paused: boolean): Promise<any> {
    const rule = await this.getAlertRuleByUid(uid);
    return this.updateAlertRule(uid, {
      ...rule,
      // isPaused: paused, // TODO: Implement when supported by Grafana API
    });
  }

  /**
   * Get alert rule history
   */
  async getAlertRuleHistory(uid: string): Promise<any[]> {
    return this.httpClient.get(`/api/v1/rules/history?ruleUID=${uid}`);
  }

  /**
   * Export alert rules
   */
  async exportAlertRules(folderUid?: string): Promise<any> {
    const params = folderUid ? { folderUid } : {};
    return this.httpClient.get(
      "/api/ruler/grafana/api/v1/export/rules",
      params,
    );
  }

  /**
   * Import alert rules
   */
  async importAlertRules(rules: any): Promise<any> {
    return this.httpClient.post(
      "/api/ruler/grafana/api/v1/import/rules",
      rules,
    );
  }
}
