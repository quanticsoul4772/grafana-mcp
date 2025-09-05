import { EventEmitter } from 'events';
// import { measurePerformance } from "./performance-monitor.js";

/**
 * Object pool for reusing expensive objects and reducing garbage collection
 */
export class ObjectPool<T> {
  private available: T[] = [];
  private inUse = new Set<T>();
  private readonly maxSize: number;
  private readonly factory: () => T;
  private readonly reset?: (item: T) => void;
  private readonly validate?: (item: T) => boolean;

  constructor(
    factory: () => T,
    maxSize = 10,
    reset?: (item: T) => void,
    validate?: (item: T) => boolean,
  ) {
    this.factory = factory;
    this.maxSize = maxSize;
    this.reset = reset;
    this.validate = validate;

    // Pre-populate pool
    for (let i = 0; i < Math.min(3, maxSize); i++) {
      this.available.push(this.factory());
    }
  }

  acquire(): T {
    let item: T;

    // Try to reuse existing item
    if (this.available.length > 0) {
      item = this.available.pop()!;
      
      // Validate item if validator provided
      if (this.validate && !this.validate(item)) {
        // Item is invalid, create new one
        item = this.factory();
      }
    } else {
      // Create new item
      item = this.factory();
    }

    this.inUse.add(item);
    return item;
  }

  release(item: T): void {
    if (!this.inUse.has(item)) {
      return; // Item not from this pool
    }

    this.inUse.delete(item);

    // Reset item if reset function provided
    if (this.reset) {
      this.reset(item);
    }

    // Return to pool if under max size
    if (this.available.length < this.maxSize) {
      this.available.push(item);
    }
    // Otherwise let it be garbage collected
  }

  getStats(): { available: number; inUse: number; total: number } {
    return {
      available: this.available.length,
      inUse: this.inUse.size,
      total: this.available.length + this.inUse.size,
    };
  }

  clear(): void {
    this.available.length = 0;
    this.inUse.clear();
  }
}

/**
 * Optimized service container with resource management
 */
export class ServiceContainer extends EventEmitter {
  private services = new Map<string, any>();
  private factories = new Map<string, () => any>();
  private singletons = new Map<string, any>();
  private pools = new Map<string, ObjectPool<any>>();
  
  // Resource tracking
  private resourceUsage = new Map<string, {
    created: number;
    lastAccessed: number;
    accessCount: number;
    memoryEstimate: number;
  }>();

  /**
   * Register a singleton service
   */
  registerSingleton<T>(name: string, factory: () => T): void {
    this.factories.set(name, factory);
    this.emit('service-registered', { name, type: 'singleton' });
  }

  /**
   * Register a transient service (new instance each time)
   */
  registerTransient<T>(name: string, factory: () => T): void {
    this.services.set(name, factory);
    this.emit('service-registered', { name, type: 'transient' });
  }

  /**
   * Register a pooled service for expensive objects
   */
  registerPooled<T>(
    name: string, 
    factory: () => T, 
    maxPoolSize = 10,
    reset?: (item: T) => void,
    validate?: (item: T) => boolean,
  ): void {
    const pool = new ObjectPool(factory, maxPoolSize, reset, validate);
    this.pools.set(name, pool);
    this.emit('service-registered', { name, type: 'pooled' });
  }

  /**
   * Get service instance
   */
  get<T>(name: string): T {
    this.updateResourceUsage(name);

    // Check for pooled service first
    if (this.pools.has(name)) {
      return this.pools.get(name)!.acquire();
    }

    // Check for singleton
    if (this.factories.has(name)) {
      if (!this.singletons.has(name)) {
        const instance = this.factories.get(name)!();
        this.singletons.set(name, instance);
      }
      return this.singletons.get(name)!;
    }

    // Check for transient
    if (this.services.has(name)) {
      return this.services.get(name)!();
    }

    throw new Error(`Service '${name}' not found`);
  }

  /**
   * Release pooled service back to pool
   */
  release<T>(name: string, instance: T): void {
    if (this.pools.has(name)) {
      this.pools.get(name)!.release(instance);
    }
  }

  /**
   * Check if service exists
   */
  has(name: string): boolean {
    return this.factories.has(name) || 
           this.services.has(name) || 
           this.pools.has(name);
  }

  private updateResourceUsage(name: string): void {
    const now = Date.now();
    const usage = this.resourceUsage.get(name) || {
      created: now,
      lastAccessed: now,
      accessCount: 0,
      memoryEstimate: 0,
    };

    usage.lastAccessed = now;
    usage.accessCount++;
    this.resourceUsage.set(name, usage);
  }

  /**
   * Get service usage statistics
   */
  getResourceStats(): Map<string, ReturnType<ServiceContainer['resourceUsage']['get']>> {
    return new Map(this.resourceUsage);
  }

