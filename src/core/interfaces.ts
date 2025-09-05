/**
 * Core interfaces and abstractions for the Grafana MCP Server
 */

import { GrafanaHttpClient } from "../http-client.js";
import { Config } from "../types.js";

/**
 * Base interface for all services
 */
export interface IService {
  readonly name: string;
  readonly version: string;
  initialize?(): Promise<void>;
  cleanup?(): Promise<void>;
  healthCheck?(): Promise<boolean>;
}

/**
 * Interface for services that depend on HTTP client
 */
export interface IHttpService extends IService {
  readonly httpClient: GrafanaHttpClient;
}

/**
 * Interface for services that depend on configuration
 */
export interface IConfigurableService extends IService {
  readonly config: Config;
}

/**
 * Generic service factory interface
 */
export interface IServiceFactory<T extends IService> {
  create(): T;
  createAsync(): Promise<T>;
}

/**
 * Dependency injection container interface
 */
export interface IContainer {
  register<T>(token: string | symbol, factory: () => T): void;
  registerSingleton<T>(token: string | symbol, factory: () => T): void;
  resolve<T>(token: string | symbol): T;
  has(token: string | symbol): boolean;
}

/**
 * Tool metadata interface
 */
export interface IToolMetadata {
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly version: string;
  readonly tags?: string[];
  readonly deprecated?: boolean;
}

/**
 * Tool registration interface
 */
export interface IToolRegistration {
  readonly metadata: IToolMetadata;
  readonly schema: any;
  readonly handler: (request: any) => Promise<any>;
}

/**
 * Service registry interface for managing tool registrations
 */
export interface IServiceRegistry {
  registerService<T extends IService>(service: T): void;
  getService<T extends IService>(name: string): T | undefined;
  getAllServices(): IService[];
  registerTools(service: IService): Promise<IToolRegistration[]>;
}

/**
 * Result type for operations that can succeed or fail
 */
export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Async result type
 */
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

/**
 * Service health status
 */
export interface IServiceHealth {
  readonly service: string;
  readonly status: 'healthy' | 'unhealthy' | 'degraded';
  readonly lastCheck: Date;
  readonly details?: Record<string, any>;
}

/**
 * Application context interface
 */
export interface IAppContext {
  readonly config: Config;
  readonly container: IContainer;
  readonly serviceRegistry: IServiceRegistry;
  getHealth(): Promise<IServiceHealth[]>;
  shutdown(): Promise<void>;
}