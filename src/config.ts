import { z } from "zod";
import { Config, ConfigSchema, ToolCategory } from "./types.js";

/**
 * Parse environment variables and validate configuration
 */
function parseConfig(): Config {
  const env = process.env;

  // Parse disabled tools
  const disabledTools = env.GRAFANA_DISABLE_TOOLS
    ? env.GRAFANA_DISABLE_TOOLS.split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  const rawConfig = {
    GRAFANA_URL: env.GRAFANA_URL,
    GRAFANA_TOKEN: env.GRAFANA_TOKEN,
    GRAFANA_DEBUG: env.GRAFANA_DEBUG === "true",
    GRAFANA_TIMEOUT: env.GRAFANA_TIMEOUT
      ? parseInt(env.GRAFANA_TIMEOUT, 10)
      : undefined,
    GRAFANA_DISABLE_TOOLS: disabledTools,
    GRAFANA_TLS_CERT_FILE: env.GRAFANA_TLS_CERT_FILE,
    GRAFANA_TLS_KEY_FILE: env.GRAFANA_TLS_KEY_FILE,
    GRAFANA_TLS_CA_FILE: env.GRAFANA_TLS_CA_FILE,
    GRAFANA_TLS_SKIP_VERIFY: env.GRAFANA_TLS_SKIP_VERIFY === "true",
  };

  try {
    return ConfigSchema.parse(rawConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("\\n");

      throw new Error(`Configuration validation failed:\\n${issues}`);
    }
    throw error;
  }
}

/**
 * Check if a tool category is enabled
 */
export function isToolCategoryEnabled(
  category: ToolCategory,
  config: Config,
): boolean {
  return !config.GRAFANA_DISABLE_TOOLS.includes(category);
}

/**
 * Get list of enabled tool categories
 */
export function getEnabledToolCategories(config: Config): ToolCategory[] {
  const allCategories: ToolCategory[] = [
    "dashboards",
    "datasources",
    "prometheus",
    "loki",
    "alerting",
    "incident",
    "sift",
    "oncall",
    "admin",
    "navigation",
  ];

  return allCategories.filter((category) =>
    isToolCategoryEnabled(category, config),
  );
}

/**
 * Display configuration summary
 */
export function displayConfig(config: Config): void {
  console.log("Grafana MCP Server Configuration:");
  console.log(`  URL: ${config.GRAFANA_URL}`);
  console.log(`  Debug: ${config.GRAFANA_DEBUG}`);
  console.log(`  Timeout: ${config.GRAFANA_TIMEOUT}ms`);
  console.log(`  TLS Skip Verify: ${config.GRAFANA_TLS_SKIP_VERIFY}`);

  const enabledCategories = getEnabledToolCategories(config);
  console.log(`  Enabled Tools: ${enabledCategories.join(", ")}`);

  if (config.GRAFANA_DISABLE_TOOLS.length > 0) {
    console.log(`  Disabled Tools: ${config.GRAFANA_DISABLE_TOOLS.join(", ")}`);
  }

  if (
    config.GRAFANA_TLS_CERT_FILE ||
    config.GRAFANA_TLS_KEY_FILE ||
    config.GRAFANA_TLS_CA_FILE
  ) {
    console.log("  TLS Configuration:");
    if (config.GRAFANA_TLS_CERT_FILE)
      console.log(`    Cert File: ${config.GRAFANA_TLS_CERT_FILE}`);
    if (config.GRAFANA_TLS_KEY_FILE)
      console.log(`    Key File: ${config.GRAFANA_TLS_KEY_FILE}`);
    if (config.GRAFANA_TLS_CA_FILE)
      console.log(`    CA File: ${config.GRAFANA_TLS_CA_FILE}`);
  }

  console.log("");
}

// Lazy configuration loading with caching
let cachedConfig: Config | null = null;

/**
 * Get configuration with lazy loading and caching
 */
export function getConfig(): Config {
  if (!cachedConfig) {
    cachedConfig = parseConfig();
  }
  return cachedConfig;
}

/**
 * Clear cached configuration (useful for testing)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}

// Parse and export configuration for backward compatibility
export const config = getConfig();
