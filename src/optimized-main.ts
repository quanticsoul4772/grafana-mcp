#!/usr/bin/env node

/**
 * Optimized Grafana MCP Server with advanced performance features
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { getConfig } from './config.js';
import { ToolRegistry } from './tool-registry.js';
import { ServiceContainer, StringInterner, AsyncOperationManager } from './service-pool.js';
import { OptimizedGrafanaHttpClient } from './optimized-http-client.js';
import { performanceMonitor } from './performance-monitor.js';

// Import service classes
import { DashboardService } from './services/dashboard.js';
import { DatasourceService } from './services/datasource.js';
import { PrometheusService } from './services/prometheus.js';
import { LokiService } from './services/loki.js';
import { AlertingService } from './services/alerting.js';
import { AdminService } from './services/admin.js';
import { NavigationService } from './services/navigation.js';

// Import tool registration functions
import { registerDashboardTools } from './tools/dashboard.js';
import { registerDatasourceTools } from './tools/datasource.js';
import { registerPrometheusTools } from './tools/prometheus.js';
import { registerLokiTools } from './tools/loki.js';
import { registerAlertingTools } from './tools/alerting.js';
import { registerAdminTools } from './tools/admin.js';
import { registerNavigationTools } from './tools/navigation.js';

/**
 * Optimized Grafana MCP Server class
 */
class OptimizedGrafanaMCPServer {
  private server: Server;
  private registry: ToolRegistry;
  private serviceContainer: ServiceContainer;
  private asyncManager: AsyncOperationManager;
  private stringInterner: StringInterner;
  private isShuttingDown = false;

