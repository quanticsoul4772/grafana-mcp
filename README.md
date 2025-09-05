# Grafana MCP Server

A Model Context Protocol (MCP) server that provides AI-powered integration with Grafana instances. This server exposes Grafana's comprehensive functionality through standardized MCP tools, enabling programmatic interaction with dashboards, data sources, metrics, logs, alerting, and administrative functions.

## Features

- **52 MCP Tools** across 8 categories for complete Grafana integration
- **Dashboard Management** - Search, create, update, and analyze dashboards
- **Prometheus Integration** - Execute PromQL queries and explore metrics
- **Loki Integration** - Search logs with LogQL and manage log streams
- **Alerting & Incident Response** - Manage alert rules and notifications
- **Administrative Tools** - User, team, and organization management
- **Security-First Design** - Automatic credential sanitization and error categorization
- **TypeScript Excellence** - Full type safety with strict mode enabled

## Installation

### Prerequisites

- Node.js 18+ with ES modules support
- TypeScript 4.9+
- Access to a Grafana instance (v8.0+)

### Setup

```bash
# Clone the repository
git clone https://github.com/your-org/grafana-mcp
cd grafana-mcp

# Install dependencies
npm install

# Build the project
npm run build
```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file or set these environment variables:

```bash
# Required Configuration
GRAFANA_URL=https://your-grafana-instance.com
GRAFANA_TOKEN=your-service-account-token-or-api-key

# Optional Configuration
GRAFANA_DEBUG=false                    # Enable debug logging
GRAFANA_TIMEOUT=30000                  # HTTP timeout in milliseconds
GRAFANA_DISABLE_TOOLS=admin,alerting   # Disable specific tool categories

# TLS Configuration (Optional)
GRAFANA_TLS_CERT_FILE=/path/to/client.crt
GRAFANA_TLS_KEY_FILE=/path/to/client.key
GRAFANA_TLS_CA_FILE=/path/to/ca.crt
GRAFANA_TLS_SKIP_VERIFY=false          # Skip certificate verification (insecure)
```

### Authentication

The server supports multiple authentication methods:

1. **Service Account Tokens** (Recommended)
   ```bash
   GRAFANA_TOKEN=glsa_xxxxxxxxxxxxxxxxxxxx
   ```

2. **API Keys** (Legacy)
   ```bash
   GRAFANA_TOKEN=eyJrIjoi...
   ```

3. **Basic Authentication**
   ```bash
   GRAFANA_TOKEN=admin:password
   ```

## 🏃‍♂️ Usage

### Development

```bash
# Start development server with hot reload
npm run dev

# Run tests
npm test

# Lint and format code
npm run lint
npm run format
```

### Production

```bash
# Build and start production server
npm run build
npm start
```

### MCP Client Integration

Configure your MCP client (e.g., Claude Desktop) to use this server:

```json
{
  "mcpServers": {
    "grafana": {
      "command": "node",
      "args": ["/path/to/grafana-mcp/build/main.js"],
      "env": {
        "GRAFANA_URL": "https://your-grafana.com",
        "GRAFANA_TOKEN": "your-service-account-token"
      }
    }
  }
}
```

## 🛠 Available Tools

### Dashboard Tools (8 tools)
- `search_dashboards` - Find dashboards by title, tags, or metadata
- `get_dashboard_by_uid` - Retrieve complete dashboard details
- `get_dashboard_panel_queries` - Extract queries from all panels
- `update_dashboard` - Create or update dashboards
- `get_dashboard_versions` - View dashboard version history
- `restore_dashboard_version` - Restore to a specific version
- `delete_dashboard` - Remove dashboards

### Prometheus Tools (6 tools)
- `query_prometheus` - Execute PromQL queries
- `get_prometheus_metadata` - List available metrics
- `get_prometheus_labels` - Get label names
- `get_prometheus_label_values` - Get values for specific labels
- `get_prometheus_series` - Find time series
- `build_prometheus_query` - Interactive query builder

### Loki Tools (6 tools)
- `query_loki` - Execute LogQL queries
- `get_loki_labels` - Get log stream labels
- `get_loki_label_values` - Get label values
- `get_loki_series` - Find log series
- `build_logql_query` - LogQL query builder
- `get_loki_stats` - Ingestion statistics

### Data Source Tools (4 tools)
- `list_datasources` - List all configured data sources
- `get_datasource_by_uid` - Get specific data source details
- `test_datasource` - Test data source connectivity
- `query_datasource` - Execute queries against any data source

### Admin Tools (8 tools)
- `list_users` - List organization users
- `get_current_user` - Get current user info
- `list_teams` - List teams
- `get_team_by_uid` - Get team details
- `list_folders` - List dashboard folders
- `get_folder_by_uid` - Get folder details
- `list_api_keys` - List API keys
- `list_service_accounts` - List service accounts

### Alerting Tools (8 tools)
- `list_alert_rules` - List all alert rules
- `get_alert_rule_by_uid` - Get specific alert rule
- `create_alert_rule` - Create new alert rules
- `update_alert_rule` - Update existing rules
- `delete_alert_rule` - Delete alert rules
- `list_notification_channels` - List notification channels
- `test_notification_channel` - Test notification delivery
- `get_alert_history` - Query alert history

## 📋 Examples

### Dashboard Search
```typescript
// Find all dashboards tagged "monitoring" in the "Production" folder
{
  "tool": "search_dashboards",
  "arguments": {
    "query": "error",
    "tags": ["monitoring"],
    "folder": "Production",
    "limit": 10
  }
}
```

### Prometheus Query
```typescript
// Query HTTP request rate over last 5 minutes
{
  "tool": "query_prometheus",
  "arguments": {
    "query": "rate(http_requests_total[5m])",
    "datasourceUid": "prometheus-uid",
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-01T01:00:00Z"
  }
}
```

