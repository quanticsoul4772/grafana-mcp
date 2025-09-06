import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleToolError,
  withErrorHandling,
  createSuccessResponse,
  validateRequiredParams,
} from './error-handler.js';
import { ErrorCategory } from './security-utils.js';

// Mock console.error to avoid noise in test output
vi.mock('console', () => ({
  error: vi.fn(),
}));

describe('error-handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleToolError', () => {
    it('should handle USER_ERROR with contextual message', () => {
      const error = {
        response: { status: 401 },
        message: 'Unauthorized',
      };

      const result = handleToolError(error, 'test-tool', 'get-data');

      expect(result.isError).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Authentication failed');
      expect(result.content[0].text).toContain('Operation: test-tool');
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('[Tool Error]')
      );
    });

    it('should handle NETWORK_ERROR with connection guidance', () => {
      const error = {
        code: 'ECONNREFUSED',
        message: 'Connection refused',
      };

      const result = handleToolError(error, 'grafana-query');

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unable to connect to Grafana');
      expect(result.content[0].text).toContain('Grafana server is running');
      expect(result.content[0].text).toContain('GRAFANA_URL is correct');
      expect(result.content[0].text).toContain('Network connectivity is available');
    });

    it('should handle VALIDATION_ERROR with parameter guidance', () => {
      const error = {
        name: 'ZodError',
        message: 'Validation failed',
        issues: [{ message: 'Required field missing' }],
      };

      const result = handleToolError(error, 'dashboard-create');

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid input parameters');
      expect(result.content[0].text).toContain('check the parameters you provided');
      expect(result.content[0].text).toContain('tool documentation');
    });

    it('should handle SYSTEM_ERROR generically', () => {
      const error = {
        response: { status: 500 },
        message: 'Internal server error',
      };

      const result = handleToolError(error, 'system-operation');

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Grafana server error');
      expect(result.content[0].text).toContain('If this problem persists');
      expect(result.content[0].text).toContain('server logs');
    });

    it('should handle unknown error types as SYSTEM_ERROR', () => {
      const error = new Error('Unknown error');

      const result = handleToolError(error, 'unknown-tool');

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('An unexpected error occurred');
    });

    it('should include operation in context when provided', () => {
      const error = new Error('Test error');

      handleToolError(error, 'test-tool', 'test-operation');

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('test-tool:test-operation')
      );
    });

    it('should work without operation parameter', () => {
      const error = new Error('Test error');

      const result = handleToolError(error, 'test-tool');

      expect(result.isError).toBe(true);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('[Tool Error]')
      );
    });

    it('should handle HTTP 403 errors appropriately', () => {
      const error = {
        response: { status: 403 },
        message: 'Forbidden',
      };

      const result = handleToolError(error, 'admin-tool');

      expect(result.content[0].text).toContain('Permission denied');
      expect(result.content[0].text).toContain('Insufficient privileges');
    });

    it('should handle HTTP 404 errors appropriately', () => {
      const error = {
        response: { status: 404 },
        message: 'Not found',
      };

      const result = handleToolError(error, 'dashboard-get');

      expect(result.content[0].text).toContain('Resource not found');
      expect(result.content[0].text).toContain('verify the identifier');
    });

    it('should handle various network error codes', () => {
      const testCases = [
        { code: 'ENOTFOUND', expectedText: 'Unable to connect to Grafana' },
        { code: 'ETIMEDOUT', expectedText: 'Unable to connect to Grafana' },
        { code: 'ECONNREFUSED', expectedText: 'Unable to connect to Grafana' },
      ];

      testCases.forEach(({ code, expectedText }) => {
        const error = { code, message: `Network error: ${code}` };
        const result = handleToolError(error, 'network-test');

        expect(result.content[0].text).toContain(expectedText);
      });
    });
  });

  describe('withErrorHandling', () => {
    it('should return handler result when no error occurs', async () => {
      const successResponse = createSuccessResponse('Operation completed');
      const handler = vi.fn().mockResolvedValue(successResponse);

      const result = await withErrorHandling('test-tool', 'test-op', handler);

      expect(result).toEqual(successResponse);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('should catch and handle errors from handler', async () => {
      const error = new Error('Handler failed');
      const handler = vi.fn().mockRejectedValue(error);

      const result = await withErrorHandling('test-tool', 'test-op', handler);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('An unexpected error occurred');
      expect(handler).toHaveBeenCalledOnce();
    });

    it('should pass correct context to error handler', async () => {
      const error = {
        response: { status: 401 },
        message: 'Unauthorized',
      };
      const handler = vi.fn().mockRejectedValue(error);

      const result = await withErrorHandling('auth-tool', 'login', handler);

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('auth-tool:login')
      );
      expect(result.content[0].text).toContain('Operation: auth-tool');
    });

    it('should handle various HTTP status codes', async () => {
      const testCases = [
        { status: 400, expectedText: 'Invalid request' },
        { status: 401, expectedText: 'Authentication failed' },
        { status: 403, expectedText: 'Permission denied' },
        { status: 404, expectedText: 'Resource not found' },
        { status: 422, expectedText: 'Invalid request' },
        { status: 500, expectedText: 'Grafana server error' },
        { status: 502, expectedText: 'Grafana server error' },
        { status: 503, expectedText: 'Grafana server error' },
      ];

      for (const { status, expectedText } of testCases) {
        const error = {
          response: { status },
          message: `HTTP ${status}`,
        };
        const handler = vi.fn().mockRejectedValue(error);

        const result = await withErrorHandling('http-tool', 'request', handler);

        expect(result.content[0].text).toContain(expectedText);
      }
    });
  });

  describe('createSuccessResponse', () => {
    it('should create properly formatted success response', () => {
      const message = 'Operation completed successfully';

      const result = createSuccessResponse(message);

      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: message,
          },
        ],
      });
      expect(result.isError).toBeUndefined();
    });

    it('should handle empty messages', () => {
      const result = createSuccessResponse('');

      expect(result.content[0].text).toBe('');
      expect(result.content[0].type).toBe('text');
    });

    it('should handle messages with special characters', () => {
      const message = 'Success! Dashboard "My Dashboard" created with ID: dash-123 ✓';

      const result = createSuccessResponse(message);

      expect(result.content[0].text).toBe(message);
    });
  });

  describe('validateRequiredParams', () => {
    it('should not throw when all required params are present', () => {
      const params = {
        url: 'http://localhost',
        token: 'abc123',
        name: 'test',
      };
      const required = ['url', 'token'];

      expect(() => {
        validateRequiredParams(params, required, 'test-tool');
      }).not.toThrow();
    });

    it('should throw ValidationError for missing single parameter', () => {
      const params = {
        url: 'http://localhost',
        // token is missing
      };
      const required = ['url', 'token'];

      expect(() => {
        validateRequiredParams(params, required, 'test-tool');
      }).toThrowError('Missing required parameters: token');

      try {
        validateRequiredParams(params, required, 'test-tool');
      } catch (error: any) {
        expect(error.name).toBe('ValidationError');
      }
    });

    it('should throw ValidationError for multiple missing parameters', () => {
      const params = {
        name: 'test',
        // url and token are missing
      };
      const required = ['url', 'token', 'name'];

      expect(() => {
        validateRequiredParams(params, required, 'test-tool');
      }).toThrowError('Missing required parameters: url, token');
    });

    it('should handle empty params object', () => {
      const params = {};
      const required = ['url', 'token'];

      expect(() => {
        validateRequiredParams(params, required, 'test-tool');
      }).toThrowError('Missing required parameters: url, token');
    });

    it('should handle null and undefined param values', () => {
      const params = {
        url: null,
        token: undefined,
        name: 'test',
      };
      const required = ['url', 'token', 'name'];

      expect(() => {
        validateRequiredParams(params, required, 'test-tool');
      }).toThrowError('Missing required parameters: url, token');
    });

    it('should handle empty string values as missing', () => {
      const params = {
        url: '',
        token: 'valid-token',
        name: '   ', // whitespace-only
      };
      const required = ['url', 'token'];

      expect(() => {
        validateRequiredParams(params, required, 'test-tool');
      }).toThrowError('Missing required parameters: url');
    });

    it('should handle empty required fields array', () => {
      const params = { any: 'value' };
      const required: string[] = [];

      expect(() => {
        validateRequiredParams(params, required, 'test-tool');
      }).not.toThrow();
    });

    it('should handle boolean false as valid value', () => {
      const params = {
        enabled: false,
        count: 0,
        name: 'test',
      };
      const required = ['enabled', 'count', 'name'];

      expect(() => {
        validateRequiredParams(params, required, 'test-tool');
      }).not.toThrow();
    });

    it('should preserve original error properties', () => {
      const params = {};
      const required = ['missing'];

      try {
        validateRequiredParams(params, required, 'test-tool');
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe('ValidationError');
        expect(error.message).toBe('Missing required parameters: missing');
      }
    });
  });

  describe('edge cases and integration', () => {
    it('should handle malformed error objects', () => {
      const malformedError = {
        response: null,
        message: undefined,
        weirdProperty: 'should not break',
      };

      const result = handleToolError(malformedError, 'edge-case-tool');

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('An unexpected error occurred');
    });

    it('should handle error without response property', () => {
      const error = {
        message: 'Some error without response',
        stack: 'Error: Some error\\n    at test.js:1:1',
      };

      const result = handleToolError(error, 'no-response-tool');

      expect(result.isError).toBe(true);
      expect(console.error).toHaveBeenCalled();
    });

    it('should handle async handler that throws synchronously', async () => {
      const handler = () => {
        throw new Error('Synchronous error in async handler');
      };

      const result = await withErrorHandling('sync-error-tool', 'test', handler);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('An unexpected error occurred');
    });

    it('should preserve error context through multiple layers', async () => {
      const originalError = {
        response: { status: 403 },
        message: 'Access denied',
      };

      const handler = async () => {
        throw originalError;
      };

      const result = await withErrorHandling('multi-layer-tool', 'deep-operation', handler);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Permission denied');
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('multi-layer-tool:deep-operation')
      );
    });
  });
});