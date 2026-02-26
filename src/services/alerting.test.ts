import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlertingService } from './alerting.js';
import { GrafanaHttpClient } from '../http-client.js';
import type { AlertRule, ContactPoint } from '../types.js';

// Mock the http client
const mockHttpClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
} as unknown as GrafanaHttpClient;

const mockAlertRules: AlertRule[] = [
  {
    id: 1,
    uid: 'rule-1',
    title: 'High CPU Usage',
    condition: 'A',
    data: [{ refId: 'A', queryType: 'prometheus' }],
    intervalSeconds: 60,
    noDataState: 'NoData',
    execErrState: 'Error',
    for: '5m',
    annotations: { summary: 'CPU is high' },
    labels: { severity: 'critical' },
    folderUID: 'folder-1',
    ruleGroup: 'cpu-alerts',
    orgID: 1,
    updated: '2025-01-01T00:00:00Z',
  },
  {
    id: 2,
    uid: 'rule-2',
    title: 'Memory Alert',
    condition: 'B',
    data: [{ refId: 'B', queryType: 'prometheus' }],
    intervalSeconds: 120,
    noDataState: 'OK',
    execErrState: 'Error',
    for: '10m',
    annotations: { summary: 'Memory is high' },
    labels: { severity: 'warning' },
    folderUID: 'folder-2',
    ruleGroup: 'memory-alerts',
    orgID: 1,
    updated: '2025-01-02T00:00:00Z',
  },
];

const mockContactPoints: ContactPoint[] = [
  {
    uid: 'cp-1',
    name: 'Slack Notifications',
    type: 'slack',
    settings: { url: 'https://hooks.slack.com/test' },
    disableResolveMessage: false,
  },
  {
    uid: 'cp-2',
    name: 'Email Notifications',
    type: 'email',
    settings: { addresses: 'admin@example.com' },
    disableResolveMessage: true,
  },
];