### Loki Log Search
```typescript
// Search for error logs in nginx service
{
  "tool": "query_loki",
  "arguments": {
    "query": "{job=\"nginx\"} |= \"error\" | rate([5m])",
    "datasourceUid": "loki-uid",
    "limit": 100,
    "direction": "backward"
  }
}
```

## 🏗 Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   MCP Client    │    │  MCP Protocol   │    │ Grafana Instance│
│   (Claude AI)   │◄──►│     Server      │◄──►│    (REST API)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Core Components

- **MCP Server** (`src/main.ts`) - Protocol handler and tool registry
- **HTTP Client** (`src/http-client.ts`) - Grafana API communication
- **Services** (`src/services/`) - Business logic for each Grafana area
- **Tools** (`src/tools/`) - MCP tool definitions and handlers
- **Security** (`src/security-utils.ts`) - Credential sanitization and error handling

### Security Features

- **Automatic Data Sanitization** - All logs and errors sanitize sensitive data
- **Error Categorization** - User-safe vs internal error messaging
- **TLS Support** - Full certificate validation and client certificates
- **Minimal Privilege** - Tools operate with least required permissions

## 🐳 Deployment

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY build/ ./build/
EXPOSE 3000
CMD ["node", "build/main.js"]
```

### Docker Compose

```yaml
version: '3.8'
services:
  grafana-mcp:
    build: .
    environment:
      - GRAFANA_URL=https://your-grafana.com
      - GRAFANA_TOKEN=${GRAFANA_TOKEN}
      - GRAFANA_DEBUG=false
    volumes:
      - ./logs:/app/logs
```

## 🔧 Development

### Project Structure

```
grafana-mcp/
├── src/
│   ├── main.ts              # Entry point and MCP server setup
│   ├── config.ts            # Configuration management
│   ├── http-client.ts       # Grafana API client
│   ├── security-utils.ts    # Security and sanitization
│   ├── error-handler.ts     # Centralized error handling
│   ├── tool-registry.ts     # MCP tool registration
│   ├── types.ts             # TypeScript definitions
│   ├── services/            # Business logic services
│   │   ├── dashboard.ts     # Dashboard operations
│   │   ├── prometheus.ts    # Prometheus queries
│   │   ├── loki.ts          # Loki log queries
│   │   ├── alerting.ts      # Alert management
│   │   └── admin.ts         # Administrative functions
│   └── tools/               # MCP tool definitions
│       ├── dashboard.ts     # Dashboard tools
│       ├── prometheus.ts    # Prometheus tools
│       ├── loki.ts          # Loki tools
│       └── admin.ts         # Admin tools
├── build/                   # Compiled JavaScript output
├── package.json
├── tsconfig.json
├── eslint.config.js
└── README.md
```

### NPM Scripts

```json
{
  "scripts": {
    "build": "tsc",                    // Compile TypeScript
    "dev": "tsx src/main.ts",          // Development server
    "start": "node build/main.js",     // Production server  
    "test": "vitest",                  // Run tests
    "test:coverage": "vitest --coverage", // Coverage report
    "lint": "eslint src/",             // ESLint checking
    "lint:fix": "eslint src/ --fix",   // Auto-fix issues
    "format": "prettier --write src/", // Format code
    "type-check": "tsc --noEmit"       // Type checking only
  }
}
```

### Code Standards

- **TypeScript Strict Mode** - Full type safety enforcement
- **ESLint Rules** - Zero-error policy with comprehensive rules
- **Prettier Formatting** - Consistent code style
- **Zod Validation** - Runtime type checking for all inputs
- **Security First** - Automatic credential sanitization in all outputs

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- dashboard.test.ts
```

## 📊 Monitoring

### Debug Mode

Enable comprehensive logging for troubleshooting:

```bash
GRAFANA_DEBUG=true npm start
```

Debug output includes:
- HTTP request/response details (sanitized)
- Tool execution traces  
- Error categorization details
- Performance metrics

### Health Checks

The server provides health information through:
- Process exit codes
- Error logs with categorization
- Connection status monitoring

## 🤝 Contributing

We welcome contributions! Please see our contributing guidelines:

1. **Fork and Clone** - Create your feature branch
2. **Code Standards** - Follow TypeScript strict mode and ESLint rules
3. **Testing** - Add tests for new functionality
4. **Security** - Include security impact assessment
5. **Documentation** - Update docs for new features

### Pull Request Checklist

- [ ] All tests pass (`npm test`)
- [ ] No ESLint errors (`npm run lint`)
- [ ] Code formatted (`npm run format`)
- [ ] TypeScript compiles (`npm run type-check`)
- [ ] Documentation updated
- [ ] Security considerations addressed

## 📝 License

[License information to be added]

## 🆘 Support

### Common Issues

**Connection Errors**
```
Error: ECONNREFUSED - Unable to connect to Grafana
```
- Verify `GRAFANA_URL` is correct and accessible
- Check network connectivity and firewall rules

**Authentication Failures**  
```
HTTP 401: Authentication failed
```
- Verify `GRAFANA_TOKEN` is valid and has required permissions
- Check token expiration and regenerate if needed

**Tool Registration Errors**
```
Schema validation failed  
```
- Ensure all custom tools use proper Zod schema validation
- Check that `zodToJsonSchema()` wrapper is used correctly

### Getting Help

- Check the [troubleshooting guide](docs/troubleshooting.md)
- Review [API documentation](docs/api.md)
- Open an issue for bugs or feature requests

---

**Built with ❤️ using TypeScript, Zod, and the Model Context Protocol**