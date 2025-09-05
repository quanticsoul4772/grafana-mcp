# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Grafana MCP (Model Context Protocol) Server that provides AI-powered integration with Grafana instances. It exposes Grafana's functionality through MCP tools for dashboard management, data source operations, Prometheus/Loki querying, alerting, and administrative tasks.

## Development Commands

### Build & Development
- `npm run build` - Compile TypeScript to JavaScript in `build/` directory
- `npm run dev` - Run development server with hot reload using tsx
- `npm run start` - Run compiled server from `build/main.js`
- `npm run clean` - Remove build artifacts

### Testing
- `npm test` or `npm run test` - Run tests with Vitest
- `npm run test:coverage` - Run tests with coverage report
- `npm run test:watch` - Run tests in watch mode
- `npm run test:run` - Run tests once (non-watch mode)

### Code Quality
- `npm run lint` - Run ESLint with zero warnings policy
- `npm run lint:fix` - Run ESLint with auto-fix
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting
- `npm run type-check` - Run TypeScript type checking without emitting

### Other
- `npm run prepare` - Runs build (used for npm lifecycle)

## Architecture

### Core Components

**Entry Point**: `src/main.ts` - Initializes the MCP server, creates services, registers tools, and handles MCP protocol communication via stdio transport.

**Configuration**: `src/config.ts` + `src/types.ts` - Environment-based configuration with Zod validation. Supports Grafana URL, authentication token, debug mode, timeouts, TLS settings, and selective tool category disabling.

**HTTP Client**: `src/http-client.ts` - Centralized HTTP client with Grafana API authentication, error handling, and optional TLS configuration.

**Tool Registry**: `src/tool-registry.ts` - Central registry that manages MCP tool definitions and their handlers. Maps tool names to schemas and execution handlers.

### Service Layer (`src/services/`)
Business logic services that wrap Grafana API calls:
- `dashboard.ts` - Dashboard CRUD operations and search
- `datasource.ts` - Data source management and metadata
- `prometheus.ts` - Prometheus metric queries and metadata  
- `loki.ts` - Loki log queries and label operations
- `alerting.ts` - Alert rule and notification management
- `admin.ts` - User, team, and organization management
- `navigation.ts` - Deep link generation for Grafana URLs

### Tool Layer (`src/tools/`)
MCP tool definitions that expose services through the protocol:
- Each file corresponds to a service and registers tools with the registry
- Tools validate input parameters using Zod schemas
- Tool categories can be selectively disabled via configuration

### Type System (`src/types.ts`)
Comprehensive TypeScript definitions for:
- Grafana API response types (dashboards, panels, datasources, etc.)
- Configuration schemas with Zod validation
- MCP tool parameter schemas
- Domain-specific types for Prometheus, Loki, alerting, incidents, etc.

## Configuration

The server is configured via environment variables:
- `GRAFANA_URL` - Grafana instance URL (required)
- `GRAFANA_TOKEN` - API token for authentication (required)
- `GRAFANA_DEBUG` - Enable debug logging (default: false)
- `GRAFANA_TIMEOUT` - HTTP request timeout in ms (default: 30000)
- `GRAFANA_DISABLE_TOOLS` - Comma-separated tool categories to disable
- TLS options: `GRAFANA_TLS_CERT_FILE`, `GRAFANA_TLS_KEY_FILE`, `GRAFANA_TLS_CA_FILE`, `GRAFANA_TLS_SKIP_VERIFY`

Tool categories that can be disabled: dashboards, datasources, prometheus, loki, alerting, incident, sift, oncall, admin, navigation

## Development Notes

- Uses ES modules (`"type": "module"` in package.json)
- TypeScript with strict mode enabled and comprehensive type checking
- Modern Node.js targeting (ES2022, Node 18+)
- Service-oriented architecture with clear separation between HTTP operations, business logic, and MCP tool exposure
- All services depend on a shared HTTP client for consistent error handling and authentication
- Zod schemas provide runtime validation for both configuration and tool parameters
- Tool registration is modular and conditional based on configuration