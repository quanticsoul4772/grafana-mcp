# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Grafana MCP Server — exposes Grafana functionality (dashboards, datasources, Prometheus, Loki, alerting, admin) as MCP tools over stdio transport. Built with TypeScript, Zod, and the `@modelcontextprotocol/sdk`.

## Commands

### Build & Run
- `npm run build` — compile TypeScript to `build/` (uses `tsconfig.json`)
- `npm run build:prod` — production build to `dist/` (uses `tsconfig.prod.json`, strips tests/sourcemaps)
- `npm run dev` — run with tsx hot reload
- `npm start` — run compiled `build/main.js`

### Test
- `npm test` — run Vitest (interactive watch mode by default)
- `npm run test:run` — run tests once, no watch
- `npx vitest run src/services/dashboard.test.ts` — run a single test file
- `npm run test:coverage` — coverage report (60% threshold for statements/branches/functions/lines)

### Lint & Format
- `npm run lint` — ESLint (allows up to 200 warnings; errors must be zero)
- `npm run lint:fix` — ESLint with auto-fix
- `npm run format` — Prettier
- `npm run type-check` — `tsc --noEmit`

## Architecture

### Request Flow

```
MCP Client → stdio → Server (main.ts) → ToolRegistry → Tool Handler → Service → GrafanaHttpClient → Grafana API
```

### Key Layers

**Entry point** (`src/main.ts`): Creates `GrafanaHttpClient`, instantiates all services, registers tools by category (skipping categories listed in `GRAFANA_DISABLE_TOOLS`), wires up MCP `ListTools` and `CallTool` handlers, connects stdio transport.

**Tool Registry** (`src/tool-registry.ts`): Maps tool names to `{ definition, handler }`. Tools are registered via `registerTool(definition, handler)` where `definition.inputSchema` is a JSON Schema object produced by `zodToJsonSchema()`.

**Tool files** (`src/tools/*.ts`): Each exports a `registerXxxTools(registry, service)` function. Inside, each tool: (1) parses input with a Zod schema, (2) calls the corresponding service method, (3) formats the result as MCP text content, (4) catches errors via `handleToolError()`. Tool categories: dashboards, datasources, prometheus, loki, alerting, admin, navigation, ramp.

**Service files** (`src/services/*.ts`): Business logic wrapping Grafana REST API calls. Most extend `BaseHttpService` (from `src/core/base-service.ts`) which provides `execute()` (returns `Result<T>`) and `executeOrThrow()` wrappers. Services receive `GrafanaHttpClient` via constructor. Exceptions: `NavigationService` takes `Config` directly (no HTTP calls, just URL generation); `RampService` manages its own per-sensor `GrafanaHttpClient` instances (auto-discovered via SSH tunnel port scanning).

**HTTP Client** (`src/http-client.ts`): Axios-based client with Bearer token auth, optional TLS/mTLS, response caching (1-min TTL), and resilience (retry with exponential backoff + circuit breaker via `src/retry-client.ts`).

**Error handling**: `src/error-handler.ts` provides `handleToolError()` used by all tool handlers. `src/security-utils.ts` categorizes errors (user/system/network/validation) and sanitizes sensitive data from logs.

### Core Infrastructure (`src/core/`)

Contains DI container, base service classes, interfaces, service registry, and a declarative tool system. These are partially adopted — services extend `BaseHttpService`, but the DI container and decorator-based tool registration (`src/core/tool-system.ts`) are not yet used by the main entry point. See `REFACTORING_GUIDE.md` for the planned migration.

### Type System

- `src/types.ts` — Grafana domain types (Dashboard, Panel, AlertRule, etc.), `Config`/`ConfigSchema`, and tool parameter Zod schemas (e.g., `SearchDashboardsSchema`, `QueryPrometheusSchema`)
- `src/common-schemas.ts` — Reusable Zod schemas (branded UIDs, pagination, time ranges) and validation helpers

## Key Conventions

- **ES Modules**: `"type": "module"` — all imports must use `.js` extensions (e.g., `import { config } from './config.js'`)
- **TypeScript strict mode** with all strict flags enabled
- **Zod for all validation**: tool inputs, config parsing, schema generation for MCP via `zodToJsonSchema()`
- **Single quotes**, **semicolons**, **trailing commas** (enforced by ESLint + Prettier)
- **Unused vars**: prefix with `_` (e.g., `_error`) — configured in ESLint
- **Logging goes to stderr** (`console.error`) since stdout is reserved for MCP stdio transport

## Configuration

Environment variables (validated by `ConfigSchema` in `src/types.ts`):
- `GRAFANA_URL` (required) — Grafana instance URL
- `GRAFANA_TOKEN` (required) — service account token, API key, or `user:password`
- `GRAFANA_DEBUG` — enable verbose HTTP logging (default: false)
- `GRAFANA_TIMEOUT` — HTTP timeout in ms (default: 30000)
- `GRAFANA_RATE_LIMIT` — max tool calls per second; 0 or unset to disable (default: disabled)
- `GRAFANA_DISABLE_TOOLS` — comma-separated categories to skip: dashboards, datasources, prometheus, loki, alerting, incident, sift, oncall, admin, navigation, ramp
- `GRAFANA_TLS_*` — optional mTLS config (cert, key, CA files, skip verify)
- `RAMP_PROJECT_PATH` — path to ramp project root for dashboard/baseline files (default: `~/Projects/ramp`)
- `RAMP_SCAN_PORTS` — port range for SSH tunnel auto-discovery (default: `8080-8099`)