describe('AlertingService', () => {
  let service: AlertingService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AlertingService(mockHttpClient);
  });

  // ── Alert Rules ──────────────────────────────────────────────────

  describe('listAlertRules', () => {
    it('should list all alert rules', async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockAlertRules);

      const result = await service.listAlertRules();

      expect(result).toEqual(mockAlertRules);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/ruler/grafana/api/v1/rules',
      );
    });

    it('should return empty array when no rules exist', async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue([]);

      const result = await service.listAlertRules();

      expect(result).toEqual([]);
    });
  });

  describe('getAlertRuleByUid', () => {
    it('should return the matching rule when found', async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockAlertRules);

      const result = await service.getAlertRuleByUid('rule-1');

      expect(result).toEqual(mockAlertRules[0]);
    });

    it('should throw an error when the rule is not found', async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockAlertRules);

      await expect(
        service.getAlertRuleByUid('non-existent'),
      ).rejects.toThrow('Alert rule not found: non-existent');
    });

    it('should throw when rule list is empty', async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue([]);

      await expect(service.getAlertRuleByUid('rule-1')).rejects.toThrow(
        'Alert rule not found: rule-1',
      );
    });
  });

  describe('getAlertRulesByFolder', () => {
    it('should return rules matching the folder UID', async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockAlertRules);

      const result = await service.getAlertRulesByFolder('folder-1');

      expect(result).toEqual([mockAlertRules[0]]);
    });

    it('should return empty array when no rules match the folder', async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockAlertRules);

      const result = await service.getAlertRulesByFolder('non-existent-folder');

      expect(result).toEqual([]);
    });
  });

  describe('createAlertRule', () => {
    it('should create an alert rule with the correct endpoint', async () => {
      const newRule: Partial<AlertRule> = {
        title: 'New Rule',
        folderUID: 'folder-1',
        condition: 'A',
        data: [],
      };
      const mockResponse = { uid: 'new-rule-uid' };
      vi.mocked(mockHttpClient.post).mockResolvedValue(mockResponse);

      const result = await service.createAlertRule(newRule);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/ruler/grafana/api/v1/rules/folder-1',
        newRule,
      );
    });

    it('should throw when folderUID is missing', async () => {
      const newRule: Partial<AlertRule> = {
        title: 'New Rule',
        condition: 'A',
      };

      await expect(service.createAlertRule(newRule)).rejects.toThrow(
        'folderUID is required for creating alert rules',
      );
      expect(mockHttpClient.post).not.toHaveBeenCalled();
    });
  });

  describe('updateAlertRule', () => {
    it('should update an existing alert rule', async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockAlertRules);
      const mockResponse = { uid: 'rule-1', title: 'Updated Rule' };
      vi.mocked(mockHttpClient.put).mockResolvedValue(mockResponse);

      const updates: Partial<AlertRule> = { title: 'Updated Rule' };
      const result = await service.updateAlertRule('rule-1', updates);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.put).toHaveBeenCalledWith(
        '/api/ruler/grafana/api/v1/rules/folder-1',
        {
          ...mockAlertRules[0],
          ...updates,
          uid: 'rule-1',
        },
      );
    });

    it('should throw when the rule to update does not exist', async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockAlertRules);

      await expect(
        service.updateAlertRule('non-existent', { title: 'Updated' }),
      ).rejects.toThrow('Alert rule not found: non-existent');
      expect(mockHttpClient.put).not.toHaveBeenCalled();
    });

    it('should preserve the uid even if updates contain a different uid', async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockAlertRules);
      vi.mocked(mockHttpClient.put).mockResolvedValue({});

      await service.updateAlertRule('rule-1', {
        title: 'Updated',
        uid: 'should-be-overridden',
      } as any);

      const putPayload = vi.mocked(mockHttpClient.put).mock.calls[0][1];
      expect(putPayload.uid).toBe('rule-1');
    });
  });

  describe('deleteAlertRule', () => {
    it('should delete an existing alert rule', async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockAlertRules);
      vi.mocked(mockHttpClient.delete).mockResolvedValue(undefined);

      await service.deleteAlertRule('rule-1');

      expect(mockHttpClient.delete).toHaveBeenCalledWith(
        '/api/ruler/grafana/api/v1/rules/folder-1/rule-1',
      );
    });

    it('should throw when the rule to delete does not exist', async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockAlertRules);

      await expect(service.deleteAlertRule('non-existent')).rejects.toThrow(
        'Alert rule not found: non-existent',
      );
      expect(mockHttpClient.delete).not.toHaveBeenCalled();
    });
  });

  describe('testAlertRule', () => {
    it('should test an alert rule', async () => {
      const rulePayload: Partial<AlertRule> = {
        condition: 'A',
        data: [{ refId: 'A', queryType: 'prometheus' }],
      };
      const mockResponse = { state: 'firing' };
      vi.mocked(mockHttpClient.post).mockResolvedValue(mockResponse);

      const result = await service.testAlertRule(rulePayload);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/v1/eval',
        rulePayload,
      );
    });
  });

  describe('getAlertRuleEvaluation', () => {
    it('should get alert rule evaluation by uid', async () => {
      const mockResponse = { status: 'ok', results: [] };
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockResponse);

      const result = await service.getAlertRuleEvaluation('rule-1');

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/v1/rule/test/rule-1',
      );
    });
  });

  // ── Contact Points ───────────────────────────────────────────────

  describe('listContactPoints', () => {
    it('should list all contact points', async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockContactPoints);

      const result = await service.listContactPoints();

      expect(result).toEqual(mockContactPoints);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/v1/provisioning/contact-points',
      );
    });

    it('should return empty array when no contact points exist', async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue([]);

      const result = await service.listContactPoints();

      expect(result).toEqual([]);
    });
  });

  describe('getContactPointByUid', () => {
    it('should get a contact point by uid', async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockContactPoints[0]);

      const result = await service.getContactPointByUid('cp-1');

      expect(result).toEqual(mockContactPoints[0]);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/v1/provisioning/contact-points/cp-1',
      );
    });
  });

  describe('createContactPoint', () => {
    it('should create a contact point', async () => {
      const newCp: Partial<ContactPoint> = {
        name: 'PagerDuty',
        type: 'pagerduty',
        settings: { integrationKey: 'abc123' },
      };
      const mockResponse = { uid: 'cp-3', ...newCp };
      vi.mocked(mockHttpClient.post).mockResolvedValue(mockResponse);

      const result = await service.createContactPoint(newCp);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/v1/provisioning/contact-points',
        newCp,
      );
    });
  });

  describe('updateContactPoint', () => {
    it('should update a contact point by uid', async () => {
      const updates: Partial<ContactPoint> = {
        name: 'Updated Slack',
        settings: { url: 'https://hooks.slack.com/updated' },
      };
      const mockResponse = { uid: 'cp-1', ...updates };
      vi.mocked(mockHttpClient.put).mockResolvedValue(mockResponse);

      const result = await service.updateContactPoint('cp-1', updates);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.put).toHaveBeenCalledWith(
        '/api/v1/provisioning/contact-points/cp-1',
        updates,
      );
    });
  });

  describe('deleteContactPoint', () => {
    it('should delete a contact point by uid', async () => {
      vi.mocked(mockHttpClient.delete).mockResolvedValue(undefined);

      await service.deleteContactPoint('cp-1');

      expect(mockHttpClient.delete).toHaveBeenCalledWith(
        '/api/v1/provisioning/contact-points/cp-1',
      );
    });
  });

  describe('testContactPoint', () => {
    it('should test a contact point', async () => {
      const cpPayload: Partial<ContactPoint> = {
        type: 'slack',
        settings: { url: 'https://hooks.slack.com/test' },
      };
      const mockResponse = { status: 'ok' };
      vi.mocked(mockHttpClient.post).mockResolvedValue(mockResponse);

      const result = await service.testContactPoint(cpPayload);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/v1/provisioning/contact-points/test',
        cpPayload,
      );
    });
  });

  // ── Notification Policies ────────────────────────────────────────

  describe('listNotificationPolicies', () => {
    it('should list notification policies', async () => {
      const mockPolicies = [
        { receiver: 'default', group_by: ['alertname'] },
      ];
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockPolicies);

      const result = await service.listNotificationPolicies();

      expect(result).toEqual(mockPolicies);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/v1/provisioning/policies',
      );
    });
  });

  describe('getNotificationPolicyTree', () => {
    it('should get the notification policy tree', async () => {
      const mockTree = {
        receiver: 'default',
        group_by: ['alertname'],
        routes: [{ receiver: 'slack', matchers: ['severity=critical'] }],
      };
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockTree);

      const result = await service.getNotificationPolicyTree();

      expect(result).toEqual(mockTree);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/v1/provisioning/policies',
      );
    });
  });

  describe('updateNotificationPolicyTree', () => {
    it('should update the notification policy tree', async () => {
      const updatedTree = {
        receiver: 'default',
        group_by: ['alertname', 'namespace'],
        routes: [],
      };
      const mockResponse = { message: 'policies updated' };
      vi.mocked(mockHttpClient.put).mockResolvedValue(mockResponse);

      const result = await service.updateNotificationPolicyTree(updatedTree);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.put).toHaveBeenCalledWith(
        '/api/v1/provisioning/policies',
        updatedTree,
      );
    });
  });

  // ── Mute Timings ─────────────────────────────────────────────────

  describe('listMuteTimings', () => {
    it('should list all mute timings', async () => {
      const mockTimings = [
        { name: 'weekends', time_intervals: [] },
        { name: 'holidays', time_intervals: [] },
      ];
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockTimings);

      const result = await service.listMuteTimings();

      expect(result).toEqual(mockTimings);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/v1/provisioning/mute-timings',
      );
    });
  });

  describe('getMuteTimingByName', () => {
    it('should get a mute timing by name', async () => {
      const mockTiming = { name: 'weekends', time_intervals: [] };
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockTiming);

      const result = await service.getMuteTimingByName('weekends');

      expect(result).toEqual(mockTiming);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/v1/provisioning/mute-timings/weekends',
      );
    });

    it('should encode special characters in the name', async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue({});

      await service.getMuteTimingByName('my timing / special');

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/v1/provisioning/mute-timings/my%20timing%20%2F%20special',
      );
    });
  });

  describe('createMuteTiming', () => {
    it('should create a mute timing', async () => {
      const newTiming = {
        name: 'night-hours',
        time_intervals: [{ times: [{ start_time: '22:00', end_time: '06:00' }] }],
      };
      const mockResponse = { ...newTiming };
      vi.mocked(mockHttpClient.post).mockResolvedValue(mockResponse);

      const result = await service.createMuteTiming(newTiming);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/v1/provisioning/mute-timings',
        newTiming,
      );
    });
  });

  describe('updateMuteTiming', () => {
    it('should update a mute timing by name', async () => {
      const updatedTiming = {
        name: 'weekends',
        time_intervals: [{ weekdays: ['saturday', 'sunday'] }],
      };
      const mockResponse = { ...updatedTiming };
      vi.mocked(mockHttpClient.put).mockResolvedValue(mockResponse);

      const result = await service.updateMuteTiming('weekends', updatedTiming);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.put).toHaveBeenCalledWith(
        '/api/v1/provisioning/mute-timings/weekends',
        updatedTiming,
      );
    });

    it('should encode special characters in the name', async () => {
      vi.mocked(mockHttpClient.put).mockResolvedValue({});

      await service.updateMuteTiming('my timing', { name: 'my timing' });

      expect(mockHttpClient.put).toHaveBeenCalledWith(
        '/api/v1/provisioning/mute-timings/my%20timing',
        { name: 'my timing' },
      );
    });
  });

  describe('deleteMuteTiming', () => {
    it('should delete a mute timing by name', async () => {
      vi.mocked(mockHttpClient.delete).mockResolvedValue(undefined);

      await service.deleteMuteTiming('weekends');

      expect(mockHttpClient.delete).toHaveBeenCalledWith(
        '/api/v1/provisioning/mute-timings/weekends',
      );
    });

    it('should encode special characters in the name', async () => {
      vi.mocked(mockHttpClient.delete).mockResolvedValue(undefined);

      await service.deleteMuteTiming('my timing');

      expect(mockHttpClient.delete).toHaveBeenCalledWith(
        '/api/v1/provisioning/mute-timings/my%20timing',
      );
    });
  });

  // ── Alert Instances ──────────────────────────────────────────────

  describe('listAlertInstances', () => {
    it('should list all alert instances', async () => {
      const mockInstances = [
        {
          labels: { __alert_rule_uid__: 'rule-1', alertname: 'HighCPU' },
          state: 'active',
        },
        {
          labels: { __alert_rule_uid__: 'rule-2', alertname: 'HighMemory' },
          state: 'suppressed',
        },
      ];
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockInstances);

      const result = await service.listAlertInstances();

      expect(result).toEqual(mockInstances);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/alertmanager/grafana/api/v2/alerts',
      );
    });

    it('should return empty array when no instances exist', async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue([]);

      const result = await service.listAlertInstances();

      expect(result).toEqual([]);
    });
  });

  describe('getAlertInstancesByRule', () => {
    const mockInstances = [
      {
        labels: { __alert_rule_uid__: 'rule-1', alertname: 'HighCPU' },
        state: 'active',
      },
      {
        labels: { __alert_rule_uid__: 'rule-2', alertname: 'HighMemory' },
        state: 'suppressed',
      },
      {
        labels: { __alert_rule_uid__: 'rule-1', alertname: 'HighCPU-2' },
        state: 'active',
      },
    ];

    it('should filter instances by rule UID', async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockInstances);

      const result = await service.getAlertInstancesByRule('rule-1');

      expect(result).toHaveLength(2);
      expect(result[0].labels.__alert_rule_uid__).toBe('rule-1');
      expect(result[1].labels.__alert_rule_uid__).toBe('rule-1');
    });

    it('should return empty array when no instances match the rule', async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockInstances);

      const result = await service.getAlertInstancesByRule('non-existent');

      expect(result).toEqual([]);
    });

    it('should handle instances without labels', async () => {
      const instancesWithMissingLabels = [
        { state: 'active' },
        { labels: null, state: 'active' },
        {
          labels: { __alert_rule_uid__: 'rule-1', alertname: 'HighCPU' },
          state: 'active',
        },
      ];
      vi.mocked(mockHttpClient.get).mockResolvedValue(
        instancesWithMissingLabels,
      );

      const result = await service.getAlertInstancesByRule('rule-1');

      expect(result).toHaveLength(1);
    });
  });

  // ── Silences ─────────────────────────────────────────────────────

  describe('createSilence', () => {
    it('should create a silence', async () => {
      const silencePayload = {
        matchers: [
          { name: 'alertname', value: 'HighCPU', isRegex: false, isEqual: true },
        ],
        startsAt: '2025-01-01T00:00:00Z',
        endsAt: '2025-01-02T00:00:00Z',
        createdBy: 'admin',
        comment: 'Maintenance window',
      };
      const mockResponse = { silenceID: 'silence-1' };
      vi.mocked(mockHttpClient.post).mockResolvedValue(mockResponse);

      const result = await service.createSilence(silencePayload);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/alertmanager/grafana/api/v2/silences',
        silencePayload,
      );
    });
  });

  describe('listSilences', () => {
    it('should list all silences', async () => {
      const mockSilences = [
        { id: 'silence-1', status: { state: 'active' } },
        { id: 'silence-2', status: { state: 'expired' } },
      ];
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockSilences);

      const result = await service.listSilences();

      expect(result).toEqual(mockSilences);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/alertmanager/grafana/api/v2/silences',
      );
    });
  });

  describe('getSilenceById', () => {
    it('should get a silence by ID', async () => {
      const mockSilence = {
        id: 'silence-1',
        status: { state: 'active' },
        matchers: [{ name: 'alertname', value: 'HighCPU' }],
      };
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockSilence);

      const result = await service.getSilenceById('silence-1');

      expect(result).toEqual(mockSilence);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/alertmanager/grafana/api/v2/silence/silence-1',
      );
    });
  });

  describe('deleteSilence', () => {
    it('should delete a silence by ID', async () => {
      vi.mocked(mockHttpClient.delete).mockResolvedValue(undefined);

      await service.deleteSilence('silence-1');

      expect(mockHttpClient.delete).toHaveBeenCalledWith(
        '/api/alertmanager/grafana/api/v2/silence/silence-1',
      );
    });
  });

  // ── Alertmanager Status & Config ─────────────────────────────────

  describe('getAlertmanagerStatus', () => {
    it('should get alertmanager status', async () => {
      const mockStatus = {
        cluster: { status: 'ready', peers: [] },
        config: {},
        uptime: '2025-01-01T00:00:00Z',
      };
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockStatus);

      const result = await service.getAlertmanagerStatus();

      expect(result).toEqual(mockStatus);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/alertmanager/grafana/api/v2/status',
      );
    });
  });

  describe('getAlertmanagerConfig', () => {
    it('should get alertmanager configuration', async () => {
      const mockConfig = { global: {}, route: {}, receivers: [] };
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockConfig);

      const result = await service.getAlertmanagerConfig();

      expect(result).toEqual(mockConfig);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/v1/provisioning/alertmanagers',
      );
    });
  });

  describe('updateAlertmanagerConfig', () => {
    it('should update alertmanager configuration', async () => {
      const newConfig = { global: {}, route: { receiver: 'new' }, receivers: [] };
      const mockResponse = { message: 'configuration updated' };
      vi.mocked(mockHttpClient.put).mockResolvedValue(mockResponse);

      const result = await service.updateAlertmanagerConfig(newConfig);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.put).toHaveBeenCalledWith(
        '/api/v1/provisioning/alertmanagers',
        newConfig,
      );
    });
  });

  // ── Alert Rule Groups ────────────────────────────────────────────

  describe('getAlertRuleGroups', () => {
    it('should get alert rule groups', async () => {
      const mockGroups = [
        { name: 'group-1', folder: 'folder-1', rules: [] },
        { name: 'group-2', folder: 'folder-2', rules: [] },
      ];
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockGroups);

      const result = await service.getAlertRuleGroups();

      expect(result).toEqual(mockGroups);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/ruler/grafana/api/v1/rules',
      );
    });
  });

  // ── Pause/Unpause ────────────────────────────────────────────────

  describe('pauseAlertRule', () => {
    it('should pause an alert rule by updating it', async () => {
      // getAlertRuleByUid needs to find the rule (called by both getAlertRuleByUid in pauseAlertRule and updateAlertRule)
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockAlertRules);
      vi.mocked(mockHttpClient.put).mockResolvedValue({ uid: 'rule-1' });

      const result = await service.pauseAlertRule('rule-1', true);

      expect(result).toEqual({ uid: 'rule-1' });
      // updateAlertRule calls put with the rule data
      expect(mockHttpClient.put).toHaveBeenCalledWith(
        '/api/ruler/grafana/api/v1/rules/folder-1',
        expect.objectContaining({ uid: 'rule-1' }),
      );
    });

    it('should throw when rule does not exist', async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue([]);

      await expect(service.pauseAlertRule('non-existent', true)).rejects.toThrow(
        'Alert rule not found: non-existent',
      );
    });
  });

  // ── Alert Rule History ───────────────────────────────────────────

  describe('getAlertRuleHistory', () => {
    it('should get alert rule history by uid', async () => {
      const mockHistory = [
        { timestamp: '2025-01-01T00:00:00Z', state: 'firing' },
        { timestamp: '2025-01-01T01:00:00Z', state: 'normal' },
      ];
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockHistory);

      const result = await service.getAlertRuleHistory('rule-1');

      expect(result).toEqual(mockHistory);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/v1/rules/history?ruleUID=rule-1',
      );
    });
  });

  // ── Export/Import ────────────────────────────────────────────────

  describe('exportAlertRules', () => {
    it('should export all alert rules when no folder is specified', async () => {
      const mockExport = { groups: [] };
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockExport);

      const result = await service.exportAlertRules();

      expect(result).toEqual(mockExport);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/ruler/grafana/api/v1/export/rules',
        {},
      );
    });

    it('should export alert rules filtered by folder', async () => {
      const mockExport = { groups: [] };
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockExport);

      const result = await service.exportAlertRules('folder-1');

      expect(result).toEqual(mockExport);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/ruler/grafana/api/v1/export/rules',
        { folderUid: 'folder-1' },
      );
    });
  });

  describe('importAlertRules', () => {
    it('should import alert rules', async () => {
      const rulesPayload = { groups: [{ name: 'imported', rules: [] }] };
      const mockResponse = { message: 'rules imported' };
      vi.mocked(mockHttpClient.post).mockResolvedValue(mockResponse);

      const result = await service.importAlertRules(rulesPayload);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/ruler/grafana/api/v1/import/rules',
        rulesPayload,
      );
    });
  });

  // ── Error Handling ───────────────────────────────────────────────

  describe('error handling', () => {
    it('should propagate HTTP client errors from listAlertRules', async () => {
      vi.mocked(mockHttpClient.get).mockRejectedValue(
        new Error('Network error'),
      );

      await expect(service.listAlertRules()).rejects.toThrow('Network error');
    });

    it('should propagate HTTP client errors from createSilence', async () => {
      vi.mocked(mockHttpClient.post).mockRejectedValue(
        new Error('403 Forbidden'),
      );

      await expect(
        service.createSilence({
          matchers: [{ name: 'a', value: 'b' }],
          startsAt: '2025-01-01T00:00:00Z',
          endsAt: '2025-01-02T00:00:00Z',
          createdBy: 'admin',
          comment: 'test',
        }),
      ).rejects.toThrow('403 Forbidden');
    });

    it('should propagate HTTP client errors from deleteMuteTiming', async () => {
      vi.mocked(mockHttpClient.delete).mockRejectedValue(
        new Error('Not Found'),
      );

      await expect(service.deleteMuteTiming('non-existent')).rejects.toThrow(
        'Not Found',
      );
    });
  });
});
