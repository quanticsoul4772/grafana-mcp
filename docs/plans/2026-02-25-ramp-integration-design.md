# RAMP Integration Design

Add RAMP-specific tools to the Grafana MCP server for sensor performance testing workflows.

## Context

The RAMP project (Rate Adaptive Measurement Platform) tests Corelight network sensors by finding their max rated performance via binary search. Sensors run Prometheus and Grafana internally, accessed via SSH tunnels to localhost ports. The existing Grafana MCP server provides generic tools; this design adds RAMP-aware tools that understand sensor metrics, baselines, and the performance testing workflow.

## Architecture

### Auto-Discovery

On startup and via `discover_sensors` tool, scan TCP ports 8080-8099 for SSH-tunneled Grafana instances:

1. `lsof` to find SSH listeners on the port range
2. Probe each with `GET /grafana/api/health`
3. Identify sensor hostname via PromQL: `max by (nodename) (node_uname_info)`
4. Store sensor map: `{ port, hostname, grafanaUrl, prometheusUid: "prometheus" }`

### Multi-Sensor HTTP Clients

`RampService` maintains a map of `GrafanaHttpClient` instances — one per discovered sensor, each configured with the sensor's Grafana URL and basic auth (`RAMP_SENSOR_TOKEN env var`). Generic tools continue using the single default client from `GRAFANA_URL`.

### File Structure

```
src/
├── services/ramp.ts     # RampService: discovery, baselines, metrics, verdicts
├── tools/ramp.ts        # registerRampTools(): 7 new tools
├── ramp-types.ts        # SensorInfo, Baseline, Verdict types
```

## New Tools (category: `ramp`)

### Sensor Discovery
- **`discover_sensors`** — Scan ports 8080-8099 for active sensor tunnels. Returns connected sensors with hostname, port, Grafana version, Prometheus status.

### Live Metrics
- **`sensor_status`** — One-call snapshot: Gbps, kpps, klogps, drop rate, max worker CPU, buffer utilization. Uses 5-min rate smoothing. Optional `sensor` param.
- **`query_sensor_metric`** — Arbitrary PromQL against a sensor's Prometheus. Auto-resolves datasource UID and target.

### Dashboard Management
- **`deploy_ramp_dashboard`** — Deploy RAMP Performance Analysis dashboard to a sensor's Grafana. Optional `compare` (build name) and `profile` params to patch with baseline comparison. Reads files from `RAMP_PROJECT_PATH`.
- **`list_baselines`** — List available builds/profiles from baselines.json for a given sensor type.

### Analysis
- **`sensor_performance_verdict`** — Query all key metrics, compare against a specified baseline build, return structured verdict with delta percentages and plain-English assessment. Thresholds: <5% PASS, 5-10% MINOR REGRESSION, >10% MAJOR REGRESSION. Any drops = FAIL.

### Annotations
- **`annotate_test`** — Add Grafana annotation for test events (start/end/result/rate change). Tags with `ramp-result`.

## Configuration

New environment variables:
- `RAMP_PROJECT_PATH` — Path to ramp project root (default: `~/Projects/ramp`). Locates `dashboards/ramp-performance-analysis.json` and `dashboards/baselines.json`.
- `RAMP_SCAN_PORTS` — Port range for tunnel discovery (default: `8080-8099`).

Sensor Grafana auth: hardcoded `RAMP_SENSOR_TOKEN env var` basic auth (matches `grafana-tunnel.sh` password reset).

## Key PromQL Queries (sensor_status)

| Metric | Query |
|--------|-------|
| Gbps | `sum(rate(corelight_monitor_port_bytes[5m])) * 8 / 1e9` |
| kpps | `sum(rate(corelight_monitor_port_packets[5m])) / 1e3` |
| klogps | `sum(rate(zeek_log_writer_writes_total[5m])) / 1e3` |
| NIC drops/s | `sum(rate(napatech_stat_port_ext_drop_overflow_packets[5m]))` |
| Zeek drops/s | `sum(rate(corelight_monitor_pkts_dropped_total[5m]))` |
| Max worker CPU | `max(sum by (groupname)(rate(namedprocess_namegroup_cpu_seconds_total{groupname=~"zeek-worker-.*"}[5m])))` |
| Buffer util % | `sum(napatech_stream_host_buffer_enqueued_bytes - napatech_stream_host_buffer_dequeued_bytes) / clamp_min(sum(napatech_stream_host_buffer_total_bytes), 1) * 100` |
| System memory % | `node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes * 100` |

## Verdict Logic

```
if any drops detected:
  verdict = FAIL
elif all metrics within 5% of baseline:
  verdict = PASS
elif any metric 5-10% below baseline:
  verdict = MINOR REGRESSION (P2)
elif any metric >10% below baseline:
  verdict = MAJOR REGRESSION (P1)
```

Matches the dashboard's color thresholds (green/yellow/red) and QE bug severity classification.

## Dashboard Patching (deploy_ramp_dashboard --compare)

Port the `scripts/patch-dashboard.py` logic to TypeScript:
1. Load baselines.json, filter by sensor type and build
2. Generate PromQL `vector()` lookup table for baseline values
3. Inject comparison row (info panel, 3 stat panels, timeseries, verdict) at top of dashboard
4. Shift existing panels down by 15 grid units
5. Add `compare_build` and `compare_profile` template variables
6. POST patched dashboard with `overwrite: true`

## Error Messages

- Tunnel down: "Sensor ap1100 not reachable on port 8084. Is the SSH tunnel active?"
- No sensors: "No sensor tunnels found on ports 8080-8099. Set up a tunnel with: ./scripts/grafana-tunnel.sh <sensor-ip>"
- Query fail: "Prometheus query failed on ap1100: <error>. Check if the sensor is running a test."
