import { performance, PerformanceObserver } from 'perf_hooks';
import { EventEmitter } from 'events';

export interface PerformanceMetrics {
  timestamp: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
  requestCount: number;
  averageResponseTime: number;
  errorRate: number;
  cacheHitRate: number;
  circuitBreakerState: string;
}

export interface RequestMetrics {
  method: string;
  url: string;
  duration: number;
  status: number;
  cacheHit: boolean;
  timestamp: number;
}

/**
 * Performance monitoring and optimization utilities
 */
export class PerformanceMonitor extends EventEmitter {
  private metrics: PerformanceMetrics;
  private requestHistory: RequestMetrics[] = [];
  private readonly maxHistorySize = 1000;
  private lastCpuUsage: NodeJS.CpuUsage;
  private observer?: PerformanceObserver;

  // Performance thresholds
  private readonly thresholds = {
    maxResponseTime: 5000, // 5 seconds
    maxMemoryUsage: 100 * 1024 * 1024, // 100MB
    maxErrorRate: 0.05, // 5%
    minCacheHitRate: 0.7, // 70%
  };

  constructor() {
    super();
    this.lastCpuUsage = process.cpuUsage();
    this.metrics = this.initializeMetrics();
    this.setupPerformanceObserver();
    this.startMonitoring();
  }

  private initializeMetrics(): PerformanceMetrics {
    return {
      timestamp: Date.now(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      requestCount: 0,
      averageResponseTime: 0,
      errorRate: 0,
      cacheHitRate: 0,
      circuitBreakerState: 'CLOSED',
    };
  }

  private setupPerformanceObserver(): void {
    this.observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      for (const entry of entries) {
        if (entry.entryType === 'measure') {
          this.recordPerformanceMeasure(entry);
        }
      }
    });

