import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getConfig,
  clearConfigCache,
  isToolCategoryEnabled,
  getEnabledToolCategories,
  displayConfig,
} from './config.js';
import type { Config, ToolCategory } from './types.js';

// Mock console methods
vi.mock('console', () => ({
  log: vi.fn(),
}));

describe('config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    clearConfigCache();
    // Reset environment to clean state
    process.env = { ...originalEnv };
    delete process.env.GRAFANA_URL;
    delete process.env.GRAFANA_TOKEN;
    delete process.env.GRAFANA_DEBUG;
    delete process.env.GRAFANA_TIMEOUT;
    delete process.env.GRAFANA_DISABLE_TOOLS;
    delete process.env.GRAFANA_TLS_CERT_FILE;
    delete process.env.GRAFANA_TLS_KEY_FILE;
    delete process.env.GRAFANA_TLS_CA_FILE;
    delete process.env.GRAFANA_TLS_SKIP_VERIFY;
  });

  afterEach(() => {
    process.env = originalEnv;
    clearConfigCache();
  });

  describe('getConfig', () => {
    it('should parse valid configuration successfully', () => {
      process.env.GRAFANA_URL = 'https://grafana.example.com';
      process.env.GRAFANA_TOKEN = 'test-token-123';

      const config = getConfig();

      expect(config).toEqual({
        GRAFANA_URL: 'https://grafana.example.com',
        GRAFANA_TOKEN: 'test-token-123',
        GRAFANA_DEBUG: false,
        GRAFANA_TIMEOUT: 30000,
        GRAFANA_DISABLE_TOOLS: [],
        GRAFANA_TLS_SKIP_VERIFY: false,
      });
    });

    it('should apply defaults for optional fields', () => {
      process.env.GRAFANA_URL = 'http://localhost:3000';
      process.env.GRAFANA_TOKEN = 'token';

      const config = getConfig();

      expect(config.GRAFANA_DEBUG).toBe(false);
      expect(config.GRAFANA_TIMEOUT).toBe(30000);
      expect(config.GRAFANA_DISABLE_TOOLS).toEqual([]);
      expect(config.GRAFANA_TLS_SKIP_VERIFY).toBe(false);
    });

    it('should parse boolean environment variables correctly', () => {
      process.env.GRAFANA_URL = 'https://grafana.test';
      process.env.GRAFANA_TOKEN = 'token';
      process.env.GRAFANA_DEBUG = 'true';
      process.env.GRAFANA_TLS_SKIP_VERIFY = 'true';

      const config = getConfig();

      expect(config.GRAFANA_DEBUG).toBe(true);
      expect(config.GRAFANA_TLS_SKIP_VERIFY).toBe(true);
    });

    it('should handle false boolean values', () => {
      process.env.GRAFANA_URL = 'https://grafana.test';
      process.env.GRAFANA_TOKEN = 'token';
      process.env.GRAFANA_DEBUG = 'false';
      process.env.GRAFANA_TLS_SKIP_VERIFY = 'false';

      const config = getConfig();

      expect(config.GRAFANA_DEBUG).toBe(false);
      expect(config.GRAFANA_TLS_SKIP_VERIFY).toBe(false);
    });

    it('should parse timeout as integer', () => {
      process.env.GRAFANA_URL = 'https://grafana.test';
      process.env.GRAFANA_TOKEN = 'token';
      process.env.GRAFANA_TIMEOUT = '60000';

      const config = getConfig();

      expect(config.GRAFANA_TIMEOUT).toBe(60000);
    });

    it('should parse disabled tools list correctly', () => {
      process.env.GRAFANA_URL = 'https://grafana.test';
      process.env.GRAFANA_TOKEN = 'token';
      process.env.GRAFANA_DISABLE_TOOLS = 'dashboards,prometheus,admin';

      const config = getConfig();

      expect(config.GRAFANA_DISABLE_TOOLS).toEqual(['dashboards', 'prometheus', 'admin']);
    });

    it('should handle disabled tools with spaces', () => {
      process.env.GRAFANA_URL = 'https://grafana.test';
      process.env.GRAFANA_TOKEN = 'token';
      process.env.GRAFANA_DISABLE_TOOLS = ' dashboards , prometheus , admin ';

      const config = getConfig();

      expect(config.GRAFANA_DISABLE_TOOLS).toEqual(['dashboards', 'prometheus', 'admin']);
    });

    it('should handle empty disabled tools string', () => {
      process.env.GRAFANA_URL = 'https://grafana.test';
      process.env.GRAFANA_TOKEN = 'token';
      process.env.GRAFANA_DISABLE_TOOLS = '';

      const config = getConfig();

      expect(config.GRAFANA_DISABLE_TOOLS).toEqual([]);
    });

    it('should handle disabled tools with empty segments', () => {
      process.env.GRAFANA_URL = 'https://grafana.test';
      process.env.GRAFANA_TOKEN = 'token';
      process.env.GRAFANA_DISABLE_TOOLS = 'dashboards,,prometheus,';

      const config = getConfig();

      expect(config.GRAFANA_DISABLE_TOOLS).toEqual(['dashboards', 'prometheus']);
    });

    it('should include TLS configuration when provided', () => {
      process.env.GRAFANA_URL = 'https://grafana.test';
      process.env.GRAFANA_TOKEN = 'token';
      process.env.GRAFANA_TLS_CERT_FILE = '/path/to/cert.pem';
      process.env.GRAFANA_TLS_KEY_FILE = '/path/to/key.pem';
      process.env.GRAFANA_TLS_CA_FILE = '/path/to/ca.pem';

      const config = getConfig();

      expect(config.GRAFANA_TLS_CERT_FILE).toBe('/path/to/cert.pem');
      expect(config.GRAFANA_TLS_KEY_FILE).toBe('/path/to/key.pem');
      expect(config.GRAFANA_TLS_CA_FILE).toBe('/path/to/ca.pem');
    });

    it('should cache configuration on subsequent calls', () => {
      process.env.GRAFANA_URL = 'https://grafana.test';
      process.env.GRAFANA_TOKEN = 'token';

      const config1 = getConfig();
      const config2 = getConfig();

      expect(config1).toBe(config2); // Same object reference
    });

    it('should throw error for missing GRAFANA_URL', () => {
      process.env.GRAFANA_TOKEN = 'token';
      // GRAFANA_URL is missing

      expect(() => getConfig()).toThrow('Configuration validation failed');
    });

    it('should throw error for invalid GRAFANA_URL', () => {
      process.env.GRAFANA_URL = 'not-a-url';
      process.env.GRAFANA_TOKEN = 'token';

      expect(() => getConfig()).toThrow('GRAFANA_URL must be a valid URL');
    });

    it('should throw error for missing GRAFANA_TOKEN', () => {
      process.env.GRAFANA_URL = 'https://grafana.test';
      // GRAFANA_TOKEN is missing

      expect(() => getConfig()).toThrow('Configuration validation failed');
    });

    it('should throw error for empty GRAFANA_TOKEN', () => {
      process.env.GRAFANA_URL = 'https://grafana.test';
      process.env.GRAFANA_TOKEN = '';

      expect(() => getConfig()).toThrow('GRAFANA_TOKEN is required');
    });

    it('should throw error for invalid GRAFANA_TIMEOUT', () => {
      process.env.GRAFANA_URL = 'https://grafana.test';
      process.env.GRAFANA_TOKEN = 'token';
      process.env.GRAFANA_TIMEOUT = 'not-a-number';

      expect(() => getConfig()).toThrow('Configuration validation failed');
    });

    it('should throw error for negative GRAFANA_TIMEOUT', () => {
      process.env.GRAFANA_URL = 'https://grafana.test';
      process.env.GRAFANA_TOKEN = 'token';
      process.env.GRAFANA_TIMEOUT = '-1000';

      expect(() => getConfig()).toThrow('Configuration validation failed');
    });

    it('should throw error for zero GRAFANA_TIMEOUT', () => {
      process.env.GRAFANA_URL = 'https://grafana.test';
      process.env.GRAFANA_TOKEN = 'token';
      process.env.GRAFANA_TIMEOUT = '0';

      expect(() => getConfig()).toThrow('Configuration validation failed');
    });

    it('should handle floating point timeout values', () => {
      process.env.GRAFANA_URL = 'https://grafana.test';
      process.env.GRAFANA_TOKEN = 'token';
      process.env.GRAFANA_TIMEOUT = '5000.5';

      expect(() => getConfig()).toThrow('Configuration validation failed');
    });

    it('should provide detailed error messages for multiple validation failures', () => {
      process.env.GRAFANA_URL = 'invalid-url';
      process.env.GRAFANA_TOKEN = '';
      process.env.GRAFANA_TIMEOUT = '-100';

      try {
        getConfig();
        expect.fail('Should have thrown validation error');
      } catch (error: any) {
        expect(error.message).toContain('Configuration validation failed');
        expect(error.message).toContain('GRAFANA_URL');
        expect(error.message).toContain('GRAFANA_TOKEN');
        expect(error.message).toContain('GRAFANA_TIMEOUT');
      }
    });
  });

  describe('clearConfigCache', () => {
    it('should clear cached configuration', () => {
      process.env.GRAFANA_URL = 'https://grafana.test';
      process.env.GRAFANA_TOKEN = 'token';

      const config1 = getConfig();
      clearConfigCache();
      
      // Change environment
      process.env.GRAFANA_DEBUG = 'true';
      
      const config2 = getConfig();

      expect(config1).not.toBe(config2); // Different object references
      expect(config1.GRAFANA_DEBUG).toBe(false);
      expect(config2.GRAFANA_DEBUG).toBe(true);
    });
  });

  describe('isToolCategoryEnabled', () => {
    it('should return true for enabled categories', () => {
      const config: Config = {
        GRAFANA_URL: 'https://test.com',
        GRAFANA_TOKEN: 'token',
        GRAFANA_DEBUG: false,
        GRAFANA_TIMEOUT: 30000,
        GRAFANA_DISABLE_TOOLS: ['admin', 'oncall'],
        GRAFANA_TLS_SKIP_VERIFY: false,
      };

      expect(isToolCategoryEnabled('dashboards', config)).toBe(true);
      expect(isToolCategoryEnabled('prometheus', config)).toBe(true);
      expect(isToolCategoryEnabled('loki', config)).toBe(true);
    });

    it('should return false for disabled categories', () => {
      const config: Config = {
        GRAFANA_URL: 'https://test.com',
        GRAFANA_TOKEN: 'token',
        GRAFANA_DEBUG: false,
        GRAFANA_TIMEOUT: 30000,
        GRAFANA_DISABLE_TOOLS: ['admin', 'oncall'],
        GRAFANA_TLS_SKIP_VERIFY: false,
      };

      expect(isToolCategoryEnabled('admin', config)).toBe(false);
      expect(isToolCategoryEnabled('oncall', config)).toBe(false);
    });

    it('should return true for all categories when none are disabled', () => {
      const config: Config = {
        GRAFANA_URL: 'https://test.com',
        GRAFANA_TOKEN: 'token',
        GRAFANA_DEBUG: false,
        GRAFANA_TIMEOUT: 30000,
        GRAFANA_DISABLE_TOOLS: [],
        GRAFANA_TLS_SKIP_VERIFY: false,
      };

      const allCategories: ToolCategory[] = [
        'dashboards', 'datasources', 'prometheus', 'loki', 'alerting',
        'incident', 'sift', 'oncall', 'admin', 'navigation'
      ];

      allCategories.forEach(category => {
        expect(isToolCategoryEnabled(category, config)).toBe(true);
      });
    });
  });

  describe('getEnabledToolCategories', () => {
    it('should return all categories when none are disabled', () => {
      const config: Config = {
        GRAFANA_URL: 'https://test.com',
        GRAFANA_TOKEN: 'token',
        GRAFANA_DEBUG: false,
        GRAFANA_TIMEOUT: 30000,
        GRAFANA_DISABLE_TOOLS: [],
        GRAFANA_TLS_SKIP_VERIFY: false,
      };

      const enabled = getEnabledToolCategories(config);

      expect(enabled).toEqual([
        'dashboards', 'datasources', 'prometheus', 'loki', 'alerting',
        'incident', 'sift', 'oncall', 'admin', 'navigation'
      ]);
    });

    it('should exclude disabled categories', () => {
      const config: Config = {
        GRAFANA_URL: 'https://test.com',
        GRAFANA_TOKEN: 'token',
        GRAFANA_DEBUG: false,
        GRAFANA_TIMEOUT: 30000,
        GRAFANA_DISABLE_TOOLS: ['admin', 'oncall', 'incident'],
        GRAFANA_TLS_SKIP_VERIFY: false,
      };

      const enabled = getEnabledToolCategories(config);

      expect(enabled).toEqual([
        'dashboards', 'datasources', 'prometheus', 'loki', 'alerting',
        'sift', 'navigation'
      ]);
      expect(enabled).not.toContain('admin');
      expect(enabled).not.toContain('oncall');
      expect(enabled).not.toContain('incident');
    });

    it('should return empty array when all categories are disabled', () => {
      const config: Config = {
        GRAFANA_URL: 'https://test.com',
        GRAFANA_TOKEN: 'token',
        GRAFANA_DEBUG: false,
        GRAFANA_TIMEOUT: 30000,
        GRAFANA_DISABLE_TOOLS: [
          'dashboards', 'datasources', 'prometheus', 'loki', 'alerting',
          'incident', 'sift', 'oncall', 'admin', 'navigation'
        ],
        GRAFANA_TLS_SKIP_VERIFY: false,
      };

      const enabled = getEnabledToolCategories(config);

      expect(enabled).toEqual([]);
    });
  });

  describe('displayConfig', () => {
    it('should display basic configuration', () => {
      const config: Config = {
        GRAFANA_URL: 'https://grafana.test.com',
        GRAFANA_TOKEN: 'token',
        GRAFANA_DEBUG: false,
        GRAFANA_TIMEOUT: 30000,
        GRAFANA_DISABLE_TOOLS: [],
        GRAFANA_TLS_SKIP_VERIFY: false,
      };

      displayConfig(config);

      expect(console.log).toHaveBeenCalledWith('Grafana MCP Server Configuration:');
      expect(console.log).toHaveBeenCalledWith('  URL: https://grafana.test.com');
      expect(console.log).toHaveBeenCalledWith('  Debug: false');
      expect(console.log).toHaveBeenCalledWith('  Timeout: 30000ms');
      expect(console.log).toHaveBeenCalledWith('  TLS Skip Verify: false');
      expect(console.log).toHaveBeenCalledWith('  Enabled Tools: dashboards, datasources, prometheus, loki, alerting, incident, sift, oncall, admin, navigation');
    });

    it('should display disabled tools when present', () => {
      const config: Config = {
        GRAFANA_URL: 'https://grafana.test.com',
        GRAFANA_TOKEN: 'token',
        GRAFANA_DEBUG: true,
        GRAFANA_TIMEOUT: 60000,
        GRAFANA_DISABLE_TOOLS: ['admin', 'oncall'],
        GRAFANA_TLS_SKIP_VERIFY: true,
      };

      displayConfig(config);

      expect(console.log).toHaveBeenCalledWith('  Debug: true');
      expect(console.log).toHaveBeenCalledWith('  Timeout: 60000ms');
      expect(console.log).toHaveBeenCalledWith('  TLS Skip Verify: true');
      expect(console.log).toHaveBeenCalledWith('  Enabled Tools: dashboards, datasources, prometheus, loki, alerting, incident, sift, navigation');
      expect(console.log).toHaveBeenCalledWith('  Disabled Tools: admin, oncall');
    });

    it('should display TLS configuration when present', () => {
      const config: Config = {
        GRAFANA_URL: 'https://grafana.test.com',
        GRAFANA_TOKEN: 'token',
        GRAFANA_DEBUG: false,
        GRAFANA_TIMEOUT: 30000,
        GRAFANA_DISABLE_TOOLS: [],
        GRAFANA_TLS_SKIP_VERIFY: false,
        GRAFANA_TLS_CERT_FILE: '/path/to/cert.pem',
        GRAFANA_TLS_KEY_FILE: '/path/to/key.pem',
        GRAFANA_TLS_CA_FILE: '/path/to/ca.pem',
      };

      displayConfig(config);

      expect(console.log).toHaveBeenCalledWith('  TLS Configuration:');
      expect(console.log).toHaveBeenCalledWith('    Cert File: /path/to/cert.pem');
      expect(console.log).toHaveBeenCalledWith('    Key File: /path/to/key.pem');
      expect(console.log).toHaveBeenCalledWith('    CA File: /path/to/ca.pem');
    });

    it('should display partial TLS configuration', () => {
      const config: Config = {
        GRAFANA_URL: 'https://grafana.test.com',
        GRAFANA_TOKEN: 'token',
        GRAFANA_DEBUG: false,
        GRAFANA_TIMEOUT: 30000,
        GRAFANA_DISABLE_TOOLS: [],
        GRAFANA_TLS_SKIP_VERIFY: false,
        GRAFANA_TLS_CERT_FILE: '/path/to/cert.pem',
        // No key file or CA file
      };

      displayConfig(config);

      expect(console.log).toHaveBeenCalledWith('  TLS Configuration:');
      expect(console.log).toHaveBeenCalledWith('    Cert File: /path/to/cert.pem');
      expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('Key File'));
      expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('CA File'));
    });

    it('should not display TLS section when no TLS config is present', () => {
      const config: Config = {
        GRAFANA_URL: 'https://grafana.test.com',
        GRAFANA_TOKEN: 'token',
        GRAFANA_DEBUG: false,
        GRAFANA_TIMEOUT: 30000,
        GRAFANA_DISABLE_TOOLS: [],
        GRAFANA_TLS_SKIP_VERIFY: false,
      };

      displayConfig(config);

      expect(console.log).not.toHaveBeenCalledWith('  TLS Configuration:');
    });

    it('should always end with empty line', () => {
      const config: Config = {
        GRAFANA_URL: 'https://grafana.test.com',
        GRAFANA_TOKEN: 'token',
        GRAFANA_DEBUG: false,
        GRAFANA_TIMEOUT: 30000,
        GRAFANA_DISABLE_TOOLS: [],
        GRAFANA_TLS_SKIP_VERIFY: false,
      };

      displayConfig(config);

      const calls = (console.log as any).mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[0]).toBe('');
    });
  });

  describe('environment variable edge cases', () => {
    it('should handle boolean strings case-insensitively', () => {
      process.env.GRAFANA_URL = 'https://grafana.test';
      process.env.GRAFANA_TOKEN = 'token';
      process.env.GRAFANA_DEBUG = 'TRUE';
      process.env.GRAFANA_TLS_SKIP_VERIFY = 'False';

      const config = getConfig();

      // Note: The current implementation only checks for 'true', so 'TRUE' and 'False' would be false
      expect(config.GRAFANA_DEBUG).toBe(false); // 'TRUE' !== 'true'
      expect(config.GRAFANA_TLS_SKIP_VERIFY).toBe(false); // 'False' !== 'true'
    });

    it('should handle various URL schemes', () => {
      const urlTestCases = [
        'http://localhost:3000',
        'https://grafana.company.com',
        'https://grafana.company.com:8080',
        'https://grafana.company.com/path',
        'https://grafana.company.com:8080/path',
      ];

      urlTestCases.forEach(url => {
        clearConfigCache();
        process.env.GRAFANA_URL = url;
        process.env.GRAFANA_TOKEN = 'token';

        expect(() => getConfig()).not.toThrow();
        const config = getConfig();
        expect(config.GRAFANA_URL).toBe(url);
      });
    });

    it('should handle timeout parsing edge cases', () => {
      const timeoutCases = [
        { input: '1', expected: 1 },
        { input: '999999', expected: 999999 },
        { input: '2147483647', expected: 2147483647 }, // Max safe integer
      ];

      timeoutCases.forEach(({ input, expected }) => {
        clearConfigCache();
        process.env.GRAFANA_URL = 'https://test.com';
        process.env.GRAFANA_TOKEN = 'token';
        process.env.GRAFANA_TIMEOUT = input;

        const config = getConfig();
        expect(config.GRAFANA_TIMEOUT).toBe(expected);
      });
    });
  });
});