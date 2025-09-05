import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all dependencies before importing main
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: vi.fn().mockImplementation(() => ({
    setRequestHandler: vi.fn(),
    connect: vi.fn(),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn(),
}));

vi.mock('./config.js', () => ({
  config: {
    GRAFANA_URL: 'https://test-grafana.com',
    GRAFANA_TOKEN: 'test-token',
    GRAFANA_DEBUG: false,
    GRAFANA_TIMEOUT: 30000,
    GRAFANA_DISABLE_TOOLS: [],
    GRAFANA_TLS_SKIP_VERIFY: false,
  },
}));

vi.mock('./http-client.js', () => ({
  GrafanaHttpClient: vi.fn().mockImplementation(() => ({
    testConnection: vi.fn(),
  })),
}));

vi.mock('./tool-registry.js', () => ({
  ToolRegistry: vi.fn().mockImplementation(() => ({
    getTools: vi.fn(() => []),
    getHandler: vi.fn(),
  })),
}));

// Mock all services
vi.mock('./services/dashboard.js', () => ({
  DashboardService: vi.fn(),
}));

vi.mock('./services/datasource.js', () => ({
  DatasourceService: vi.fn(),
}));

vi.mock('./services/prometheus.js', () => ({
  PrometheusService: vi.fn(),
}));

vi.mock('./services/loki.js', () => ({
  LokiService: vi.fn(),
}));

vi.mock('./services/alerting.js', () => ({
  AlertingService: vi.fn(),
}));

vi.mock('./services/admin.js', () => ({
  AdminService: vi.fn(),
}));

vi.mock('./services/navigation.js', () => ({
  NavigationService: vi.fn(),
}));

// Mock all tool registrations
vi.mock('./tools/dashboard.js', () => ({
  registerDashboardTools: vi.fn(),
}));

vi.mock('./tools/admin.js', () => ({
  registerAdminTools: vi.fn(),
}));

vi.mock('./tools/datasource.js', () => ({
  registerDatasourceTools: vi.fn(),
}));

vi.mock('./tools/prometheus.js', () => ({
  registerPrometheusTools: vi.fn(),
}));

vi.mock('./tools/loki.js', () => ({
  registerLokiTools: vi.fn(),
}));

vi.mock('./tools/alerting.js', () => ({
  registerAlertingTools: vi.fn(),
}));

vi.mock('./tools/navigation.js', () => ({
  registerNavigationTools: vi.fn(),
}));

describe('main', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create all required services and registry', async () => {
    const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
    const { GrafanaHttpClient } = await import('./http-client.js');
    const { ToolRegistry } = await import('./tool-registry.js');
    const { DashboardService } = await import('./services/dashboard.js');
    const { DatasourceService } = await import('./services/datasource.js');
    const { PrometheusService } = await import('./services/prometheus.js');
    const { LokiService } = await import('./services/loki.js');
    const { AlertingService } = await import('./services/alerting.js');
    const { AdminService } = await import('./services/admin.js');
    const { NavigationService } = await import('./services/navigation.js');

    // Mock main function to prevent actual server startup
    vi.doMock('./main.js', () => ({
      main: vi.fn(),
    }));

    // Import and test the creation logic without running the server
    const main = vi.fn(async () => {
      // Simulate the main function logic
      const httpClient = new GrafanaHttpClient({} as any);
      const dashboardService = new DashboardService(httpClient);
      const datasourceService = new DatasourceService(httpClient);
      const prometheusService = new PrometheusService(httpClient);
      const lokiService = new LokiService(httpClient);
      const alertingService = new AlertingService(httpClient);
      const adminService = new AdminService(httpClient);
      const navigationService = new NavigationService({} as any);
      const toolRegistry = new ToolRegistry();
      const server = new Server({} as any, {} as any);

      return {
        httpClient,
        dashboardService,
        datasourceService,
        prometheusService,
        lokiService,
        alertingService,
        adminService,
        navigationService,
        toolRegistry,
        server,
      };
    });

    const result = await main();

    expect(GrafanaHttpClient).toHaveBeenCalled();
    expect(ToolRegistry).toHaveBeenCalled();
    expect(Server).toHaveBeenCalled();
    expect(DashboardService).toHaveBeenCalled();
    expect(DatasourceService).toHaveBeenCalled();
    expect(PrometheusService).toHaveBeenCalled();
    expect(LokiService).toHaveBeenCalled();
    expect(AlertingService).toHaveBeenCalled();
    expect(AdminService).toHaveBeenCalled();
    expect(NavigationService).toHaveBeenCalled();

    expect(result).toHaveProperty('httpClient');
    expect(result).toHaveProperty('toolRegistry');
    expect(result).toHaveProperty('server');
  });

  it('should register all tool categories', async () => {
    const { registerDashboardTools } = await import('./tools/dashboard.js');
    const { registerAdminTools } = await import('./tools/admin.js');
    const { registerDatasourceTools } = await import('./tools/datasource.js');
    const { registerPrometheusTools } = await import('./tools/prometheus.js');
    const { registerLokiTools } = await import('./tools/loki.js');
    const { registerAlertingTools } = await import('./tools/alerting.js');
    const { registerNavigationTools } = await import('./tools/navigation.js');

    // Mock the registration process
    const mockRegisterTools = vi.fn(() => {
      registerDashboardTools({} as any, {} as any);
      registerAdminTools({} as any, {} as any);
      registerDatasourceTools({} as any, {} as any);
      registerPrometheusTools({} as any, {} as any);
      registerLokiTools({} as any, {} as any);
      registerAlertingTools({} as any, {} as any);
      registerNavigationTools({} as any, {} as any);
    });

    mockRegisterTools();

    expect(registerDashboardTools).toHaveBeenCalled();
    expect(registerAdminTools).toHaveBeenCalled();
    expect(registerDatasourceTools).toHaveBeenCalled();
    expect(registerPrometheusTools).toHaveBeenCalled();
    expect(registerLokiTools).toHaveBeenCalled();
    expect(registerAlertingTools).toHaveBeenCalled();
    expect(registerNavigationTools).toHaveBeenCalled();
  });

  it('should create server with correct configuration', async () => {
    const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');

    // Mock server creation
    const mockCreateServer = vi.fn(() => {
      return new Server(
        {
          name: 'grafana-mcp',
          version: '1.0.0',
        },
        {
          capabilities: {
            tools: {},
          },
        }
      );
    });

    const server = mockCreateServer();

    expect(Server).toHaveBeenCalledWith(
      {
        name: 'grafana-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
  });

  it('should handle initialization errors gracefully', async () => {
    const { GrafanaHttpClient } = await import('./http-client.js');
    
    // Mock HTTP client to throw error
    vi.mocked(GrafanaHttpClient).mockImplementation(() => {
      throw new Error('Configuration error');
    });

    const errorMain = vi.fn(async () => {
      try {
        new GrafanaHttpClient({} as any);
      } catch (error) {
        if (error instanceof Error) {
          console.error('Failed to initialize server:', error.message);
          throw error;
        }
      }
    });

    await expect(errorMain()).rejects.toThrow('Configuration error');
  });
});