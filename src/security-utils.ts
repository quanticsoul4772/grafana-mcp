/**
 * Security utilities for sanitizing logs and handling errors safely
 */

/**
 * Sensitive field patterns to redact from logs
 */
const SENSITIVE_PATTERNS = [
  /password/i,
  /token/i,
  /key/i,
  /secret/i,
  /auth/i,
  /bearer/i,
  /credential/i,
  /api[_-]?key/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /private[_-]?key/i,
  /client[_-]?secret/i,
];

/**
 * Sensitive header names to redact
 */
const SENSITIVE_HEADERS = [
  'authorization',
  'x-api-key',
  'x-auth-token',
  'cookie',
  'set-cookie',
];

/**
 * Sanitize an object by redacting sensitive fields
 */
export function sanitizeObject(obj: any, depth = 0): any {
  if (depth > 10) return '[Max Depth Reached]'; // Prevent infinite recursion

  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, depth + 1));
  }

  const sanitized: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveField(key)) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = sanitizeObject(value, depth + 1);
    }
  }

  return sanitized;
}

/**
 * Check if a field name is sensitive
 */
function isSensitiveField(fieldName: string): boolean {
  const lowerField = fieldName.toLowerCase();

  // Check against sensitive headers
  if (SENSITIVE_HEADERS.includes(lowerField)) {
    return true;
  }

  // Check against sensitive patterns
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(fieldName));
}

/**
 * Sanitize a string by masking potential sensitive data
 */
function sanitizeString(str: string): string {
  // Mask potential tokens/keys (anything that looks like a long alphanumeric string)
  return str
    .replace(/\b[A-Za-z0-9+/]{20,}={0,2}\b/g, '[REDACTED]')
    .replace(/\b[A-Fa-f0-9]{32,}\b/g, '[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]');
}

/**
 * Sanitize HTTP headers for logging
 */
export function sanitizeHeaders(
  headers: Record<string, any>,
): Record<string, any> {
  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (isSensitiveField(key)) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = sanitizeObject(value);
    }
  }

  return sanitized;
}

/**
 * Error types for categorization
 */
export enum ErrorCategory {
  USER_ERROR = 'user_error', // Safe to show to user
  SYSTEM_ERROR = 'system_error', // Internal error, don't expose details
  NETWORK_ERROR = 'network_error', // Connection issues, safe basic info
  VALIDATION_ERROR = 'validation_error', // Input validation, safe to show
}

/**
 * Categorized error interface
 */
export interface CategorizedError {
  category: ErrorCategory;
  publicMessage: string;
  internalMessage: string;
  statusCode?: number;
  originalError?: Error;
}

/**
 * Categorize and sanitize errors for safe user exposure
 */
export function categorizeError(
  error: any,
  context?: string,
): CategorizedError {
  const contextPrefix = context ? `[${context}] ` : '';

  // Network/HTTP errors
  if (error?.response?.status) {
    const status = error.response.status;

    if (status === 401) {
      return {
        category: ErrorCategory.USER_ERROR,
        publicMessage:
          'Authentication failed. Please check your Grafana token.',
        internalMessage: `${contextPrefix}HTTP 401: ${error.message}`,
        statusCode: 401,
        originalError: error,
      };
    }

    if (status === 403) {
      return {
        category: ErrorCategory.USER_ERROR,
        publicMessage:
          'Permission denied. Insufficient privileges for this operation.',
        internalMessage: `${contextPrefix}HTTP 403: ${error.message}`,
        statusCode: 403,
        originalError: error,
      };
    }

    if (status === 404) {
      return {
        category: ErrorCategory.USER_ERROR,
        publicMessage:
          'Resource not found. Please verify the identifier and try again.',
        internalMessage: `${contextPrefix}HTTP 404: ${error.message}`,
        statusCode: 404,
        originalError: error,
      };
    }

    if (status >= 400 && status < 500) {
      return {
        category: ErrorCategory.USER_ERROR,
        publicMessage:
          'Invalid request. Please check your parameters and try again.',
        internalMessage: `${contextPrefix}HTTP ${status}: ${error.message}`,
        statusCode: status,
        originalError: error,
      };
    }

    if (status >= 500) {
      return {
        category: ErrorCategory.SYSTEM_ERROR,
        publicMessage: 'Grafana server error. Please try again later.',
        internalMessage: `${contextPrefix}HTTP ${status}: ${error.message}`,
        statusCode: status,
        originalError: error,
      };
    }
  }

  // Network connection errors
  if (
    error?.code === 'ECONNREFUSED' ||
    error?.code === 'ENOTFOUND' ||
    error?.code === 'ETIMEDOUT'
  ) {
    return {
      category: ErrorCategory.NETWORK_ERROR,
      publicMessage:
        'Unable to connect to Grafana. Please check the server URL and network connection.',
      internalMessage: `${contextPrefix}Network error: ${error.message}`,
      originalError: error,
    };
  }

  // Validation errors (Zod, etc.)
  if (error?.name === 'ZodError' || error?.issues) {
    return {
      category: ErrorCategory.VALIDATION_ERROR,
      publicMessage:
        'Invalid input parameters. Please check your request and try again.',
      internalMessage: `${contextPrefix}Validation error: ${error.message}`,
      originalError: error,
    };
  }

  // Default system error for unknown issues
  return {
    category: ErrorCategory.SYSTEM_ERROR,
    publicMessage: 'An unexpected error occurred. Please try again.',
    internalMessage: `${contextPrefix}Unknown error: ${error?.message || 'No error message available'}`,
    originalError: error,
  };
}

/**
 * Format error for user display
 */
export function formatUserError(categorizedError: CategorizedError): string {
  return categorizedError.publicMessage;
}

/**
 * Format error for internal logging
 */
export function formatInternalError(
  categorizedError: CategorizedError,
): string {
  const details = [];

  details.push(`Category: ${categorizedError.category}`);
  details.push(`Message: ${categorizedError.internalMessage}`);

  if (categorizedError.statusCode) {
    details.push(`Status: ${categorizedError.statusCode}`);
  }

  if (categorizedError.originalError?.stack) {
    details.push(`Stack: ${categorizedError.originalError.stack}`);
  }

  return details.join(' | ');
}

/**
 * Safe JSON stringify that handles circular references and sanitizes sensitive data
 */
export function safeStringify(obj: any, sanitize = true): string {
  try {
    const processedObj = sanitize ? sanitizeObject(obj) : obj;
    return JSON.stringify(processedObj, null, 2);
  } catch (_error) {
    return '[Unable to serialize object - circular reference or other issue]';
  }
}
