/**
 * Core interfaces and abstractions for the Grafana MCP Server
 */

import { GrafanaHttpClient } from '../http-client.js';

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
 * Result type for operations that can succeed or fail
 */
export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Async result type
 */
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