  constructor() {
    this.server = new Server(
      {
        name: 'grafana-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.registry = new ToolRegistry();
    this.serviceContainer = new ServiceContainer();
    this.asyncManager = new AsyncOperationManager(15, 8); // Higher concurrency
    this.stringInterner = StringInterner.getInstance();

    this.setupOptimizedServices();
    this.setupGracefulShutdown();
    this.setupPerformanceMonitoring();
  }

  /**
   * Setup services with dependency injection and pooling
   */
  private setupOptimizedServices(): void {
    const startTime = Date.now();
    const config = getConfig();

    // Register HTTP client with singleton pattern
    this.serviceContainer.registerSingleton('httpClient', () => {
      return new OptimizedGrafanaHttpClient(config);
    });

    // Register services as singletons for better resource management
    this.serviceContainer.registerSingleton('dashboardService', () => {
      return new DashboardService(this.serviceContainer.get('httpClient'));
    });

    this.serviceContainer.registerSingleton('dataSourceService', () => {
      return new DatasourceService(this.serviceContainer.get('httpClient'));
    });

    this.serviceContainer.registerSingleton('prometheusService', () => {
      return new PrometheusService(this.serviceContainer.get('httpClient'));
    });

    this.serviceContainer.registerSingleton('lokiService', () => {
      return new LokiService(this.serviceContainer.get('httpClient'));
    });

    this.serviceContainer.registerSingleton('alertingService', () => {
      return new AlertingService(this.serviceContainer.get('httpClient'));
    });

    this.serviceContainer.registerSingleton('adminService', () => {
      return new AdminService(this.serviceContainer.get('httpClient'));
    });

    this.serviceContainer.registerSingleton('navigationService', () => {
      return new NavigationService(this.serviceContainer.get('httpClient'));
    });

    console.log('✓ Services registered with optimized container');
    console.log(`⚡ Service setup completed in ${Date.now() - startTime}ms`);
  }

  /**
   * Register all MCP tools with optimization
   */
  private async registerTools(): Promise<void> {
    const startTime = Date.now();
    const config = getConfig();
    const disabledTools = new Set(config.GRAFANA_DISABLE_TOOLS);

    const toolRegistrations = [
      { name: 'dashboards', fn: registerDashboardTools, service: 'dashboardService' },
      { name: 'datasources', fn: registerDatasourceTools, service: 'dataSourceService' },
      { name: 'prometheus', fn: registerPrometheusTools, service: 'prometheusService' },
      { name: 'loki', fn: registerLokiTools, service: 'lokiService' },
      { name: 'alerting', fn: registerAlertingTools, service: 'alertingService' },
      { name: 'admin', fn: registerAdminTools, service: 'adminService' },
      { name: 'navigation', fn: registerNavigationTools, service: 'navigationService' },
    ];

    // Register tools in parallel using async manager
    const registrationPromises = toolRegistrations
      .filter(({ name }) => !disabledTools.has(name))
      .map(({ name, fn, service }) =>
        this.asyncManager.enqueue(`tool-registration-${name}`, async () => {
          const serviceInstance = this.serviceContainer.get(service) as any;
          fn(this.registry, serviceInstance);
          return name;
        }),
      );

    const registeredTools = await Promise.all(registrationPromises);
    console.log(`✓ Registered ${registeredTools.length} tool categories:`, registeredTools.join(', '));

    // Log registry statistics
    const stats = this.registry.getStats();
    console.log(`✓ Total tools registered: ${stats.totalTools}`);
    console.log(`✓ Categories: ${Object.entries(stats.categories).map(([cat, count]) => `${cat}(${count})`).join(', ')}`);
    console.log(`⚡ Tool registration completed in ${Date.now() - startTime}ms`);
  }

  /**
   * Setup MCP protocol handlers
   */
  private setupProtocolHandlers(): void {
    // Optimized list tools handler with caching
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return this.asyncManager.enqueue('list-tools', async () => {
        const tools = this.registry.getTools();
        
        // Intern strings to reduce memory usage
        const optimizedTools = tools.map(tool => ({
          name: this.stringInterner.intern(tool.name),
          description: this.stringInterner.intern(tool.description),
          inputSchema: tool.inputSchema,
        }));

        return { tools: optimizedTools };
      });
    });

    // Optimized call tool handler with performance monitoring
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const startTime = Date.now();
      const toolName = request.params.name;

      return this.asyncManager.enqueue(`tool-${toolName}`, async () => {
        try {
          if (!this.registry.hasTool(toolName)) {
            throw new Error(`Unknown tool: ${toolName}`);
          }

          const handler = this.registry.getHandler(toolName);
          if (!handler) {
            throw new Error(`No handler found for tool: ${toolName}`);
          }

          performanceMonitor.startTimer(`tool-${toolName}`);
          const result = await handler(request as any);
          const duration = performanceMonitor.endTimer(`tool-${toolName}`);

          // Log slow operations
          if (duration > 5000) {
            console.warn(`Slow tool execution: ${toolName} took ${duration.toFixed(2)}ms`);
          }

          return result;
        } catch (error) {
          const duration = Date.now() - startTime;
          console.error(`Tool ${toolName} failed after ${duration}ms:`, error);
          
          return {
            content: [
              {
                type: 'text',
                text: `Error executing ${toolName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
            isError: true,
          };
        }
      });
    });
  }

  /**
   * Setup performance monitoring
   */
  private setupPerformanceMonitoring(): void {
    performanceMonitor.on('performance-alert', (alerts: string[]) => {
      console.warn('🚨 Performance Alert:', alerts);
    });

    // Periodic optimization every 5 minutes
    setInterval(() => {
      if (!this.isShuttingDown) {
        this.optimize();
      }
    }, 5 * 60 * 1000);

    // Performance report every 15 minutes
    setInterval(() => {
      if (!this.isShuttingDown) {
        this.logPerformanceReport();
      }
    }, 15 * 60 * 1000);
  }

  /**
   * Optimize system resources
   */
  private optimize(): void {
    try {
      // Optimize service container
      this.serviceContainer.optimize();
      
      // Optimize HTTP client
      const httpClient = this.serviceContainer.get('httpClient') as OptimizedGrafanaHttpClient;
      httpClient.optimize();

      // Clear string interner periodically
      if (Math.random() < 0.1) { // 10% chance
        this.stringInterner.clear();
      }

      // Force garbage collection if available
      if (global.gc && Math.random() < 0.2) { // 20% chance
        global.gc();
      }

      console.log('🔧 System optimization completed');
    } catch (error) {
      console.warn('Optimization error:', error);
    }
  }

  /**
   * Log performance metrics
   */
  private logPerformanceReport(): void {
    try {
      const report = performanceMonitor.getPerformanceReport();
      const httpClient = this.serviceContainer.get('httpClient') as OptimizedGrafanaHttpClient;
      const httpMetrics = httpClient.getPerformanceMetrics();

      console.log('📊 Performance Report:');
      console.log('  Memory:', `${report.summary.memoryUsageMB.toFixed(1)}MB`);
      console.log('  Avg Response Time:', `${report.summary.avgResponseTime.toFixed(2)}ms`);
      console.log('  Cache Hit Rate:', `${(report.summary.cacheHitRate * 100).toFixed(1)}%`);
      console.log('  Error Rate:', `${(report.summary.errorRate * 100).toFixed(1)}%`);
      console.log('  Active Requests:', httpMetrics.activeRequests);
      console.log('  Queue Length:', httpMetrics.queueLength);

      if (report.recommendations.length > 0) {
        console.log('💡 Recommendations:');
        report.recommendations.forEach(rec => console.log(`  - ${rec}`));
      }
    } catch (error) {
      console.warn('Performance report error:', error);
    }
  }

  /**
   * Setup graceful shutdown
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
      this.isShuttingDown = true;

      try {
        // Stop accepting new requests
        await this.server.close();

        // Cleanup resources
        this.serviceContainer.cleanup();
        this.asyncManager.clear();
        
        const httpClient = this.serviceContainer.get('httpClient') as OptimizedGrafanaHttpClient;
        httpClient.cleanup();
        
        performanceMonitor.cleanup();

        console.log('✓ Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        console.error('Shutdown error:', error);
        process.exit(1);
      }
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
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    try {
      console.log('🚀 Starting Optimized Grafana MCP Server...');
      
      // Register tools
      await this.registerTools();
      
      // Setup protocol handlers
      this.setupProtocolHandlers();

      // Connect to stdio transport
      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      console.log('✅ Optimized Grafana MCP Server started successfully');
      console.log('📊 Performance monitoring enabled');
      
      // Log initial metrics
      this.logPerformanceReport();
      
    } catch (error) {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  }
}

// Start the optimized server
const server = new OptimizedGrafanaMCPServer();
server.start().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});