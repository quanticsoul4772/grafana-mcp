import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRegistry } from '../tool-registry.js';
import { AlertingService } from '../services/alerting.js';
import { registerAlertingTools } from './alerting.js';

const mockService = {
  listAlertRules: vi.fn(),
  getAlertRuleByUid: vi.fn(),
  createAlertRule: vi.fn(),
  updateAlertRule: vi.fn(),
  deleteAlertRule: vi.fn(),
  listContactPoints: vi.fn(),
  getContactPointByUid: vi.fn(),
  testContactPoint: vi.fn(),
  getAlertRuleGroups: vi.fn(),
} as unknown as AlertingService;

describe('Alerting Tools', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new ToolRegistry();
    registerAlertingTools(registry, mockService);
  });

  it('should register all 9 tools', () => {
    expect(registry.hasTool('list_alert_rules')).toBe(true);
    expect(registry.hasTool('get_alert_rule')).toBe(true);
    expect(registry.hasTool('create_alert_rule')).toBe(true);
    expect(registry.hasTool('update_alert_rule')).toBe(true);
    expect(registry.hasTool('delete_alert_rule')).toBe(true);
    expect(registry.hasTool('list_contact_points')).toBe(true);
    expect(registry.hasTool('get_contact_point')).toBe(true);
    expect(registry.hasTool('test_contact_point')).toBe(true);
    expect(registry.hasTool('list_alert_rule_groups')).toBe(true);
  });

  // ─── list_alert_rules ────────────────────────────────────────────────

  describe('list_alert_rules', () => {
    it('should call listAlertRules and format response', async () => {
      vi.mocked(mockService.listAlertRules).mockResolvedValue([
        {
          uid: 'rule-1',
          title: 'High CPU',
          folderUID: 'folder-1',
          ruleGroup: 'group-1',
          condition: 'A',
          intervalSeconds: 60,
          for: '5m',
          noDataState: 'NoData',
          execErrState: 'Alerting',
          updated: '2024-01-01',
        },
      ]);

      const handler = registry.getHandler('list_alert_rules')!;
      const result = await handler({ params: { arguments: {} } });

      expect(mockService.listAlertRules).toHaveBeenCalled();
      expect(result.content[0].text).toContain('Alert Rules (1 total)');
      expect(result.content[0].text).toContain('High CPU');
    });

    it('should filter by folderUID', async () => {
      vi.mocked(mockService.listAlertRules).mockResolvedValue([
        {
          uid: 'rule-1',
          title: 'Rule 1',
          folderUID: 'folder-1',
          ruleGroup: 'g1',
          condition: 'A',
          intervalSeconds: 60,
          for: '5m',
          noDataState: 'NoData',
          execErrState: 'Alerting',
          updated: '2024-01-01',
        },
        {
          uid: 'rule-2',
          title: 'Rule 2',
          folderUID: 'folder-2',
          ruleGroup: 'g2',
          condition: 'A',
          intervalSeconds: 60,
          for: '5m',
          noDataState: 'NoData',
          execErrState: 'Alerting',
          updated: '2024-01-01',
        },
      ]);

      const handler = registry.getHandler('list_alert_rules')!;
      const result = await handler({
        params: { arguments: { folderUID: 'folder-1' } },
      });

      expect(result.content[0].text).toContain('Alert Rules (1 total)');
      expect(result.content[0].text).toContain('Rule 1');
      expect(result.content[0].text).not.toContain('Rule 2');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.listAlertRules).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('list_alert_rules')!;
      const result = await handler({ params: { arguments: {} } });
      expect(result.isError).toBe(true);
    });
  });

  // ─── get_alert_rule ──────────────────────────────────────────────────

  describe('get_alert_rule', () => {
    it('should call getAlertRuleByUid and format response', async () => {
      vi.mocked(mockService.getAlertRuleByUid).mockResolvedValue({
        uid: 'rule-1',
        title: 'High CPU',
        folderUID: 'folder-1',
        ruleGroup: 'group-1',
        orgID: 1,
        condition: 'A',
        intervalSeconds: 60,
        for: '5m',
        noDataState: 'NoData',
        execErrState: 'Alerting',
        updated: '2024-01-01',
        labels: { severity: 'critical' },
        annotations: { summary: 'CPU is high' },
        data: [{ refId: 'A', queryType: 'instant' }],
      });

      const handler = registry.getHandler('get_alert_rule')!;
      const result = await handler({ params: { arguments: { uid: 'rule-1' } } });

      expect(mockService.getAlertRuleByUid).toHaveBeenCalledWith('rule-1');
      expect(result.content[0].text).toContain('Alert Rule: High CPU');
      expect(result.content[0].text).toContain('severity: critical');
      expect(result.content[0].text).toContain('summary: CPU is high');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.getAlertRuleByUid).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('get_alert_rule')!;
      const result = await handler({ params: { arguments: { uid: 'bad' } } });
      expect(result.isError).toBe(true);
    });
  });

  // ─── create_alert_rule ───────────────────────────────────────────────

  describe('create_alert_rule', () => {
    it('should call createAlertRule and format response', async () => {
      const createParams = {
        title: 'New Rule',
        condition: 'A',
        data: [],
        folderUID: 'folder-1',
        ruleGroup: 'group-1',
      };
      vi.mocked(mockService.createAlertRule).mockResolvedValue({
        uid: 'new-rule-uid',
        title: 'New Rule',
        folderUID: 'folder-1',
        ruleGroup: 'group-1',
      });

      const handler = registry.getHandler('create_alert_rule')!;
      const result = await handler({ params: { arguments: createParams } });

      expect(mockService.createAlertRule).toHaveBeenCalledWith(createParams);
      expect(result.content[0].text).toContain('Alert rule created successfully');
      expect(result.content[0].text).toContain('new-rule-uid');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.createAlertRule).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('create_alert_rule')!;
      const result = await handler({
        params: { arguments: { title: 'x', condition: 'A', data: [], folderUID: 'f', ruleGroup: 'g' } },
      });
      expect(result.isError).toBe(true);
    });
  });

  // ─── update_alert_rule ───────────────────────────────────────────────

  describe('update_alert_rule', () => {
    it('should call updateAlertRule and format response', async () => {
      vi.mocked(mockService.updateAlertRule).mockResolvedValue({
        uid: 'rule-1',
        title: 'Updated Rule',
        updated: '2024-02-01',
      });

      const handler = registry.getHandler('update_alert_rule')!;
      const result = await handler({
        params: { arguments: { uid: 'rule-1', title: 'Updated Rule' } },
      });

      expect(mockService.updateAlertRule).toHaveBeenCalledWith('rule-1', {
        uid: 'rule-1',
        title: 'Updated Rule',
      });
      expect(result.content[0].text).toContain('Alert rule updated successfully');
      expect(result.content[0].text).toContain('Updated Rule');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.updateAlertRule).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('update_alert_rule')!;
      const result = await handler({ params: { arguments: { uid: 'bad' } } });
      expect(result.isError).toBe(true);
    });
  });

  // ─── delete_alert_rule ───────────────────────────────────────────────

  describe('delete_alert_rule', () => {
    it('should call deleteAlertRule and format response', async () => {
      vi.mocked(mockService.deleteAlertRule).mockResolvedValue(undefined);

      const handler = registry.getHandler('delete_alert_rule')!;
      const result = await handler({ params: { arguments: { uid: 'rule-1' } } });

      expect(mockService.deleteAlertRule).toHaveBeenCalledWith('rule-1');
      expect(result.content[0].text).toContain('rule-1 deleted successfully');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.deleteAlertRule).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('delete_alert_rule')!;
      const result = await handler({ params: { arguments: { uid: 'bad' } } });
      expect(result.isError).toBe(true);
    });
  });

  // ─── list_contact_points ─────────────────────────────────────────────

  describe('list_contact_points', () => {
    it('should call listContactPoints and format response', async () => {
      vi.mocked(mockService.listContactPoints).mockResolvedValue([
        {
          uid: 'cp-1',
          name: 'Slack',
          type: 'slack',
          disableResolveMessage: false,
          settings: { url: 'https://hooks.slack.com/xxx' },
        },
      ]);

      const handler = registry.getHandler('list_contact_points')!;
      const result = await handler({ params: { arguments: {} } });

      expect(mockService.listContactPoints).toHaveBeenCalled();
      expect(result.content[0].text).toContain('Contact Points (1 total)');
      expect(result.content[0].text).toContain('Slack');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.listContactPoints).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('list_contact_points')!;
      const result = await handler({ params: { arguments: {} } });
      expect(result.isError).toBe(true);
    });
  });

  // ─── get_contact_point ───────────────────────────────────────────────

  describe('get_contact_point', () => {
    it('should call getContactPointByUid and format response', async () => {
      vi.mocked(mockService.getContactPointByUid).mockResolvedValue({
        uid: 'cp-1',
        name: 'Slack',
        type: 'slack',
        disableResolveMessage: false,
        settings: { url: 'https://hooks.slack.com/xxx' },
      });

      const handler = registry.getHandler('get_contact_point')!;
      const result = await handler({ params: { arguments: { uid: 'cp-1' } } });

      expect(mockService.getContactPointByUid).toHaveBeenCalledWith('cp-1');
      expect(result.content[0].text).toContain('Contact Point: Slack');
      expect(result.content[0].text).toContain('url: https://hooks.slack.com/xxx');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.getContactPointByUid).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('get_contact_point')!;
      const result = await handler({ params: { arguments: { uid: 'bad' } } });
      expect(result.isError).toBe(true);
    });
  });

  // ─── test_contact_point ──────────────────────────────────────────────

  describe('test_contact_point', () => {
    it('should call getContactPointByUid then testContactPoint and format response', async () => {
      const contactPoint = {
        uid: 'cp-1',
        name: 'Slack',
        type: 'slack',
        disableResolveMessage: false,
        settings: {},
      };
      vi.mocked(mockService.getContactPointByUid).mockResolvedValue(contactPoint);
      vi.mocked(mockService.testContactPoint).mockResolvedValue({
        status: 'Success',
      });

      const handler = registry.getHandler('test_contact_point')!;
      const result = await handler({ params: { arguments: { uid: 'cp-1' } } });

      expect(mockService.getContactPointByUid).toHaveBeenCalledWith('cp-1');
      expect(mockService.testContactPoint).toHaveBeenCalledWith(contactPoint);
      expect(result.content[0].text).toContain('Test notification sent to contact point cp-1');
      expect(result.content[0].text).toContain('Success');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.getContactPointByUid).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('test_contact_point')!;
      const result = await handler({ params: { arguments: { uid: 'bad' } } });
      expect(result.isError).toBe(true);
    });
  });

  // ─── list_alert_rule_groups ──────────────────────────────────────────

  describe('list_alert_rule_groups', () => {
    it('should call getAlertRuleGroups and format response', async () => {
      vi.mocked(mockService.getAlertRuleGroups).mockResolvedValue([
        {
          name: 'group-1',
          folderUID: 'folder-1',
          interval: '60s',
          rules: [{ uid: 'r1' }],
        },
      ]);

      const handler = registry.getHandler('list_alert_rule_groups')!;
      const result = await handler({ params: { arguments: {} } });

      expect(mockService.getAlertRuleGroups).toHaveBeenCalled();
      expect(result.content[0].text).toContain('Alert Rule Groups (1 total)');
      expect(result.content[0].text).toContain('group-1');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.getAlertRuleGroups).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('list_alert_rule_groups')!;
      const result = await handler({ params: { arguments: {} } });
      expect(result.isError).toBe(true);
    });
  });
});
