export type ToolCategory = 'dashboards' | 'datasources' | 'prometheus' | 'loki' | 
  'alerting' | 'incident' | 'sift' | 'oncall' | 'admin' | 'navigation' | 'ramp';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: any; // JSON Schema format for MCP
}

export interface ExtendedToolDefinition extends ToolDefinition {
  category: ToolCategory;
  version?: string;
  deprecated?: boolean;
  metadata?: Record<string, any>;
}

export interface ToolHandler {
  (request: { params: { arguments: any } }): Promise<any>;
}

/**
 * Enhanced registry for managing MCP tools with categorization and metadata
 */
export class ToolRegistry {
  private tools = new Map<string, ExtendedToolDefinition>();
  private handlers = new Map<string, ToolHandler>();
  private categories = new Map<ToolCategory, string[]>();

  /**
   * Register a tool with its schema and handler (backward compatible)
   */
  registerTool(definition: ToolDefinition, handler: ToolHandler): void {
    // Convert to extended definition with default category
    const extendedDefinition: ExtendedToolDefinition = {
      ...definition,
      category: 'admin' as ToolCategory, // Default category
      version: '1.0.0',
    };
    this.registerExtendedTool(extendedDefinition, handler);
  }

  /**
   * Register a tool with extended metadata
   */
  registerExtendedTool(definition: ExtendedToolDefinition, handler: ToolHandler): void {
    this.tools.set(definition.name, definition);
    this.handlers.set(definition.name, handler);
    
    // Maintain category index
    if (!this.categories.has(definition.category)) {
      this.categories.set(definition.category, []);
    }
    const categoryTools = this.categories.get(definition.category)!;
    if (!categoryTools.includes(definition.name)) {
      categoryTools.push(definition.name);
    }
  }

  /**
   * Get all registered tools for ListTools response
   */
  getTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get a specific tool handler
   */
  getHandler(name: string): ToolHandler | undefined {
    return this.handlers.get(name);
  }

  /**
   * Check if a tool exists
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get tool definition
   */
  getToolDefinition(name: string): ExtendedToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Get tool names by category
   */
  getToolsByCategory(category: ToolCategory): string[] {
    return this.categories.get(category) ?? [];
  }

  /**
   * Get all categories
   */
  getCategories(): ToolCategory[] {
    return Array.from(this.categories.keys());
  }

  /**
   * Get registry statistics
   */
  getStats(): { totalTools: number; categories: Record<ToolCategory, number> } {
    const categoryStats: Record<ToolCategory, number> = {} as Record<ToolCategory, number>;
    
    for (const [category, tools] of this.categories.entries()) {
      categoryStats[category] = tools.length;
    }

    return {
      totalTools: this.tools.size,
      categories: categoryStats,
    };
  }

  /**
   * Get tools not in disabled categories
   */
  getEnabledTools(disabledCategories: ToolCategory[]): ExtendedToolDefinition[] {
    return Array.from(this.tools.values()).filter(
      (tool) => !disabledCategories.includes(tool.category),
    );
  }

  /**
   * Clear all tools, handlers, and category index
   */
  clear(): void {
    this.tools.clear();
    this.handlers.clear();
    this.categories.clear();
  }

  /**
   * Remove a tool from registry
   */
  unregisterTool(name: string): boolean {
    const tool = this.tools.get(name);
    if (!tool) return false;

    this.tools.delete(name);
    this.handlers.delete(name);

    // Remove from category index
    const categoryTools = this.categories.get(tool.category);
    if (categoryTools) {
      const index = categoryTools.indexOf(name);
      if (index > -1) {
        categoryTools.splice(index, 1);
      }
      if (categoryTools.length === 0) {
        this.categories.delete(tool.category);
      }
    }

    return true;
  }
}
