import { describe, it, expect } from 'vitest';
import {
  sanitizeObject,
  sanitizeHeaders,
  categorizeError,
  formatUserError,
  formatInternalError,
  safeStringify,
  ErrorCategory,
  type CategorizedError,
} from './security-utils.js';

describe('security-utils', () => {
  describe('sanitizeObject', () => {
    it('should redact sensitive field names', () => {
      const input = {
        username: 'john',
        password: 'secret123',
        token: 'abc123def456',
        apiKey: 'xyz789',
        normalField: 'safe-value',
      };

      const result = sanitizeObject(input);

      expect(result).toEqual({
        username: 'john',
        password: '[REDACTED]',
        token: '[REDACTED]',
        apiKey: '[REDACTED]',
        normalField: 'safe-value',
      });
    });

    it('should handle case-insensitive sensitive patterns', () => {
      const input = {
        PASSWORD: 'secret',
        Token: 'token123',
        API_KEY: 'key123',
        Secret: 'mysecret',
      };

      const result = sanitizeObject(input);

      expect(result.PASSWORD).toBe('[REDACTED]');
      expect(result.Token).toBe('[REDACTED]');
      expect(result.API_KEY).toBe('[REDACTED]');
      expect(result.Secret).toBe('[REDACTED]');
    });

    it('should sanitize nested objects', () => {
      const input = {
        config: {
          auth: {
            token: 'secret-token',
            user: 'admin',
          },
          settings: {
            timeout: 5000,
            apiKey: 'my-api-key',
          },
        },
        metadata: {
          version: '1.0.0',
        },
      };

      const result = sanitizeObject(input);

      expect(result.config.auth.token).toBe('[REDACTED]');
      expect(result.config.auth.user).toBe('admin');
      expect(result.config.settings.timeout).toBe(5000);
      expect(result.config.settings.apiKey).toBe('[REDACTED]');
      expect(result.metadata.version).toBe('1.0.0');
    });

    it('should sanitize arrays', () => {
      const input = {
        tokens: ['token1', 'token2'],
        users: [
          { name: 'john', password: 'secret1' },
          { name: 'jane', password: 'secret2' },
        ],
      };

      const result = sanitizeObject(input);

      expect(result.tokens).toEqual(['[REDACTED]', '[REDACTED]']);
      expect(result.users[0]).toEqual({ name: 'john', password: '[REDACTED]' });
      expect(result.users[1]).toEqual({ name: 'jane', password: '[REDACTED]' });
    });

    it('should handle primitive values', () => {
      expect(sanitizeObject('plain string')).toBe('[REDACTED]');
      expect(sanitizeObject('Bearer abcd1234efgh5678')).toBe('Bearer [REDACTED]');
      expect(sanitizeObject(42)).toBe(42);
      expect(sanitizeObject(true)).toBe(true);
      expect(sanitizeObject(null)).toBe(null);
      expect(sanitizeObject(undefined)).toBe(undefined);
    });

    it('should prevent infinite recursion with max depth', () => {
      const circular: any = { level: 0 };
      circular.self = circular;

      const result = sanitizeObject(circular);

      expect(result.level).toBe(0);
      expect(result.self).toBe('[Max Depth Reached]');
    });

    it('should sanitize long alphanumeric strings that look like tokens', () => {
      const input = {
        message: 'Token is: abcdef1234567890abcdef1234567890 and user is john',
        hexToken: 'a1b2c3d4e5f6789012345678901234567890abcd',
        base64Token: 'SGVsbG9Xb3JsZEhlbGxvV29ybGRIZWxsb1dvcmxkSGVsbG9Xb3JsZA==',
      };

      const result = sanitizeObject(input);

      expect(result.message).toContain('[REDACTED]');
      expect(result.message).toContain('john'); // Non-sensitive part preserved
      expect(result.hexToken).toBe('[REDACTED]');
      expect(result.base64Token).toBe('[REDACTED]');
    });
  });

  describe('sanitizeHeaders', () => {
    it('should redact sensitive headers', () => {
      const headers = {
        'content-type': 'application/json',
        authorization: 'Bearer token123',
        'x-api-key': 'secret-key',
        'user-agent': 'test-client',
        cookie: 'session=abc123',
      };

      const result = sanitizeHeaders(headers);

      expect(result).toEqual({
        'content-type': 'application/json',
        authorization: '[REDACTED]',
        'x-api-key': '[REDACTED]',
        'user-agent': 'test-client',
        cookie: '[REDACTED]',
      });
    });

    it('should handle case variations in header names', () => {
      const headers = {
        Authorization: 'Bearer token',
        'X-API-KEY': 'key123',
        'Set-Cookie': 'session=abc',
      };

      const result = sanitizeHeaders(headers);

      expect(result.Authorization).toBe('[REDACTED]');
      expect(result['X-API-KEY']).toBe('[REDACTED]');
      expect(result['Set-Cookie']).toBe('[REDACTED]');
    });
  });

  describe('categorizeError', () => {
    it('should categorize 401 errors as USER_ERROR', () => {
      const error = {
        response: { status: 401 },
        message: 'Unauthorized',
      };

      const result = categorizeError(error, 'test-context');

      expect(result.category).toBe(ErrorCategory.USER_ERROR);
      expect(result.publicMessage).toBe('Authentication failed. Please check your Grafana token.');
      expect(result.internalMessage).toBe('[test-context] HTTP 401: Unauthorized');
      expect(result.statusCode).toBe(401);
    });

    it('should categorize 403 errors as USER_ERROR', () => {
      const error = {
        response: { status: 403 },
        message: 'Forbidden',
      };

      const result = categorizeError(error);

      expect(result.category).toBe(ErrorCategory.USER_ERROR);
      expect(result.publicMessage).toBe('Permission denied. Insufficient privileges for this operation.');
      expect(result.statusCode).toBe(403);
    });

    it('should categorize 404 errors as USER_ERROR', () => {
      const error = {
        response: { status: 404 },
        message: 'Not found',
      };

      const result = categorizeError(error);

      expect(result.category).toBe(ErrorCategory.USER_ERROR);
      expect(result.publicMessage).toBe('Resource not found. Please verify the identifier and try again.');
      expect(result.statusCode).toBe(404);
    });

    it('should categorize 4xx errors as USER_ERROR', () => {
      const error = {
        response: { status: 400 },
        message: 'Bad request',
      };

      const result = categorizeError(error);

      expect(result.category).toBe(ErrorCategory.USER_ERROR);
      expect(result.publicMessage).toBe('Invalid request. Please check your parameters and try again.');
      expect(result.statusCode).toBe(400);
    });

    it('should categorize 5xx errors as SYSTEM_ERROR', () => {
      const error = {
        response: { status: 500 },
        message: 'Internal server error',
      };

      const result = categorizeError(error);

      expect(result.category).toBe(ErrorCategory.SYSTEM_ERROR);
      expect(result.publicMessage).toBe('Grafana server error. Please try again later.');
      expect(result.statusCode).toBe(500);
    });

    it('should categorize network errors as NETWORK_ERROR', () => {
      const connectionError = {
        code: 'ECONNREFUSED',
        message: 'Connection refused',
      };

      const result = categorizeError(connectionError);

      expect(result.category).toBe(ErrorCategory.NETWORK_ERROR);
      expect(result.publicMessage).toBe('Unable to connect to Grafana. Please check the server URL and network connection.');
    });

    it('should categorize DNS errors as NETWORK_ERROR', () => {
      const dnsError = {
        code: 'ENOTFOUND',
        message: 'getaddrinfo ENOTFOUND localhost',
      };

      const result = categorizeError(dnsError);

      expect(result.category).toBe(ErrorCategory.NETWORK_ERROR);
    });

    it('should categorize timeout errors as NETWORK_ERROR', () => {
      const timeoutError = {
        code: 'ETIMEDOUT',
        message: 'Request timeout',
      };

      const result = categorizeError(timeoutError);

      expect(result.category).toBe(ErrorCategory.NETWORK_ERROR);
    });

    it('should categorize Zod errors as VALIDATION_ERROR', () => {
      const zodError = {
        name: 'ZodError',
        issues: [{ message: 'Required field missing' }],
        message: 'Validation failed',
      };

      const result = categorizeError(zodError);

      expect(result.category).toBe(ErrorCategory.VALIDATION_ERROR);
      expect(result.publicMessage).toBe('Invalid input parameters. Please check your request and try again.');
    });

    it('should categorize unknown errors as SYSTEM_ERROR', () => {
      const unknownError = {
        message: 'Something unexpected happened',
      };

      const result = categorizeError(unknownError);

      expect(result.category).toBe(ErrorCategory.SYSTEM_ERROR);
      expect(result.publicMessage).toBe('An unexpected error occurred. Please try again.');
    });

    it('should handle errors without messages', () => {
      const error = {};

      const result = categorizeError(error);

      expect(result.category).toBe(ErrorCategory.SYSTEM_ERROR);
      expect(result.internalMessage).toBe('Unknown error: No error message available');
    });
  });

  describe('formatUserError', () => {
    it('should return the public message', () => {
      const categorizedError: CategorizedError = {
        category: ErrorCategory.USER_ERROR,
        publicMessage: 'Authentication failed',
        internalMessage: 'HTTP 401: Unauthorized',
        statusCode: 401,
      };

      const result = formatUserError(categorizedError);

      expect(result).toBe('Authentication failed');
    });
  });

  describe('formatInternalError', () => {
    it('should format error for internal logging with all details', () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\\n    at test.js:1:1';

      const categorizedError: CategorizedError = {
        category: ErrorCategory.SYSTEM_ERROR,
        publicMessage: 'System error',
        internalMessage: 'Internal error occurred',
        statusCode: 500,
        originalError: error,
      };

      const result = formatInternalError(categorizedError);

      expect(result).toContain('Category: system_error');
      expect(result).toContain('Message: Internal error occurred');
      expect(result).toContain('Status: 500');
      expect(result).toContain('Stack: Error: Test error');
    });

    it('should format error without status code or stack', () => {
      const categorizedError: CategorizedError = {
        category: ErrorCategory.USER_ERROR,
        publicMessage: 'User error',
        internalMessage: 'User made a mistake',
      };

      const result = formatInternalError(categorizedError);

      expect(result).toBe('Category: user_error | Message: User made a mistake');
      expect(result).not.toContain('Status:');
      expect(result).not.toContain('Stack:');
    });
  });

  describe('safeStringify', () => {
    it('should stringify objects with sanitization by default', () => {
      const obj = {
        username: 'john',
        password: 'secret123',
        data: { nested: true },
      };

      const result = safeStringify(obj);

      expect(result).toContain('"username": "john"');
      expect(result).toContain('"password": "[REDACTED]"');
      expect(result).toContain('"nested": true');
    });

    it('should stringify without sanitization when disabled', () => {
      const obj = {
        username: 'john',
        password: 'secret123',
      };

      const result = safeStringify(obj, false);

      expect(result).toContain('"password": "secret123"');
    });

    it('should handle circular references gracefully', () => {
      const circular: any = { name: 'test' };
      circular.self = circular;

      const result = safeStringify(circular);

      expect(result).toBe('[Unable to serialize object - circular reference or other issue]');
    });

    it('should handle objects that throw during serialization', () => {
      const problematic = {
        get trouble() {
          throw new Error('Cannot access this property');
        },
      };

      const result = safeStringify(problematic);

      expect(result).toBe('[Unable to serialize object - circular reference or other issue]');
    });
  });

  describe('edge cases', () => {
    it('should handle empty objects and arrays', () => {
      expect(sanitizeObject({})).toEqual({});
      expect(sanitizeObject([])).toEqual([]);
    });

    it('should handle objects with undefined and null values', () => {
      const input = {
        defined: 'value',
        undefined: undefined,
        null: null,
        password: 'secret',
      };

      const result = sanitizeObject(input);

      expect(result).toEqual({
        defined: 'value',
        undefined: undefined,
        null: null,
        password: '[REDACTED]',
      });
    });

    it('should handle arrays with mixed types', () => {
      const input = {
        mixed: [
          'string',
          42,
          { token: 'secret' },
          null,
          undefined,
          ['nested', { password: 'secret' }],
        ],
      };

      const result = sanitizeObject(input);

      expect(result.mixed[0]).toBe('[REDACTED]'); // String gets sanitized
      expect(result.mixed[1]).toBe(42);
      expect(result.mixed[2]).toEqual({ token: '[REDACTED]' });
      expect(result.mixed[3]).toBe(null);
      expect(result.mixed[4]).toBe(undefined);
      expect(result.mixed[5]).toEqual(['[REDACTED]', { password: '[REDACTED]' }]);
    });
  });
});