  /**
   * Get pool statistics
   */
  getPoolStats(): Map<string, ReturnType<ObjectPool<any>['getStats']>> {
    const stats = new Map();
    for (const [name, pool] of this.pools.entries()) {
      stats.set(name, pool.getStats());
    }
    return stats;
  }

  /**
   * Optimize resource usage - cleanup unused services
   */
  optimize(): void {
    const now = Date.now();
    const maxIdleTime = 10 * 60 * 1000; // 10 minutes

    // Clear unused singletons
    for (const [name, usage] of this.resourceUsage.entries()) {
      if (now - usage.lastAccessed > maxIdleTime && usage.accessCount < 5) {
        this.singletons.delete(name);
        this.resourceUsage.delete(name);
      }
    }

    // Clear pools
    for (const pool of this.pools.values()) {
      const stats = pool.getStats();
      if (stats.inUse === 0) {
        pool.clear();
      }
    }

    this.emit('optimized', {
      timestamp: now,
      clearedSingletons: this.singletons.size,
      poolStats: Object.fromEntries(this.getPoolStats()),
    });
  }

  /**
   * Cleanup all resources
   */
  cleanup(): void {
    this.singletons.clear();
    this.resourceUsage.clear();
    
    for (const pool of this.pools.values()) {
      pool.clear();
    }

    this.emit('cleanup');
  }
}

/**
 * Memory-efficient string interning for reducing duplicate strings
 */
export class StringInterner {
  private static instance: StringInterner;
  private internMap = new Map<string, string>();
  private readonly maxSize = 10000;

  static getInstance(): StringInterner {
    if (!StringInterner.instance) {
      StringInterner.instance = new StringInterner();
    }
    return StringInterner.instance;
  }

  /**
   * Intern a string to reuse identical strings and save memory
   */
  intern(str: string): string {
    if (!str || typeof str !== 'string') {
      return str;
    }

    if (this.internMap.has(str)) {
      return this.internMap.get(str)!;
    }

    // Prevent unbounded growth
    if (this.internMap.size >= this.maxSize) {
      this.evictOldEntries();
    }

    this.internMap.set(str, str);
    return str;
  }

  private evictOldEntries(): void {
    // Remove 10% of entries (simple FIFO)
    const toRemove = Math.floor(this.maxSize * 0.1);
    const keys = Array.from(this.internMap.keys());
    
    for (let i = 0; i < toRemove && keys.length > 0; i++) {
      this.internMap.delete(keys[i]);
    }
  }

  getStats(): { size: number; maxSize: number } {
    return {
      size: this.internMap.size,
      maxSize: this.maxSize,
    };
  }

  clear(): void {
    this.internMap.clear();
  }
}

/**
 * Async operation manager with batching and throttling
 */
export class AsyncOperationManager {
  private operationQueues = new Map<string, Array<() => Promise<any>>>();
  private activeOperations = new Map<string, number>();
  private maxConcurrent: number;
  private batchSize: number;

  constructor(maxConcurrent = 10, batchSize = 5) {
    this.maxConcurrent = maxConcurrent;
    this.batchSize = batchSize;
  }

  /**
   * Add operation to queue with automatic batching
   */
  async enqueue<T>(category: string, operation: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.operationQueues.has(category)) {
        this.operationQueues.set(category, []);
        this.activeOperations.set(category, 0);
      }

      const queue = this.operationQueues.get(category)!;
      queue.push(async () => {
        try {
          const result = await operation();
          resolve(result);
          return result;
        } catch (error) {
          reject(error);
          throw error;
        }
      });

      this.processQueue(category);
    });
  }

  private async processQueue(category: string): Promise<void> {
    const queue = this.operationQueues.get(category);
    const active = this.activeOperations.get(category) || 0;

    if (!queue || queue.length === 0 || active >= this.maxConcurrent) {
      return;
    }

    const batch = queue.splice(0, Math.min(this.batchSize, this.maxConcurrent - active));
    this.activeOperations.set(category, active + batch.length);

    // Execute batch in parallel
    const batchPromises = batch.map(async (operation) => {
      try {
        return await operation();
      } catch (error) {
        // Error is already handled in the operation wrapper
        return null;
      } finally {
        const currentActive = this.activeOperations.get(category) || 0;
        this.activeOperations.set(category, Math.max(0, currentActive - 1));
        
        // Process next batch if queue has items
        setImmediate(() => this.processQueue(category));
      }
    });

    await Promise.allSettled(batchPromises);
  }

  /**
   * Get queue statistics
   */
  getStats(): Map<string, { queued: number; active: number }> {
    const stats = new Map();
    
    for (const [category, queue] of this.operationQueues.entries()) {
      stats.set(category, {
        queued: queue.length,
        active: this.activeOperations.get(category) || 0,
      });
    }

    return stats;
  }

  /**
   * Clear all queues
   */
  clear(): void {
    this.operationQueues.clear();
    this.activeOperations.clear();
  }
}