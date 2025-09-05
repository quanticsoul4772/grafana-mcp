/**
 * Standardized error handling patterns and utilities
 */

import { GrafanaError } from "../types.js";
import { Result } from "./interfaces.js";

/**
 * Standard error categories
 */
export enum ErrorCategory {
  Validation = 'validation',
  Authentication = 'authentication',
  Authorization = 'authorization',
  NotFound = 'not_found',
  Conflict = 'conflict',
  RateLimit = 'rate_limit',
  Network = 'network',
  Server = 'server',
  Client = 'client',
  Unknown = 'unknown'
}

/**
 * Base application error class
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly category: ErrorCategory,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, any>
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }

  toGrafanaError(): GrafanaError {
    return {
      name: this.name,
      message: this.message,
      error: this.message,
      status: this.statusCode
    };
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      category: this.category,
      statusCode: this.statusCode,
      details: this.details
    };
  }
}

/**
 * Validation error
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'VALIDATION_ERROR', ErrorCategory.Validation, 400, details);
    this.name = 'ValidationError';
  }
}

/**
 * Authentication error
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTHENTICATION_ERROR', ErrorCategory.Authentication, 401);
    this.name = 'AuthenticationError';
  }
}

/**
 * Authorization error
 */
export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 'AUTHORIZATION_ERROR', ErrorCategory.Authorization, 403);
    this.name = 'AuthorizationError';
  }
}

/**
 * Not found error
 */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with id '${id}' not found` : `${resource} not found`;
    super(message, 'NOT_FOUND_ERROR', ErrorCategory.NotFound, 404);
    this.name = 'NotFoundError';
  }
}

/**
 * Conflict error
 */
export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'CONFLICT_ERROR', ErrorCategory.Conflict, 409, details);
    this.name = 'ConflictError';
  }
}

/**
 * Rate limit error
 */
export class RateLimitError extends AppError {
  constructor(retryAfter?: number) {
    super('Rate limit exceeded', 'RATE_LIMIT_ERROR', ErrorCategory.RateLimit, 429, 
          { retryAfter });
    this.name = 'RateLimitError';
  }
}

/**
 * Network error
 */
export class NetworkError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'NETWORK_ERROR', ErrorCategory.Network, 503, details);
    this.name = 'NetworkError';
  }
}

/**
 * Error handler utility functions
 */
export class ErrorHandler {
  /**
   * Convert unknown error to AppError
   */
  static normalize(error: unknown, context?: string): AppError {
    if (error instanceof AppError) {
      return error;
    }

    if (error instanceof Error) {
      const message = context ? `${context}: ${error.message}` : error.message;
      
      // Try to categorize based on error properties
      if (error.message.includes('network') || error.message.includes('timeout')) {
        return new NetworkError(message);
      }
      
      if (error.message.includes('not found')) {
        return new NotFoundError(context || 'Resource');
      }
      
      if (error.message.includes('unauthorized') || error.message.includes('401')) {
        return new AuthenticationError(message);
      }
      
      if (error.message.includes('forbidden') || error.message.includes('403')) {
        return new AuthorizationError(message);
      }

      return new AppError(message, 'UNKNOWN_ERROR', ErrorCategory.Unknown);
    }

    const message = context ? `${context}: ${String(error)}` : String(error);
    return new AppError(message, 'UNKNOWN_ERROR', ErrorCategory.Unknown);
  }

  /**
   * Wrap operation with error handling
   */
  static async safeExecute<T>(
    operation: () => Promise<T>,
    context?: string
  ): Promise<Result<T, AppError>> {
    try {
      const data = await operation();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: ErrorHandler.normalize(error, context) };
    }
  }

  /**
   * Create error response for MCP tools
   */
  static createMCPErrorResponse(error: AppError) {
    return {
      content: [
        {
          type: "text",
          text: `Error (${error.code}): ${error.message}`,
        },
      ],
      isError: true,
      _metadata: {
        category: error.category,
        statusCode: error.statusCode,
        details: error.details,
      },
    };
  }

  /**
   * Log error with appropriate level
   */
  static logError(error: AppError, context?: string): void {
    const logData = {
      error: error.toJSON(),
      context,
      timestamp: new Date().toISOString()
    };

    switch (error.category) {
      case ErrorCategory.Validation:
      case ErrorCategory.NotFound:
        console.warn('Validation/NotFound Error:', logData);
        break;
      
      case ErrorCategory.Authentication:
      case ErrorCategory.Authorization:
        console.warn('Auth Error:', logData);
        break;
      
      case ErrorCategory.RateLimit:
        console.warn('Rate Limit:', logData);
        break;
      
      case ErrorCategory.Network:
      case ErrorCategory.Server:
      case ErrorCategory.Unknown:
      default:
        console.error('System Error:', logData);
        break;
    }
  }
}

/**
 * Error handling middleware for async operations
 */
export function withErrorHandling<TArgs extends any[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  context?: string
) {
  return async (...args: TArgs): Promise<TResult> => {
    try {
      return await fn(...args);
    } catch (error) {
      const appError = ErrorHandler.normalize(error, context);
      ErrorHandler.logError(appError, context);
      throw appError;
    }
  };
}

/**
 * Decorator for method error handling
 */
export function HandleErrors(context?: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      try {
        return await method.apply(this, args);
      } catch (error) {
        const errorContext = context || `${target.constructor.name}.${propertyName}`;
        const appError = ErrorHandler.normalize(error, errorContext);
        ErrorHandler.logError(appError, errorContext);
        throw appError;
      }
    };

    return descriptor;
  };
}