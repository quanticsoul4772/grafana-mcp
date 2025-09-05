/**
 * Dependency injection container implementation
 */

import { IContainer } from "./interfaces.js";

/**
 * Service lifetime enumeration
 */
export enum ServiceLifetime {
  Transient = 'transient',
  Singleton = 'singleton',
  Scoped = 'scoped'
}

/**
 * Service registration interface
 */
interface ServiceRegistration<T = any> {
  factory: () => T;
  lifetime: ServiceLifetime;
  instance?: T;
}

/**
 * Simple dependency injection container
 */
export class Container implements IContainer {
  private readonly services = new Map<string | symbol, ServiceRegistration>();

  /**
   * Register a transient service
   */
  register<T>(token: string | symbol, factory: () => T): void {
    this.services.set(token, {
      factory,
      lifetime: ServiceLifetime.Transient
    });
  }

  /**
   * Register a singleton service
   */
  registerSingleton<T>(token: string | symbol, factory: () => T): void {
    this.services.set(token, {
      factory,
      lifetime: ServiceLifetime.Singleton
    });
  }

  /**
   * Register a scoped service (per request)
   */
  registerScoped<T>(token: string | symbol, factory: () => T): void {
    this.services.set(token, {
      factory,
      lifetime: ServiceLifetime.Scoped
    });
  }

  /**
   * Register an instance as singleton
   */
  registerInstance<T>(token: string | symbol, instance: T): void {
    this.services.set(token, {
      factory: () => instance,
      lifetime: ServiceLifetime.Singleton,
      instance
    });
  }

  /**
   * Resolve a service by token
   */
  resolve<T>(token: string | symbol): T {
    const registration = this.services.get(token);
    
    if (!registration) {
      throw new Error(`Service not found: ${String(token)}`);
    }

    switch (registration.lifetime) {
      case ServiceLifetime.Singleton:
        if (!registration.instance) {
          registration.instance = registration.factory();
        }
        return registration.instance as T;

      case ServiceLifetime.Transient:
      case ServiceLifetime.Scoped:
      default:
        return registration.factory() as T;
    }
  }

  /**
   * Check if service is registered
   */
  has(token: string | symbol): boolean {
    return this.services.has(token);
  }

  /**
   * Get all registered service tokens
   */
  getTokens(): (string | symbol)[] {
    return Array.from(this.services.keys());
  }

  /**
   * Clear all registrations
   */
  clear(): void {
    this.services.clear();
  }

  /**
   * Create a child container (scoped)
   */
  createScope(): Container {
    const child = new Container();
    
    // Copy registrations to child
    for (const [token, registration] of this.services.entries()) {
      if (registration.lifetime === ServiceLifetime.Singleton) {
        // Singletons are shared across scopes
        child.services.set(token, registration);
      } else {
        // Transient and scoped services get fresh registrations
        child.services.set(token, {
          factory: registration.factory,
          lifetime: registration.lifetime
        });
      }
    }

    return child;
  }
}

/**
 * Service tokens (symbols for type-safe DI)
 */
export const ServiceTokens = {
  // Core services
  Config: Symbol('Config'),
  HttpClient: Symbol('HttpClient'),
  ToolRegistry: Symbol('ToolRegistry'),
  
  // Business services
  DashboardService: Symbol('DashboardService'),
  DatasourceService: Symbol('DatasourceService'),
  PrometheusService: Symbol('PrometheusService'),
  LokiService: Symbol('LokiService'),
  AlertingService: Symbol('AlertingService'),
  AdminService: Symbol('AdminService'),
  NavigationService: Symbol('NavigationService'),
  
  // Infrastructure services
  PerformanceMonitor: Symbol('PerformanceMonitor'),
  ServiceContainer: Symbol('ServiceContainer'),
} as const;

/**
 * Type-safe service token type
 */
export type ServiceToken<T = any> = symbol & { __type: T };