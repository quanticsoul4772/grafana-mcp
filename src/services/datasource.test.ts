import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatasourceService } from './datasource.js';
import { GrafanaHttpClient } from '../http-client.js';
import type { Datasource } from '../types.js';

// Mock the http client
const mockHttpClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
} as unknown as GrafanaHttpClient;

// Helper to build a mock datasource
function makeDatasource(overrides: Partial<Datasource> = {}): Datasource {
  return {
    id: 1,
    uid: 'ds-uid-1',
    name: 'Prometheus',
    type: 'prometheus',
    url: 'http://prometheus:9090',
    access: 'proxy',
    isDefault: false,
    basicAuth: false,
    withCredentials: false,
    jsonData: {},
    readOnly: false,
    ...overrides,
  };
}

describe('DatasourceService', () => {
  let service: DatasourceService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DatasourceService(mockHttpClient);
  });

  describe('listDatasources', () => {
    it('should list all datasources', async () => {
      const mockDatasources = [
        makeDatasource({ id: 1, uid: 'ds-1', name: 'Prometheus' }),
        makeDatasource({ id: 2, uid: 'ds-2', name: 'Loki', type: 'loki' }),
      ];
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockDatasources);

      const result = await service.listDatasources();

      expect(result).toEqual(mockDatasources);
      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/datasources');
    });

    it('should return empty array when no datasources exist', async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue([]);

      const result = await service.listDatasources();

      expect(result).toEqual([]);
    });

    it('should propagate errors from http client', async () => {
      vi.mocked(mockHttpClient.get).mockRejectedValue(new Error('Unauthorized'));

      await expect(service.listDatasources()).rejects.toThrow('Unauthorized');
    });
  });

  describe('getDatasourceByUid', () => {
    it('should get datasource by UID', async () => {
      const mockDs = makeDatasource({ uid: 'abc-123' });
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockDs);

      const result = await service.getDatasourceByUid('abc-123');

      expect(result).toEqual(mockDs);
      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/datasources/uid/abc-123');
    });

    it('should propagate 404 errors for non-existent UIDs', async () => {
      vi.mocked(mockHttpClient.get).mockRejectedValue(new Error('Datasource not found'));

      await expect(service.getDatasourceByUid('non-existent')).rejects.toThrow(
        'Datasource not found',
      );
    });
  });

  describe('getDatasourceByName', () => {
    it('should get datasource by name', async () => {
      const mockDs = makeDatasource({ name: 'My Prometheus' });
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockDs);

      const result = await service.getDatasourceByName('My Prometheus');

      expect(result).toEqual(mockDs);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/datasources/name/My%20Prometheus',
      );
    });

    it('should URL-encode special characters in datasource name', async () => {
      const mockDs = makeDatasource({ name: 'DS/with&special=chars' });
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockDs);

      await service.getDatasourceByName('DS/with&special=chars');

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        `/api/datasources/name/${encodeURIComponent('DS/with&special=chars')}`,
      );
    });

    it('should propagate errors for non-existent names', async () => {
      vi.mocked(mockHttpClient.get).mockRejectedValue(new Error('Not found'));

      await expect(service.getDatasourceByName('nope')).rejects.toThrow('Not found');
    });
  });

  describe('getDatasourceById', () => {
    it('should get datasource by numeric ID', async () => {
      const mockDs = makeDatasource({ id: 42 });
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockDs);

      const result = await service.getDatasourceById(42);

      expect(result).toEqual(mockDs);
      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/datasources/42');
    });

    it('should propagate errors for invalid IDs', async () => {
      vi.mocked(mockHttpClient.get).mockRejectedValue(new Error('Datasource not found'));

      await expect(service.getDatasourceById(999)).rejects.toThrow('Datasource not found');
    });
  });

  describe('createDatasource', () => {
    it('should create a datasource', async () => {
      const newDs: Partial<Datasource> = {
        name: 'New Prometheus',
        type: 'prometheus',
        url: 'http://prometheus:9090',
        access: 'proxy',
      };
      const mockResponse = { id: 5, message: 'Datasource added', datasource: { ...newDs, id: 5 } };
      vi.mocked(mockHttpClient.post).mockResolvedValue(mockResponse);

      const result = await service.createDatasource(newDs);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.post).toHaveBeenCalledWith('/api/datasources', newDs);
    });

    it('should send partial datasource data', async () => {
      const minimalDs: Partial<Datasource> = { name: 'Minimal', type: 'testdata' };
      vi.mocked(mockHttpClient.post).mockResolvedValue({ id: 10 });

      await service.createDatasource(minimalDs);

      expect(mockHttpClient.post).toHaveBeenCalledWith('/api/datasources', minimalDs);
    });

    it('should propagate errors on duplicate names', async () => {
      vi.mocked(mockHttpClient.post).mockRejectedValue(new Error('Datasource with the same name already exists'));

      await expect(
        service.createDatasource({ name: 'duplicate', type: 'prometheus' }),
      ).rejects.toThrow('Datasource with the same name already exists');
    });
  });

  describe('updateDatasource', () => {
    it('should update a datasource by ID', async () => {
      const updateData: Partial<Datasource> = {
        name: 'Updated Prometheus',
        url: 'http://new-prometheus:9090',
      };
      const mockResponse = { datasource: { id: 1, ...updateData }, message: 'Datasource updated' };
      vi.mocked(mockHttpClient.put).mockResolvedValue(mockResponse);

      const result = await service.updateDatasource(1, updateData);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.put).toHaveBeenCalledWith('/api/datasources/1', updateData);
    });

    it('should propagate errors for non-existent datasource update', async () => {
      vi.mocked(mockHttpClient.put).mockRejectedValue(new Error('Datasource not found'));

      await expect(service.updateDatasource(999, { name: 'x' })).rejects.toThrow(
        'Datasource not found',
      );
    });
  });

  describe('deleteDatasourceById', () => {
    it('should delete datasource by ID', async () => {
      vi.mocked(mockHttpClient.delete).mockResolvedValue(undefined);

      await service.deleteDatasourceById(1);

      expect(mockHttpClient.delete).toHaveBeenCalledWith('/api/datasources/1');
    });

    it('should propagate errors on delete failure', async () => {
      vi.mocked(mockHttpClient.delete).mockRejectedValue(new Error('Forbidden'));

      await expect(service.deleteDatasourceById(1)).rejects.toThrow('Forbidden');
    });
  });

  describe('deleteDatasourceByUid', () => {
    it('should delete datasource by UID', async () => {
      vi.mocked(mockHttpClient.delete).mockResolvedValue(undefined);

      await service.deleteDatasourceByUid('ds-uid-1');

      expect(mockHttpClient.delete).toHaveBeenCalledWith('/api/datasources/uid/ds-uid-1');
    });

    it('should propagate errors on delete failure', async () => {
      vi.mocked(mockHttpClient.delete).mockRejectedValue(new Error('Not found'));

      await expect(service.deleteDatasourceByUid('bad-uid')).rejects.toThrow('Not found');
    });
  });

  describe('deleteDatasourceByName', () => {
    it('should delete datasource by name', async () => {
      vi.mocked(mockHttpClient.delete).mockResolvedValue(undefined);

      await service.deleteDatasourceByName('Prometheus');

      expect(mockHttpClient.delete).toHaveBeenCalledWith('/api/datasources/name/Prometheus');
    });

    it('should URL-encode special characters in name', async () => {
      vi.mocked(mockHttpClient.delete).mockResolvedValue(undefined);

      await service.deleteDatasourceByName('DS with spaces');

      expect(mockHttpClient.delete).toHaveBeenCalledWith(
        `/api/datasources/name/${encodeURIComponent('DS with spaces')}`,
      );
    });
  });

  describe('testDatasource', () => {
    it('should test a datasource connection', async () => {
      const dsConfig: Partial<Datasource> = {
        name: 'Prometheus',
        type: 'prometheus',
        url: 'http://prometheus:9090',
        access: 'proxy',
      };
      const mockResponse = { status: 'success', message: 'Data source is working' };
      vi.mocked(mockHttpClient.post).mockResolvedValue(mockResponse);

      const result = await service.testDatasource(dsConfig);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.post).toHaveBeenCalledWith('/api/datasources/test', dsConfig);
    });

    it('should return failure status for unreachable datasource', async () => {
      const mockResponse = { status: 'error', message: 'Connection refused' };
      vi.mocked(mockHttpClient.post).mockResolvedValue(mockResponse);

      const result = await service.testDatasource({ url: 'http://bad-host:9999' });

      expect(result.status).toBe('error');
    });
  });

  describe('testDatasourceByUid', () => {
    it('should test datasource health by UID', async () => {
      const mockResponse = { status: 'OK' };
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockResponse);

      const result = await service.testDatasourceByUid('ds-uid-1');

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/datasources/uid/ds-uid-1/health');
    });

    it('should propagate errors for non-existent UID', async () => {
      vi.mocked(mockHttpClient.get).mockRejectedValue(new Error('Datasource not found'));

      await expect(service.testDatasourceByUid('bad-uid')).rejects.toThrow(
        'Datasource not found',
      );
    });
  });

  describe('proxyDatasourceRequest', () => {
    it('should proxy GET request to datasource', async () => {
      const mockResponse = { data: [1, 2, 3] };
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockResponse);

      const result = await service.proxyDatasourceRequest('ds-uid-1', 'api/v1/query');

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/ds-uid-1/api/v1/query',
        undefined,
      );
    });

    it('should proxy GET request with query params', async () => {
      const mockResponse = { data: [] };
      const params = { query: 'up', time: '1234567890' };
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockResponse);

      const result = await service.proxyDatasourceRequest(
        'ds-uid-1',
        'api/v1/query',
        'GET',
        undefined,
        params,
      );

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/ds-uid-1/api/v1/query',
        params,
      );
    });

    it('should proxy POST request to datasource', async () => {
      const mockResponse = { status: 'success' };
      const postData = { query: 'up', start: 0, end: 100 };
      vi.mocked(mockHttpClient.post).mockResolvedValue(mockResponse);

      const result = await service.proxyDatasourceRequest(
        'ds-uid-1',
        'api/v1/query_range',
        'POST',
        postData,
      );

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/ds-uid-1/api/v1/query_range',
        postData,
      );
    });

    it('should default to GET method when not specified', async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue({});

      await service.proxyDatasourceRequest('ds-uid-1', 'some/path');

      expect(mockHttpClient.get).toHaveBeenCalled();
      expect(mockHttpClient.post).not.toHaveBeenCalled();
    });

    it('should throw for unsupported HTTP methods', async () => {
      await expect(
        service.proxyDatasourceRequest('ds-uid-1', 'path', 'DELETE' as any),
      ).rejects.toThrow('Unsupported HTTP method: DELETE');
    });
  });

  describe('getDatasourcePermissions', () => {
    it('should get datasource permissions by ID', async () => {
      const mockPermissions = [
        { id: 1, datasourceId: 1, userId: 1, permission: 1 },
        { id: 2, datasourceId: 1, teamId: 2, permission: 2 },
      ];
      vi.mocked(mockHttpClient.get).mockResolvedValue(mockPermissions);

      const result = await service.getDatasourcePermissions(1);

      expect(result).toEqual(mockPermissions);
      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/datasources/1/permissions');
    });

    it('should return empty array when no permissions set', async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue([]);

      const result = await service.getDatasourcePermissions(1);

      expect(result).toEqual([]);
    });
  });

  describe('updateDatasourcePermissions', () => {
    it('should update datasource permissions', async () => {
      const permissions = [
        { userId: 1, permission: 1 },
        { teamId: 2, permission: 2 },
      ];
      vi.mocked(mockHttpClient.post).mockResolvedValue(undefined);

      await service.updateDatasourcePermissions(1, permissions);

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/datasources/1/permissions',
        permissions,
      );
    });

    it('should handle empty permissions array', async () => {
      vi.mocked(mockHttpClient.post).mockResolvedValue(undefined);

      await service.updateDatasourcePermissions(1, []);

      expect(mockHttpClient.post).toHaveBeenCalledWith('/api/datasources/1/permissions', []);
    });
  });

  describe('getDatasourcesByType', () => {
    const allDatasources = [
      makeDatasource({ id: 1, uid: 'ds-1', name: 'Prom 1', type: 'prometheus' }),
      makeDatasource({ id: 2, uid: 'ds-2', name: 'Loki 1', type: 'loki' }),
      makeDatasource({ id: 3, uid: 'ds-3', name: 'Prom 2', type: 'prometheus' }),
      makeDatasource({ id: 4, uid: 'ds-4', name: 'InfluxDB', type: 'influxdb' }),
    ];

    it('should filter datasources by type', async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue(allDatasources);

      const result = await service.getDatasourcesByType('prometheus');

      expect(result).toHaveLength(2);
      expect(result.every((ds) => ds.type === 'prometheus')).toBe(true);
      expect(result[0].name).toBe('Prom 1');
      expect(result[1].name).toBe('Prom 2');
    });

    it('should return empty array when no datasources match type', async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue(allDatasources);

      const result = await service.getDatasourcesByType('elasticsearch');

      expect(result).toEqual([]);
    });

    it('should return single match', async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue(allDatasources);

      const result = await service.getDatasourcesByType('loki');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Loki 1');
    });

    it('should call listDatasources internally', async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue([]);

      await service.getDatasourcesByType('prometheus');

      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/datasources');
    });
  });

  describe('getDefaultDatasource', () => {
    it('should return the default datasource', async () => {
      const datasources = [
        makeDatasource({ id: 1, uid: 'ds-1', name: 'Prom 1', isDefault: false }),
        makeDatasource({ id: 2, uid: 'ds-2', name: 'Prom Default', isDefault: true }),
        makeDatasource({ id: 3, uid: 'ds-3', name: 'Loki', isDefault: false }),
      ];
      vi.mocked(mockHttpClient.get).mockResolvedValue(datasources);

      const result = await service.getDefaultDatasource();

      expect(result).not.toBeNull();
      expect(result!.uid).toBe('ds-2');
      expect(result!.name).toBe('Prom Default');
      expect(result!.isDefault).toBe(true);
    });

    it('should return null when no default datasource is set', async () => {
      const datasources = [
        makeDatasource({ id: 1, isDefault: false }),
        makeDatasource({ id: 2, isDefault: false }),
      ];
      vi.mocked(mockHttpClient.get).mockResolvedValue(datasources);

      const result = await service.getDefaultDatasource();

      expect(result).toBeNull();
    });

    it('should return null when there are no datasources', async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue([]);

      const result = await service.getDefaultDatasource();

      expect(result).toBeNull();
    });

    it('should return the first default if multiple defaults exist', async () => {
      const datasources = [
        makeDatasource({ id: 1, uid: 'first-default', isDefault: true }),
        makeDatasource({ id: 2, uid: 'second-default', isDefault: true }),
      ];
      vi.mocked(mockHttpClient.get).mockResolvedValue(datasources);

      const result = await service.getDefaultDatasource();

      expect(result).not.toBeNull();
      expect(result!.uid).toBe('first-default');
    });
  });

  describe('datasourceExists', () => {
    it('should return true when datasource exists by UID', async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue(makeDatasource({ uid: 'exists' }));

      const result = await service.datasourceExists('exists');

      expect(result).toBe(true);
      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/datasources/uid/exists');
    });

    it('should return false when datasource does not exist', async () => {
      vi.mocked(mockHttpClient.get).mockRejectedValue(new Error('Datasource not found'));

      const result = await service.datasourceExists('non-existent');

      expect(result).toBe(false);
    });

    it('should return false on any error (e.g., network error)', async () => {
      vi.mocked(mockHttpClient.get).mockRejectedValue(new Error('Network timeout'));

      const result = await service.datasourceExists('some-uid');

      expect(result).toBe(false);
    });
  });

  describe('datasourceExistsByName', () => {
    it('should return true when datasource exists by name', async () => {
      vi.mocked(mockHttpClient.get).mockResolvedValue(makeDatasource({ name: 'My DS' }));

      const result = await service.datasourceExistsByName('My DS');

      expect(result).toBe(true);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        `/api/datasources/name/${encodeURIComponent('My DS')}`,
      );
    });

    it('should return false when datasource does not exist by name', async () => {
      vi.mocked(mockHttpClient.get).mockRejectedValue(new Error('Datasource not found'));

      const result = await service.datasourceExistsByName('Non Existent');

      expect(result).toBe(false);
    });

    it('should return false on any error', async () => {
      vi.mocked(mockHttpClient.get).mockRejectedValue(new Error('Server error'));

      const result = await service.datasourceExistsByName('some-name');

      expect(result).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should propagate HTTP client errors from listDatasources', async () => {
      vi.mocked(mockHttpClient.get).mockRejectedValue(new Error('Internal Server Error'));

      await expect(service.listDatasources()).rejects.toThrow('Internal Server Error');
    });

    it('should propagate HTTP client errors from createDatasource', async () => {
      vi.mocked(mockHttpClient.post).mockRejectedValue(new Error('Bad Request'));

      await expect(service.createDatasource({ name: 'bad' })).rejects.toThrow('Bad Request');
    });

    it('should propagate HTTP client errors from updateDatasource', async () => {
      vi.mocked(mockHttpClient.put).mockRejectedValue(new Error('Forbidden'));

      await expect(service.updateDatasource(1, { name: 'x' })).rejects.toThrow('Forbidden');
    });

    it('should propagate HTTP client errors from deleteDatasourceById', async () => {
      vi.mocked(mockHttpClient.delete).mockRejectedValue(new Error('Not Found'));

      await expect(service.deleteDatasourceById(999)).rejects.toThrow('Not Found');
    });
  });
});
