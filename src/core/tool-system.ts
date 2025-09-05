/**
 * Declarative tool registration system
 */

import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { IToolMetadata, IToolRegistration, IService } from "./interfaces.js";
import { ToolRegistry } from "../tool-registry.js";

/**
 * Tool decorator metadata
 */
export interface ToolDecoratorOptions {
  name: string;
  description: string;
  category?: string;
  tags?: string[];
  deprecated?: boolean;
  schema?: z.ZodSchema;
}

/**
 * Tool method decorator
 */
export function Tool(options: ToolDecoratorOptions) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    // Store tool metadata on the class
    if (!target.constructor.__tools) {
      target.constructor.__tools = [];
    }

    const toolMetadata: IToolMetadata = {
      name: options.name,
      description: options.description,
      category: options.category || 'general',
      version: '1.0.0',
      tags: options.tags,
      deprecated: options.deprecated
    };

    target.constructor.__tools.push({
      metadata: toolMetadata,
      method: propertyName,
      schema: options.schema,
      handler: descriptor.value
    });

    return descriptor;
  };
}

/**
 * Service decorator for tool registration
 */
export function ToolService(category?: string) {
  return function <T extends new (...args: any[]) => any>(constructor: T) {
    constructor.prototype.__toolCategory = category || constructor.name.toLowerCase();
    return constructor;
  };
}

/**
 * Tool registration helper
 */
export class ToolRegistrationHelper {
  /**
   * Register tools from a service class using decorators
   */
  static registerServiceTools<T extends IService>(
    registry: ToolRegistry,
    service: T
  ): IToolRegistration[] {
    const serviceClass = service.constructor as any;
    const tools = serviceClass.__tools || [];
    const registrations: IToolRegistration[] = [];

    for (const toolDef of tools) {
      const { metadata, method, schema, handler } = toolDef;
      
      const registration: IToolRegistration = {
        metadata,
        schema: schema ? zodToJsonSchema(schema) : {},
        handler: async (request: any) => {
          // Bind the method to the service instance
          const boundHandler = handler.bind(service);
          return await boundHandler(request);
        }
      };

      registry.registerTool(
        {
          name: metadata.name,
          description: metadata.description,
          inputSchema: registration.schema
        },
        registration.handler
      );

      registrations.push(registration);
    }

    return registrations;
  }

  /**
   * Get tool metadata from service class
   */
  static getServiceToolMetadata<T extends IService>(service: T): IToolMetadata[] {
    const serviceClass = service.constructor as any;
    const tools = serviceClass.__tools || [];
    return tools.map((tool: any) => tool.metadata);
  }
}

/**
 * Fluent tool builder for programmatic registration
 */
export class ToolBuilder {
  private metadata: Partial<IToolMetadata> = {};
  private schema?: z.ZodSchema;
  private handler?: (request: any) => Promise<any>;

  static create(): ToolBuilder {
    return new ToolBuilder();
  }

  name(name: string): ToolBuilder {
    this.metadata.name = name;
    return this;
  }

  description(description: string): ToolBuilder {
    this.metadata.description = description;
    return this;
  }

  category(category: string): ToolBuilder {
    this.metadata.category = category;
    return this;
  }

  version(version: string): ToolBuilder {
    this.metadata.version = version;
    return this;
  }

  tags(...tags: string[]): ToolBuilder {
    this.metadata.tags = tags;
    return this;
  }

  deprecated(deprecated = true): ToolBuilder {
    this.metadata.deprecated = deprecated;
    return this;
  }

  inputSchema(schema: z.ZodSchema): ToolBuilder {
    this.schema = schema;
    return this;
  }

  handle(handler: (request: any) => Promise<any>): ToolBuilder {
    this.handler = handler;
    return this;
  }

  build(): IToolRegistration {
    if (!this.metadata.name || !this.metadata.description || !this.handler) {
      throw new Error('Tool must have name, description, and handler');
    }

    const toolMetadata: IToolMetadata = {
      name: this.metadata.name,
      description: this.metadata.description,
      category: this.metadata.category || 'general',
      version: this.metadata.version || '1.0.0',
      tags: this.metadata.tags,
      deprecated: this.metadata.deprecated
    };

    return {
      metadata: toolMetadata,
      schema: this.schema ? zodToJsonSchema(this.schema) : {},
      handler: this.handler
    };
  }

  register(registry: ToolRegistry): IToolRegistration {
    const registration = this.build();
    
    registry.registerTool(
      {
        name: registration.metadata.name,
        description: registration.metadata.description,
        inputSchema: registration.schema
      },
      registration.handler
    );

    return registration;
  }
}

/**
 * Tool collection for organizing related tools
 */
export class ToolCollection {
  private tools: IToolRegistration[] = [];

  constructor(public readonly category: string) {}

  add(registration: IToolRegistration): ToolCollection {
    this.tools.push(registration);
    return this;
  }

  addBuilder(builder: ToolBuilder): ToolCollection {
    return this.add(builder.build());
  }

  registerAll(registry: ToolRegistry): void {
    for (const tool of this.tools) {
      registry.registerTool(
        {
          name: tool.metadata.name,
          description: tool.metadata.description,
          inputSchema: tool.schema
        },
        tool.handler
      );
    }
  }

  getTools(): IToolRegistration[] {
    return [...this.tools];
  }

  getMetadata(): IToolMetadata[] {
    return this.tools.map(t => t.metadata);
  }
}