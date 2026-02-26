import { zodToJsonSchema } from 'zod-to-json-schema';
import { ToolRegistry } from '../tool-registry.js';
import { RampForecastService } from '../services/ramp-forecast.js';
import {
  ForecastMaxRateSchema,
  PreflightRiskSchema,
  PredictFirmwareImpactSchema,
} from '../ramp-types.js';

export function registerRampForecastTools(
  registry: ToolRegistry,
  service: RampForecastService,
) {
  // 1. forecast_max_rate
  registry.registerTool(
    {
      name: 'forecast_max_rate',
      description:
        'Extrapolate the maximum sustainable traffic rate for a sensor based on current resource utilization. ' +
        'Shows headroom per subsystem (Zeek CPU, buffer, memory) and identifies the limiting factor.',
      inputSchema: zodToJsonSchema(ForecastMaxRateSchema),
    },
    async (request) => {
      try {
        const params = ForecastMaxRateSchema.parse(
          request.params.arguments,
        );
        const forecast = await service.forecastMaxRate(params.sensor);
        const headroomLines = Object.entries(forecast.headroom).map(
          ([name, h]) =>
            `| ${name} | ${(h.current * 100).toFixed(1)}% | ${(h.ceiling * 100).toFixed(1)}% | ${h.maxRate.toFixed(1)} Gbps |`,
        );
        const text = [
          '**Capacity Forecast**',
          '',
          `Current rate: ${forecast.currentRate.toFixed(1)} Gbps`,
          `Predicted max: ${forecast.predictedMax} Gbps`,
          `Limiting factor: ${forecast.limitingFactor}`,
          `Confidence: ${forecast.confidence}`,
          '',
          '**Headroom by subsystem:**',
          '| Subsystem | Current | Ceiling | Max Rate |',
          '|-----------|---------|---------|----------|',
          ...headroomLines,
          '',
          `*${forecast.caveat}*`,
        ].join('\n');
        return { content: [{ type: 'text', text }] };
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text',
              text: `Error forecasting max rate: ${msg}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // 2. preflight_risk
  registry.registerTool(
    {
      name: 'preflight_risk',
      description:
        'Assess whether a sensor is ready for a RAMP test by checking for existing drops, ' +
        'memory pressure, CPU baseline, and buffer residue. Returns a risk score and go/no-go recommendation.',
      inputSchema: zodToJsonSchema(PreflightRiskSchema),
    },
    async (request) => {
      try {
        const params = PreflightRiskSchema.parse(
          request.params.arguments,
        );
        const risk = await service.preflightRisk({
          sensor: params.sensor,
          profile: params.profile,
        });
        const statusIcon = (s: string) =>
          s === 'pass' ? '[PASS]' : s === 'warning' ? '[WARN]' : '[FAIL]';
        const checkLines = risk.checks.map(
          (c) => `| ${statusIcon(c.status)} | ${c.name} | ${c.detail} |`,
        );
        const text = [
          '**Preflight Risk Assessment**',
          '',
          `Sensor: ${risk.sensor}`,
          `Profile: ${risk.profile}`,
          `Risk level: ${risk.riskLevel.toUpperCase()}`,
          `Score: ${risk.score}`,
          '',
          '**Checks:**',
          '| Status | Check | Detail |',
          '|--------|-------|--------|',
          ...checkLines,
          '',
          `**Recommendation:** ${risk.recommendation}`,
        ].join('\n');
        return { content: [{ type: 'text', text }] };
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text',
              text: `Error assessing preflight risk: ${msg}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // 3. predict_firmware_impact
  registry.registerTool(
    {
      name: 'predict_firmware_impact',
      description:
        'Analyze historical baseline data to predict how the next firmware build will affect performance. ' +
        'Shows trend direction (improving/stable/declining) per sensor type and profile, with fleet-wide risk.',
      inputSchema: zodToJsonSchema(PredictFirmwareImpactSchema),
    },
    async (request) => {
      try {
        const params = PredictFirmwareImpactSchema.parse(
          request.params.arguments,
        );
        const impact = service.predictFirmwareImpact(
          params.sensorType,
        );
        const trendArrow = (t: string) =>
          t === 'improving' ? '^' : t === 'declining' ? 'v' : '-';
        const predictionLines = impact.predictions.map(
          (p) =>
            `| ${p.sensorType} | ${p.profile} | ${trendArrow(p.trend)} ${p.trend} | ${p.predictedDeltaPct >= 0 ? '+' : ''}${p.predictedDeltaPct}% | ${p.confidence} | ${p.recentHistory.map((v) => v.toFixed(1)).join(', ')} |`,
        );
        const text = [
          '**Firmware Impact Prediction**',
          '',
          `Fleet risk: ${impact.fleetRisk.toUpperCase()}`,
          impact.summary,
          '',
          '| Sensor | Profile | Trend | Delta | Confidence | Recent Gbps |',
          '|--------|---------|-------|-------|------------|-------------|',
          ...predictionLines,
        ].join('\n');
        return { content: [{ type: 'text', text }] };
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text',
              text: `Error predicting firmware impact: ${msg}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
