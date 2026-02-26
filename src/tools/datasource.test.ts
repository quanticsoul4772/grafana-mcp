import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRegistry } from '../tool-registry.js';
import { DatasourceService } from '../services/datasource.js';
import { registerDatasourceTools } from './datasource.js';

const mockService = {
  listDatasources: vi.fn(),
  getDatasourceByUid: vi.fn(),
  getDatasourceByName: vi.fn(),
  testDatasourceByUid: vi.fn(),
  getDatasourcesByType: vi.fn(),
  getDefaultDatasource: vi.fn(),
  datasourceExists: vi.fn(),
  datasourceExistsByName: vi.fn(),
} as unknown as DatasourceService;

describe('Datasource Tools', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new ToolRegistry();
    registerDatasourceTools(registry, mockService);
  });

  it('should register all 7 tools', () => {
    expect(registry.hasTool('list_datasources')).toBe(true);
    expect(registry.hasTool('get_datasource_by_uid')).toBe(true);
    expect(registry.hasTool('get_datasource_by_name')).toBe(true);
    expect(registry.hasTool('test_datasource_connection')).toBe(true);
    expect(registry.hasTool('get_datasources_by_type')).toBe(true);
    expect(registry.hasTool('get_default_datasource')).toBe(true);
    expect(registry.hasTool('check_datasource_exists')).toBe(true);
  });

  // ─── list_datasources ────────────────────────────────────────────────

  describe('list_datasources', () => {
    it('should call listDatasources and format response', async () => {
      vi.mocked(mockService.listDatasources).mockResolvedValue([
        {
          id: 1,
          uid: 'prom-1',
          name: 'Prometheus',
          type: 'prometheus',
          url: 'http://prometheus:9090',
          access: 'proxy',
          isDefault: true,
          readOnly: false,
          basicAuth: false,
        },
      ]);

      const handler = registry.getHandler('list_datasources')!;
      const result = await handler({ params: { arguments: {} } });

      expect(mockService.listDatasources).toHaveBeenCalled();
      expect(result.content[0].text).toContain('Configured Datasources (1 total)');
      expect(result.content[0].text).toContain('Prometheus');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.listDatasources).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('list_datasources')!;
      const result = await handler({ params: { arguments: {} } });
      expect(result.isError).toBe(true);
    });
  });

  // ─── get_datasource_by_uid ───────────────────────────────────────────

  describe('get_datasource_by_uid', () => {
    it('should call getDatasourceByUid and format response', async () => {
      vi.mocked(mockService.getDatasourceByUid).mockResolvedValue({
        id: 1,
        uid: 'prom-1',
        name: 'Prometheus',
        type: 'prometheus',
        url: 'http://prometheus:9090',
        access: 'proxy',
        isDefault: true,
        readOnly: false,
        basicAuth: false,
        withCredentials: false,
        jsonData: { timeInterval: '15s' },
      });

      const handler = registry.getHandler('get_datasource_by_uid')!;
      const result = await handler({ params: { arguments: { uid: 'prom-1' } } });

      expect(mockService.getDatasourceByUid).toHaveBeenCalledWith('prom-1');
      expect(result.content[0].text).toContain('Datasource Details: Prometheus');
      expect(result.content[0].text).toContain('timeInterval');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.getDatasourceByUid).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('get_datasource_by_uid')!;
      const result = await handler({ params: { arguments: { uid: 'bad' } } });
      expect(result.isError).toBe(true);
    });
  });

  // ─── get_datasource_by_name ──────────────────────────────────────────

  describe('get_datasource_by_name', () => {
    it('should call getDatasourceByName and format response', async () => {
      vi.mocked(mockService.getDatasourceByName).mockResolvedValue({
        id: 1,
        uid: 'prom-1',
        name: 'Prometheus',
        type: 'prometheus',
        url: 'http://prometheus:9090',
        access: 'proxy',
        isDefault: true,
        readOnly: false,
        basicAuth: false,
        withCredentials: false,
        jsonData: {},
      });

      const handler = registry.getHandler('get_datasource_by_name')!;
      const result = await handler({ params: { arguments: { name: 'Prometheus' } } });

      expect(mockService.getDatasourceByName).toHaveBeenCalledWith('Prometheus');
      expect(result.content[0].text).toContain('Datasource Details: Prometheus');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.getDatasourceByName).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('get_datasource_by_name')!;
      const result = await handler({ params: { arguments: { name: 'bad' } } });
      expect(result.isError).toBe(true);
    });
  });

  // ─── test_datasource_connection ──────────────────────────────────────

  describe('test_datasource_connection', () => {
    it('should call testDatasourceByUid and format response', async () => {
      vi.mocked(mockService.testDatasourceByUid).mockResolvedValue({
        status: 'OK',
        message: 'Data source is working',
      });

      const handler = registry.getHandler('test_datasource_connection')!;
      const result = await handler({ params: { arguments: { uid: 'prom-1' } } });

      expect(mockService.testDatasourceByUid).toHaveBeenCalledWith('prom-1');
      expect(result.content[0].text).toContain('Datasource Connection Test Results');
      expect(result.content[0].text).toContain('OK');
      expect(result.content[0].text).toContain('Data source is working');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.testDatasourceByUid).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('test_datasource_connection')!;
      const result = await handler({ params: { arguments: { uid: 'bad' } } });
      expect(result.isError).toBe(true);
    });
  });

  // ─── get_datasources_by_type ─────────────────────────────────────────

  describe('get_datasources_by_type', () => {
    it('should call getDatasourcesByType and format response', async () => {
      vi.mocked(mockService.getDatasourcesByType).mockResolvedValue([
        {
          uid: 'prom-1',
          name: 'Prometheus',
          url: 'http://prometheus:9090',
          isDefault: true,
          access: 'proxy',
        },
      ]);

      const handler = registry.getHandler('get_datasources_by_type')!;
      const result = await handler({ params: { arguments: { type: 'prometheus' } } });

      expect(mockService.getDatasourcesByType).toHaveBeenCalledWith('prometheus');
      expect(result.content[0].text).toContain('Prometheus Datasources (1 found)');
    });

    it('should handle empty results', async () => {
      vi.mocked(mockService.getDatasourcesByType).mockResolvedValue([]);

      const handler = registry.getHandler('get_datasources_by_type')!;
      const result = await handler({ params: { arguments: { type: 'mysql' } } });

      expect(result.content[0].text).toContain('No datasources found of type: mysql');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.getDatasourcesByType).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('get_datasources_by_type')!;
      const result = await handler({ params: { arguments: { type: 'bad' } } });
      expect(result.isError).toBe(true);
    });
  });

  // ─── get_default_datasource ──────────────────────────────────────────

  describe('get_default_datasource', () => {
    it('should call getDefaultDatasource and format response', async () => {
      vi.mocked(mockService.getDefaultDatasource).mockResolvedValue({
        uid: 'prom-1',
        name: 'Prometheus',
        type: 'prometheus',
        url: 'http://prometheus:9090',
        access: 'proxy',
      });

      const handler = registry.getHandler('get_default_datasource')!;
      const result = await handler({ params: { arguments: {} } });

      expect(mockService.getDefaultDatasource).toHaveBeenCalled();
      expect(result.content[0].text).toContain('Default Datasource: Prometheus');
    });

    it('should handle no default datasource', async () => {
      vi.mocked(mockService.getDefaultDatasource).mockResolvedValue(null);

      const handler = registry.getHandler('get_default_datasource')!;
      const result = await handler({ params: { arguments: {} } });

      expect(result.content[0].text).toContain('No default datasource found');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.getDefaultDatasource).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('get_default_datasource')!;
      const result = await handler({ params: { arguments: {} } });
      expect(result.isError).toBe(true);
    });
  });

  // ─── check_datasource_exists ─────────────────────────────────────────

  describe('check_datasource_exists', () => {
    it('should check by UID and report exists', async () => {
      vi.mocked(mockService.datasourceExists).mockResolvedValue(true);

      const handler = registry.getHandler('check_datasource_exists')!;
      const result = await handler({ params: { arguments: { uid: 'prom-1' } } });

      expect(mockService.datasourceExists).toHaveBeenCalledWith('prom-1');
      expect(result.content[0].text).toContain('UID: prom-1');
      expect(result.content[0].text).toContain('exists');
    });

    it('should check by name and report does not exist', async () => {
      vi.mocked(mockService.datasourceExistsByName).mockResolvedValue(false);

      const handler = registry.getHandler('check_datasource_exists')!;
      const result = await handler({ params: { arguments: { name: 'Missing' } } });

      expect(mockService.datasourceExistsByName).toHaveBeenCalledWith('Missing');
      expect(result.content[0].text).toContain('Name: Missing');
      expect(result.content[0].text).toContain('does not exist');
    });

    it('should handle errors', async () => {
      vi.mocked(mockService.datasourceExists).mockRejectedValue(new Error('API error'));
      const handler = registry.getHandler('check_datasource_exists')!;
      const result = await handler({ params: { arguments: { uid: 'bad' } } });
      expect(result.isError).toBe(true);
    });
  });
});
