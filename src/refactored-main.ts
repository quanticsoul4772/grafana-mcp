#!/usr/bin/env node

/**
 * Refactored Grafana MCP Server with modern patterns and architecture
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Core infrastructure
import { Container, ServiceTokens } from "./core/container.js";
import { ServiceRegistry } from "./core/service-registry.js";
import { IAppContext, IServiceHealth } from "./core/interfaces.js";
import { ErrorHandler, AppError } from "./core/error-handling.js";

// Configuration and HTTP client
import { getConfig } from "./config.js";
import { GrafanaHttpClient } from "./http-client.js";
import { ToolRegistry } from "./tool-registry.js";

// Services
import { DashboardService } from "./services/dashboard.js";
import { DatasourceService } from "./services/datasource.js";
import { PrometheusService } from "./services/prometheus.js";
import { LokiService } from "./services/loki.js";
import { AlertingService } from "./services/alerting.js";
import { AdminService } from "./services/admin.js";
import { NavigationService } from "./services/navigation.js";

/**
 * Application context implementation
 */
class AppContext implements IAppContext {
  constructor(
    public readonly config: any,
    public readonly container: Container,
    public readonly serviceRegistry: ServiceRegistry
  ) {}

  async getHealth(): Promise<IServiceHealth[]> {
    return await this.serviceRegistry.getAllServiceHealth();
  }

  async shutdown(): Promise<void> {
    await this.serviceRegistry.cleanup();
  }
}

/**
 * Service configuration for declarative setup
 */
const SERVICE_CONFIG = [
  {
    name: 'dashboards',
    token: ServiceTokens.DashboardService,
    factory: (httpClient: GrafanaHttpClient) => new DashboardService(httpClient),
    enabled: true
  },
  {
    name: 'datasources',
    token: ServiceTokens.DatasourceService,
    factory: (httpClient: GrafanaHttpClient) => new DatasourceService(httpClient),
    enabled: true
  },
  {
    name: 'prometheus',
    token: ServiceTokens.PrometheusService,
    factory: (httpClient: GrafanaHttpClient) => new PrometheusService(httpClient),
    enabled: true
  },
  {
    name: 'loki',
    token: ServiceTokens.LokiService,
    factory: (httpClient: GrafanaHttpClient) => new LokiService(httpClient),
    enabled: true
  },
  {
    name: 'alerting',
    token: ServiceTokens.AlertingService,
    factory: (httpClient: GrafanaHttpClient) => new AlertingService(httpClient),
    enabled: true
  },
  {
    name: 'admin',
    token: ServiceTokens.AdminService,
    factory: (httpClient: GrafanaHttpClient) => new AdminService(httpClient),
    enabled: true
  },
  {
    name: 'navigation',
    token: ServiceTokens.NavigationService,
    factory: (httpClient: GrafanaHttpClient) => new NavigationService(httpClient),
    enabled: true
  }
];

/**
 * Refactored Grafana MCP Server
 */
class RefactoredGrafanaMCPServer {
  private server: Server;
  private appContext: AppContext;

