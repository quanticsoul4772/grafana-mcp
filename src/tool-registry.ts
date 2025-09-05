export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: any; // JSON Schema format for MCP
}

export interface ToolHandler {
  (request: { params: { arguments: any } }): Promise<any>;
}

/**
 * Registry for managing MCP tools and their handlers
 */
export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private handlers = new Map<string, ToolHandler>();

  /**
   * Register a tool with its schema and handler
   */
  registerTool(definition: ToolDefinition, handler: ToolHandler): void {
    this.tools.set(definition.name, definition);
    this.handlers.set(definition.name, handler);
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
  getToolDefinition(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }
}