    try {
      this.observer.observe({ entryTypes: ['measure'] });
    } catch (error) {
      console.warn('Performance observer setup failed:', error);
    }
  }

  private recordPerformanceMeasure(entry: any): void {
    this.emit('performance-entry', {
      name: entry.name,
      duration: entry.duration,
      startTime: entry.startTime,
    });
  }

  /**
   * Start periodic monitoring
   */
  private startMonitoring(): void {
    // Update metrics every 30 seconds
    setInterval(() => {
      this.updateMetrics();
      this.checkThresholds();
    }, 30000);

    // Clean old request history every 5 minutes
    setInterval(() => {
      this.cleanOldRequests();
    }, 300000);
  }

  /**
   * Record HTTP request metrics
   */
  recordRequest(request: RequestMetrics): void {
    this.requestHistory.push(request);
    
    // Maintain history size limit
    if (this.requestHistory.length > this.maxHistorySize) {
      this.requestHistory.shift();
    }

    this.emit('request-recorded', request);
  }

  /**
   * Start timing a specific operation
   */
  startTimer(name: string): void {
    performance.mark(`${name}-start`);
  }

  /**
   * End timing and get duration
   */
  endTimer(name: string): number {
    const endMark = `${name}-end`;
    const measureName = `${name}-duration`;
    
    performance.mark(endMark);
    performance.measure(measureName, `${name}-start`, endMark);
    
    const measure = performance.getEntriesByName(measureName)[0];
    return measure ? measure.duration : 0;
  }

  /**
   * Get current performance metrics
   */
  getCurrentMetrics(): PerformanceMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  /**
   * Update internal metrics
   */
  private updateMetrics(): void {
    const now = Date.now();
    const recentRequests = this.getRecentRequests(300000); // Last 5 minutes

    this.metrics = {
      timestamp: now,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(this.lastCpuUsage),
      requestCount: this.requestHistory.length,
      averageResponseTime: this.calculateAverageResponseTime(recentRequests),
      errorRate: this.calculateErrorRate(recentRequests),
      cacheHitRate: this.calculateCacheHitRate(recentRequests),
      circuitBreakerState: 'CLOSED', // This would be updated from circuit breaker
    };

    this.lastCpuUsage = process.cpuUsage();
  }

  private getRecentRequests(maxAge: number): RequestMetrics[] {
    const cutoff = Date.now() - maxAge;
    return this.requestHistory.filter(req => req.timestamp > cutoff);
  }

  private calculateAverageResponseTime(requests: RequestMetrics[]): number {
    if (requests.length === 0) return 0;
    const total = requests.reduce((sum, req) => sum + req.duration, 0);
    return total / requests.length;
  }

  private calculateErrorRate(requests: RequestMetrics[]): number {
    if (requests.length === 0) return 0;
    const errors = requests.filter(req => req.status >= 400).length;
    return errors / requests.length;
  }

  private calculateCacheHitRate(requests: RequestMetrics[]): number {
    if (requests.length === 0) return 0;
    const hits = requests.filter(req => req.cacheHit).length;
    return hits / requests.length;
  }

  private checkThresholds(): void {
    const alerts: string[] = [];

    if (this.metrics.averageResponseTime > this.thresholds.maxResponseTime) {
      alerts.push(`High response time: ${this.metrics.averageResponseTime.toFixed(2)}ms`);
    }

    if (this.metrics.memoryUsage.heapUsed > this.thresholds.maxMemoryUsage) {
      alerts.push(`High memory usage: ${(this.metrics.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    }

    if (this.metrics.errorRate > this.thresholds.maxErrorRate) {
      alerts.push(`High error rate: ${(this.metrics.errorRate * 100).toFixed(2)}%`);
    }

    if (this.metrics.cacheHitRate < this.thresholds.minCacheHitRate) {
      alerts.push(`Low cache hit rate: ${(this.metrics.cacheHitRate * 100).toFixed(2)}%`);
    }

    if (alerts.length > 0) {
      this.emit('performance-alert', alerts);
    }
  }

  private cleanOldRequests(): void {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
    this.requestHistory = this.requestHistory.filter(req => req.timestamp > cutoff);
  }

  /**
   * Get performance summary report
   */
  getPerformanceReport(): {
    current: PerformanceMetrics;
    summary: {
      totalRequests: number;
      avgResponseTime: number;
      errorRate: number;
      cacheHitRate: number;
      memoryUsageMB: number;
      cpuUsagePercent: number;
    };
    recommendations: string[];
  } {
    const current = this.getCurrentMetrics();

    const recommendations: string[] = [];

    // Generate optimization recommendations
    if (current.averageResponseTime > 1000) {
      recommendations.push('Consider enabling response caching for frequently accessed data');
    }

    if (current.cacheHitRate < 0.5) {
      recommendations.push('Increase cache TTL or implement more aggressive caching strategies');
    }

    if (current.memoryUsage.heapUsed > 50 * 1024 * 1024) {
      recommendations.push('Monitor for memory leaks and consider implementing object pooling');
    }

    if (current.errorRate > 0.02) {
      recommendations.push('Implement circuit breaker patterns and improve error handling');
    }

    return {
      current,
      summary: {
        totalRequests: this.requestHistory.length,
        avgResponseTime: current.averageResponseTime,
        errorRate: current.errorRate,
        cacheHitRate: current.cacheHitRate,
        memoryUsageMB: current.memoryUsage.heapUsed / 1024 / 1024,
        cpuUsagePercent: (current.cpuUsage.user + current.cpuUsage.system) / 1000000, // Convert microseconds to percentage
      },
      recommendations,
    };
  }

  /**
   * Get detailed memory analysis
   */
  getMemoryAnalysis(): {
    usage: NodeJS.MemoryUsage;
    analysis: {
      heapUtilization: number;
      externalMemoryRatio: number;
      recommendations: string[];
    };
  } {
    const usage = process.memoryUsage();
    const heapUtilization = usage.heapUsed / usage.heapTotal;
    const externalMemoryRatio = usage.external / usage.heapUsed;

    const recommendations: string[] = [];

    if (heapUtilization > 0.8) {
      recommendations.push('Heap utilization is high - consider garbage collection tuning');
    }

    if (externalMemoryRatio > 0.5) {
      recommendations.push('High external memory usage - review buffer and stream usage');
    }

    if (usage.arrayBuffers > 10 * 1024 * 1024) {
      recommendations.push('Large ArrayBuffer usage detected - optimize binary data handling');
    }

    return {
      usage,
      analysis: {
        heapUtilization,
        externalMemoryRatio,
        recommendations,
      },
    };
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.observer) {
      this.observer.disconnect();
    }
    this.removeAllListeners();
  }
}

/**
 * Singleton performance monitor instance
 */
export const performanceMonitor = new PerformanceMonitor();

/**
 * Decorator for measuring function execution time
 */
export function measurePerformance(target: any, propertyName: string, descriptor: PropertyDescriptor) {
  const method = descriptor.value;

  descriptor.value = function (...args: any[]) {
    const timerName = `${target.constructor.name}.${propertyName}`;
    performanceMonitor.startTimer(timerName);

    const result = method.apply(this, args);

    if (result instanceof Promise) {
      return result.finally(() => {
        performanceMonitor.endTimer(timerName);
      });
    } else {
      performanceMonitor.endTimer(timerName);
      return result;
    }
  };

  return descriptor;
}