  constructor() {
    this.server = new Server(
      {
        name: "grafana-mcp",
        version: "2.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
  }

  /**
   * Initialize the application
   */
  async initialize(): Promise<void> {
    try {
      console.log('🚀 Initializing Refactored Grafana MCP Server...');

      // Setup dependency injection container
      const container = this.setupContainer();
      
      // Create service registry
      const toolRegistry = container.resolve<ToolRegistry>(ServiceTokens.ToolRegistry);
      const serviceRegistry = new ServiceRegistry(toolRegistry);
      
      // Create app context
      this.appContext = new AppContext(
        container.resolve(ServiceTokens.Config),
        container,
        serviceRegistry
      );

      // Register and initialize services
      await this.setupServices(container, serviceRegistry);
      
      // Setup MCP protocol handlers
      this.setupProtocolHandlers();
      
      console.log('✅ Server initialization completed');

    } catch (error) {
      console.error('❌ Server initialization failed:', error);
      throw error;
    }
  }

  /**
   * Setup dependency injection container
   */
  private setupContainer(): Container {
    const container = new Container();
    const config = getConfig();

    // Register core dependencies
    container.registerInstance(ServiceTokens.Config, config);
    
    container.registerSingleton(
      ServiceTokens.HttpClient,
      () => new GrafanaHttpClient(config)
    );
    
    container.registerSingleton(
      ServiceTokens.ToolRegistry,
      () => new ToolRegistry()
    );

    return container;
  }

  /**
   * Setup services using configuration
   */
  private async setupServices(container: Container, serviceRegistry: ServiceRegistry): Promise<void> {
    const config = container.resolve(ServiceTokens.Config);
    const httpClient = container.resolve<GrafanaHttpClient>(ServiceTokens.HttpClient);
    const disabledServices = new Set(config.GRAFANA_DISABLE_TOOLS || []);

    // Register services based on configuration
    for (const serviceConfig of SERVICE_CONFIG) {
      const isEnabled = serviceConfig.enabled && !disabledServices.has(serviceConfig.name);
      
      if (isEnabled) {
        // Create and register service instance
        const service = serviceConfig.factory(httpClient);
        container.registerInstance(serviceConfig.token, service);
        
        // Register with service registry
        serviceRegistry.registerService(service);
        
        console.log(`✓ Registered service: ${service.name}`);
      } else {
        console.log(`⏸️  Skipped disabled service: ${serviceConfig.name}`);
      }
    }

    // Initialize all services
    await serviceRegistry.initializeAllServices();
    
    // Register all tools
    await serviceRegistry.registerAllTools();
    
    const enabledServices = serviceRegistry.getEnabledServices();
    console.log(`✓ Initialized ${enabledServices.length} services`);
  }

  /**
   * Setup MCP protocol handlers
   */
  private setupProtocolHandlers(): void {
    const toolRegistry = this.appContext.container.resolve<ToolRegistry>(ServiceTokens.ToolRegistry);

    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      try {
        const tools = toolRegistry.getTools();
        return { tools };
      } catch (error) {
        const appError = ErrorHandler.normalize(error, 'ListTools');
        ErrorHandler.logError(appError);
        throw appError;
      }
    });

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name;
      
      try {
        if (!toolRegistry.hasTool(toolName)) {
          throw new AppError(`Unknown tool: ${toolName}`, 'TOOL_NOT_FOUND', 'client', 404);
        }

        const handler = toolRegistry.getHandler(toolName);
        if (!handler) {
          throw new AppError(`No handler found for tool: ${toolName}`, 'HANDLER_NOT_FOUND', 'server', 500);
        }

        const result = await handler(request as any);
        return result;

      } catch (error) {
        const appError = ErrorHandler.normalize(error, `Tool:${toolName}`);
        ErrorHandler.logError(appError);
        
        if (appError instanceof AppError) {
          return ErrorHandler.createMCPErrorResponse(appError);
        }
        
        // Fallback error response
        return {
          content: [
            {
              type: "text",
              text: `Error executing ${toolName}: ${appError.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    try {
      await this.initialize();

      // Connect to stdio transport
      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      console.log('✅ Refactored Grafana MCP Server started successfully');
      
      // Log initial health status
      const health = await this.appContext.getHealth();
      console.log('📊 Service Health Status:');
      health.forEach(h => {
        console.log(`  ${h.service}: ${h.status}`);
      });

    } catch (error) {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    try {
      console.log('🛑 Shutting down server...');
      
      await this.server.close();
      await this.appContext.shutdown();
      
      console.log('✓ Graceful shutdown completed');
    } catch (error) {
      console.error('Shutdown error:', error);
      process.exit(1);
    }
  }
}

/**
 * Main entry point
 */
async function main() {
  const server = new RefactoredGrafanaMCPServer();

  // Setup graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
    await server.shutdown();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGQUIT', () => shutdown('SIGQUIT'));

  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });

  // Start the server
  await server.start();
}

// Run the application
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}