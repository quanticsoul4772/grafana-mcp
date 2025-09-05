/**
 * Service registry for managing services and their tool registrations
 */

import { EventEmitter } from "events";
import { 
  IService, 
  IServiceRegistry, 
  IServiceHealth, 
  IToolRegistration 
} from "./interfaces.js";
import { ToolRegistry } from "../tool-registry.js";
import { ToolRegistrationHelper } from "./tool-system.js";

/**
 * Service registration information
 */
interface ServiceRegistration {
  service: IService;
  tools: IToolRegistration[];
  enabled: boolean;
  registeredAt: Date;
}

/**
 * Service registry implementation
 */
export class ServiceRegistry extends EventEmitter implements IServiceRegistry {
  private readonly services = new Map<string, ServiceRegistration>();

  constructor(private toolRegistry: ToolRegistry) {
    super();
  }

  /**
   * Register a service
   */
  registerService<T extends IService>(service: T): void {
    if (this.services.has(service.name)) {
      throw new Error(`Service '${service.name}' is already registered`);
    }

    const registration: ServiceRegistration = {
      service,
      tools: [],
      enabled: true,
      registeredAt: new Date()
    };

    this.services.set(service.name, registration);
    this.emit('service-registered', service.name, service);

    // Initialize service if not already initialized
    if (!service.initialized && service.initialize) {
      service.initialize().catch(error => {
        this.emit('service-init-error', service.name, error);
      });
    }
  }

  /**
   * Get a service by name
   */
  getService<T extends IService>(name: string): T | undefined {
    const registration = this.services.get(name);
    return registration?.service as T;
  }

  /**
   * Get all registered services
   */
  getAllServices(): IService[] {
    return Array.from(this.services.values()).map(reg => reg.service);
  }

  /**
   * Register tools for a service
   */
  async registerTools(service: IService): Promise<IToolRegistration[]> {
    const registration = this.services.get(service.name);
    if (!registration) {
      throw new Error(`Service '${service.name}' is not registered`);
    }

    try {
      // Use the tool registration helper to register decorated tools
      const tools = ToolRegistrationHelper.registerServiceTools(
        this.toolRegistry, 
        service
      );

      registration.tools = tools;
      this.emit('tools-registered', service.name, tools.length);

      return tools;
    } catch (error) {
      this.emit('tools-registration-error', service.name, error);
      throw error;
    }
  }

  /**
   * Enable/disable a service
   */
  setServiceEnabled(serviceName: string, enabled: boolean): void {
    const registration = this.services.get(serviceName);
    if (!registration) {
      throw new Error(`Service '${serviceName}' is not registered`);
    }

    registration.enabled = enabled;
    this.emit('service-enabled-changed', serviceName, enabled);
  }

  /**
   * Check if a service is enabled
   */
  isServiceEnabled(serviceName: string): boolean {
    const registration = this.services.get(serviceName);
    return registration?.enabled ?? false;
  }

  /**
   * Get service registration info
   */
  getServiceRegistration(serviceName: string): ServiceRegistration | undefined {
    return this.services.get(serviceName);
  }

  /**
   * Get all service names
   */
  getServiceNames(): string[] {
    return Array.from(this.services.keys());
  }

  /**
   * Get enabled services
   */
  getEnabledServices(): IService[] {
    return Array.from(this.services.values())
      .filter(reg => reg.enabled)
      .map(reg => reg.service);
  }

  /**
   * Get service health status
   */
  async getServiceHealth(serviceName: string): Promise<IServiceHealth | undefined> {
    const registration = this.services.get(serviceName);
    if (!registration) {
      return undefined;
    }

    const service = registration.service;
    const now = new Date();

    try {
      const isHealthy = service.healthCheck ? await service.healthCheck() : true;
      return {
        service: serviceName,
        status: isHealthy ? 'healthy' : 'unhealthy',
        lastCheck: now,
        details: {
          initialized: service.initialized,
          enabled: registration.enabled,
          toolsRegistered: registration.tools.length,
          registeredAt: registration.registeredAt
        }
      };
    } catch (error) {
      return {
        service: serviceName,
        status: 'unhealthy',
        lastCheck: now,
        details: {
          error: error instanceof Error ? error.message : String(error),
          initialized: service.initialized,
          enabled: registration.enabled
        }
      };
    }
  }

  /**
   * Get health status for all services
   */
  async getAllServiceHealth(): Promise<IServiceHealth[]> {
    const healthChecks = this.getServiceNames().map(name => 
      this.getServiceHealth(name)
    );

    const results = await Promise.all(healthChecks);
    return results.filter((health): health is IServiceHealth => health !== undefined);
  }

  /**
   * Initialize all services
   */
  async initializeAllServices(): Promise<void> {
    const initPromises = Array.from(this.services.values())
      .filter(reg => reg.service.initialize && !reg.service.initialized)
      .map(async reg => {
        try {
          await reg.service.initialize!();
          this.emit('service-initialized', reg.service.name);
        } catch (error) {
          this.emit('service-init-error', reg.service.name, error);
          throw error;
        }
      });

    await Promise.all(initPromises);
  }

  /**
   * Register tools for all enabled services
   */
  async registerAllTools(): Promise<void> {
    const registrationPromises = this.getEnabledServices().map(service =>
      this.registerTools(service)
    );

    await Promise.all(registrationPromises);
  }

  /**
   * Cleanup all services
   */
  async cleanup(): Promise<void> {
    const cleanupPromises = Array.from(this.services.values())
      .filter(reg => reg.service.cleanup)
      .map(async reg => {
        try {
          await reg.service.cleanup!();
          this.emit('service-cleanup', reg.service.name);
        } catch (error) {
          this.emit('service-cleanup-error', reg.service.name, error);
        }
      });

    await Promise.all(cleanupPromises);
    this.services.clear();
    this.removeAllListeners();
  }
}