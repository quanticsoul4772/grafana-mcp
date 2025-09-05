import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRegistry, type ToolDefinition, type ExtendedToolDefinition, type ToolHandler } from './tool-registry.js';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('registerTool', () => {
    it('should register a basic tool with default category', () => {
      const definition: ToolDefinition = {
        name: 'test-tool',
        description: 'A test tool',
        inputSchema: {
          type: 'object',
          properties: {
            param: { type: 'string' },
          },
        },
      };

      const handler: ToolHandler = vi.fn();

      registry.registerTool(definition, handler);

      expect(registry.hasTool('test-tool')).toBe(true);
      expect(registry.getHandler('test-tool')).toBe(handler);

      const tools = registry.getTools();
      expect(tools).toHaveLength(1);
      expect(tools[0]).toEqual(expect.objectContaining({
        name: 'test-tool',
        description: 'A test tool',
        category: 'admin',
        version: '1.0.0',
      }));
    });
  });

  describe('registerExtendedTool', () => {
    it('should register a tool with extended metadata', () => {
      const definition: ExtendedToolDefinition = {
        name: 'dashboard-search',
        description: 'Search for dashboards',
        category: 'dashboards',
        version: '2.0.0',
        metadata: { author: 'test' },
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
          },
        },
      };

      const handler: ToolHandler = vi.fn();

      registry.registerExtendedTool(definition, handler);

      expect(registry.hasTool('dashboard-search')).toBe(true);
      expect(registry.getHandler('dashboard-search')).toBe(handler);

      const tools = registry.getTools();
      expect(tools[0]).toEqual(definition);
    });

    it('should maintain category index', () => {
      const dashboardTool: ExtendedToolDefinition = {
        name: 'dashboard-get',
        description: 'Get dashboard',
        category: 'dashboards',
        inputSchema: {},
      };

      const prometheusTool: ExtendedToolDefinition = {
        name: 'prometheus-query',
        description: 'Query Prometheus',
        category: 'prometheus',
        inputSchema: {},
      };

      registry.registerExtendedTool(dashboardTool, vi.fn());
      registry.registerExtendedTool(prometheusTool, vi.fn());

      const dashboardTools = registry.getToolsByCategory('dashboards');
      const prometheusTools = registry.getToolsByCategory('prometheus');

      expect(dashboardTools).toEqual(['dashboard-get']);
      expect(prometheusTools).toEqual(['prometheus-query']);
    });

    it('should handle multiple tools in same category', () => {
      const tool1: ExtendedToolDefinition = {
        name: 'dashboard-search',
        description: 'Search dashboards',
        category: 'dashboards',
        inputSchema: {},
      };

      const tool2: ExtendedToolDefinition = {
        name: 'dashboard-create',
        description: 'Create dashboard',
        category: 'dashboards',
        inputSchema: {},
      };

      registry.registerExtendedTool(tool1, vi.fn());
      registry.registerExtendedTool(tool2, vi.fn());

      const dashboardTools = registry.getToolsByCategory('dashboards');
      expect(dashboardTools).toEqual(['dashboard-search', 'dashboard-create']);
    });

    it('should not duplicate tools in category index', () => {
      const definition: ExtendedToolDefinition = {
        name: 'test-tool',
        description: 'Test tool',
        category: 'admin',
        inputSchema: {},
      };

      registry.registerExtendedTool(definition, vi.fn());
      registry.registerExtendedTool(definition, vi.fn()); // Register again

      const adminTools = registry.getToolsByCategory('admin');
      expect(adminTools).toEqual(['test-tool']); // Should not be duplicated
    });
  });

  describe('getTools', () => {
    it('should return empty array when no tools registered', () => {
      const tools = registry.getTools();
      expect(tools).toEqual([]);
    });

    it('should return all registered tools', () => {
      const tool1: ToolDefinition = {
        name: 'tool1',
        description: 'First tool',
        inputSchema: {},
      };

      const tool2: ToolDefinition = {
        name: 'tool2',
        description: 'Second tool',
        inputSchema: {},
      };

      registry.registerTool(tool1, vi.fn());
      registry.registerTool(tool2, vi.fn());

      const tools = registry.getTools();
      expect(tools).toHaveLength(2);
      expect(tools.map(t => t.name)).toEqual(['tool1', 'tool2']);
    });
  });

  describe('getHandler', () => {
    it('should return undefined for non-existent tool', () => {
      const handler = registry.getHandler('non-existent');
      expect(handler).toBeUndefined();
    });

    it('should return the correct handler for existing tool', () => {
      const testHandler: ToolHandler = vi.fn();
      const definition: ToolDefinition = {
        name: 'test-tool',
        description: 'Test tool',
        inputSchema: {},
      };

      registry.registerTool(definition, testHandler);

      const handler = registry.getHandler('test-tool');
      expect(handler).toBe(testHandler);
    });
  });

  describe('hasTool', () => {
    it('should return false for non-existent tool', () => {
      expect(registry.hasTool('non-existent')).toBe(false);
    });

    it('should return true for existing tool', () => {
      const definition: ToolDefinition = {
        name: 'existing-tool',
        description: 'Existing tool',
        inputSchema: {},
      };

      registry.registerTool(definition, vi.fn());

      expect(registry.hasTool('existing-tool')).toBe(true);
    });
  });

  describe('getToolsByCategory', () => {
    it('should return empty array for non-existent category', () => {
      const tools = registry.getToolsByCategory('non-existent' as any);
      expect(tools).toEqual([]);
    });

    it('should return tools in specific category', () => {
      const dashboardTool: ExtendedToolDefinition = {
        name: 'dashboard-search',
        description: 'Search dashboards',
        category: 'dashboards',
        inputSchema: {},
      };

      const adminTool: ExtendedToolDefinition = {
        name: 'admin-users',
        description: 'Manage users',
        category: 'admin',
        inputSchema: {},
      };

      registry.registerExtendedTool(dashboardTool, vi.fn());
      registry.registerExtendedTool(adminTool, vi.fn());

      expect(registry.getToolsByCategory('dashboards')).toEqual(['dashboard-search']);
      expect(registry.getToolsByCategory('admin')).toEqual(['admin-users']);
    });
  });

  describe('getEnabledTools', () => {
    it('should return all tools when no categories disabled', () => {
      const dashboardTool: ExtendedToolDefinition = {
        name: 'dashboard-search',
        description: 'Search dashboards',
        category: 'dashboards',
        inputSchema: {},
      };

      const prometheusTools: ExtendedToolDefinition = {
        name: 'prometheus-query',
        description: 'Query Prometheus',
        category: 'prometheus',
        inputSchema: {},
      };

      registry.registerExtendedTool(dashboardTool, vi.fn());
      registry.registerExtendedTool(prometheusTools, vi.fn());

      const enabledTools = registry.getEnabledTools([]);
      expect(enabledTools).toHaveLength(2);
      expect(enabledTools.map(t => t.name)).toEqual(['dashboard-search', 'prometheus-query']);
    });

    it('should exclude tools from disabled categories', () => {
      const dashboardTool: ExtendedToolDefinition = {
        name: 'dashboard-search',
        description: 'Search dashboards',
        category: 'dashboards',
        inputSchema: {},
      };

      const prometheusTool: ExtendedToolDefinition = {
        name: 'prometheus-query',
        description: 'Query Prometheus',
        category: 'prometheus',
        inputSchema: {},
      };

      const adminTool: ExtendedToolDefinition = {
        name: 'admin-users',
        description: 'Manage users',
        category: 'admin',
        inputSchema: {},
      };

      registry.registerExtendedTool(dashboardTool, vi.fn());
      registry.registerExtendedTool(prometheusTool, vi.fn());
      registry.registerExtendedTool(adminTool, vi.fn());

      const enabledTools = registry.getEnabledTools(['prometheus', 'admin']);
      expect(enabledTools).toHaveLength(1);
      expect(enabledTools[0].name).toBe('dashboard-search');
    });

    it('should handle deprecated tools correctly', () => {
      const activeTool: ExtendedToolDefinition = {
        name: 'active-tool',
        description: 'Active tool',
        category: 'dashboards',
        inputSchema: {},
      };

      const deprecatedTool: ExtendedToolDefinition = {
        name: 'deprecated-tool',
        description: 'Deprecated tool',
        category: 'dashboards',
        deprecated: true,
        inputSchema: {},
      };

      registry.registerExtendedTool(activeTool, vi.fn());
      registry.registerExtendedTool(deprecatedTool, vi.fn());

      const enabledTools = registry.getEnabledTools([]);
      // Both should be returned (filtering deprecated is not implemented in getEnabledTools)
      expect(enabledTools).toHaveLength(2);
    });
  });

  describe('getCategories', () => {
    it('should return empty array when no tools registered', () => {
      const categories = registry.getCategories();
      expect(categories).toEqual([]);
    });

    it('should return all categories with registered tools', () => {
      const dashboardTool: ExtendedToolDefinition = {
        name: 'dashboard-search',
        description: 'Search dashboards',
        category: 'dashboards',
        inputSchema: {},
      };

      const prometheusTool: ExtendedToolDefinition = {
        name: 'prometheus-query',
        description: 'Query Prometheus',
        category: 'prometheus',
        inputSchema: {},
      };

      registry.registerExtendedTool(dashboardTool, vi.fn());
      registry.registerExtendedTool(prometheusTool, vi.fn());

      const categories = registry.getCategories();
      expect(categories.sort()).toEqual(['dashboards', 'prometheus']);
    });
  });

  describe('clear', () => {
    it('should clear all tools and handlers', () => {
      const definition: ToolDefinition = {
        name: 'test-tool',
        description: 'Test tool',
        inputSchema: {},
      };

      registry.registerTool(definition, vi.fn());

      expect(registry.hasTool('test-tool')).toBe(true);
      expect(registry.getTools()).toHaveLength(1);

      registry.clear();

      expect(registry.hasTool('test-tool')).toBe(false);
      expect(registry.getTools()).toHaveLength(0);
      expect(registry.getCategories()).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('should handle tools with empty names', () => {
      const definition: ToolDefinition = {
        name: '',
        description: 'Empty name tool',
        inputSchema: {},
      };

      registry.registerTool(definition, vi.fn());

      expect(registry.hasTool('')).toBe(true);
      expect(registry.getTools()).toHaveLength(1);
    });

    it('should handle tools with complex input schemas', () => {
      const complexSchema = {
        type: 'object',
        properties: {
          nested: {
            type: 'object',
            properties: {
              deep: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    value: { type: 'string' },
                  },
                },
              },
            },
          },
        },
        required: ['nested'],
      };

      const definition: ToolDefinition = {
        name: 'complex-tool',
        description: 'Tool with complex schema',
        inputSchema: complexSchema,
      };

      registry.registerTool(definition, vi.fn());

      const tools = registry.getTools();
      expect(tools[0].inputSchema).toEqual(complexSchema);
    });

    it('should handle handler replacement', () => {
      const handler1: ToolHandler = vi.fn();
      const handler2: ToolHandler = vi.fn();

      const definition: ToolDefinition = {
        name: 'replaceable-tool',
        description: 'Tool that can be replaced',
        inputSchema: {},
      };

      registry.registerTool(definition, handler1);
      expect(registry.getHandler('replaceable-tool')).toBe(handler1);

      registry.registerTool(definition, handler2);
      expect(registry.getHandler('replaceable-tool')).toBe(handler2);
    });

    it('should handle null/undefined metadata gracefully', () => {
      const definition: ExtendedToolDefinition = {
        name: 'metadata-tool',
        description: 'Tool with null metadata',
        category: 'admin',
        metadata: undefined,
        inputSchema: {},
      };

      expect(() => {
        registry.registerExtendedTool(definition, vi.fn());
      }).not.toThrow();

      const tools = registry.getTools();
      expect(tools[0].metadata).toBeUndefined();
    });
  });
});