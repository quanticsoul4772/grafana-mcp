import { zodToJsonSchema } from 'zod-to-json-schema';
import { ToolRegistry } from '../tool-registry.js';
import { RampControlService } from '../services/ramp-control.js';
import {
  IxiaSetRateSchema,
  IxiaStopSchema,
  IxiaStatusSchema,
  StartRampTestSchema,
  StopRampTestSchema,
  TestStatusSchema,
  FleetRegressionSweepSchema,
} from '../ramp-types.js';

export function registerRampControlTools(
  registry: ToolRegistry,
  service: RampControlService,
) {
  // 1. ixia_set_rate
  registry.registerTool(
    {
      name: 'ixia_set_rate',
      description:
        'Set the Ixia traffic replayer to a specific rate in Gbps. ' +
        'This stops any running test and restarts at the new rate.',
      inputSchema: zodToJsonSchema(IxiaSetRateSchema),
    },
    async (request) => {
      try {
        const params = IxiaSetRateSchema.parse(
          request.params.arguments,
        );
        const result = service.ixiaSetRate(
          params.replayer,
          params.rate,
        );
        const text = [
          '**Ixia Rate Set**',
          '',
          `Replayer: ${params.replayer}`,
          `Rate: ${params.rate} Gbps`,
          '',
          '```',
          result,
          '```',
        ].join('\n');
        return { content: [{ type: 'text', text }] };
      } catch (error) {
        const msg =
          error instanceof Error
            ? error.message
            : 'Unknown error';
        return {
          content: [
            {
              type: 'text',
              text: `Error setting Ixia rate: ${msg}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // 2. ixia_stop
  registry.registerTool(
    {
      name: 'ixia_stop',
      description:
        'Stop the Ixia traffic replayer. Halts all traffic generation on the specified replayer.',
      inputSchema: zodToJsonSchema(IxiaStopSchema),
    },
    async (request) => {
      try {
        const params = IxiaStopSchema.parse(
          request.params.arguments,
        );
        const result = service.ixiaStop(params.replayer);
        const text = [
          '**Ixia Stopped**',
          '',
          `Replayer: ${params.replayer}`,
          '',
          '```',
          result,
          '```',
        ].join('\n');
        return { content: [{ type: 'text', text }] };
      } catch (error) {
        const msg =
          error instanceof Error
            ? error.message
            : 'Unknown error';
        return {
          content: [
            {
              type: 'text',
              text: `Error stopping Ixia: ${msg}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // 3. ixia_status
  registry.registerTool(
    {
      name: 'ixia_status',
      description:
        'Check the current status of an Ixia traffic replayer (running/stopped, rate, test model).',
      inputSchema: zodToJsonSchema(IxiaStatusSchema),
    },
    async (request) => {
      try {
        const params = IxiaStatusSchema.parse(
          request.params.arguments,
        );
        const status = service.ixiaStatus(params.replayer);
        const text = [
          '**Ixia Status**',
          '',
          `Replayer: ${params.replayer}`,
          `Running: ${status.running ? 'Yes' : 'No'}`,
          '',
          '```',
          status.raw,
          '```',
        ].join('\n');
        return { content: [{ type: 'text', text }] };
      } catch (error) {
        const msg =
          error instanceof Error
            ? error.message
            : 'Unknown error';
        return {
          content: [
            {
              type: 'text',
              text: `Error checking Ixia status: ${msg}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // 4. start_ramp_test
  registry.registerTool(
    {
      name: 'start_ramp_test',
      description:
        'Start a RAMP performance test on the RAMP server. ' +
        'Set confirm=true to actually start; default is a dry run that shows what would run.',
      inputSchema: zodToJsonSchema(StartRampTestSchema),
    },
    async (request) => {
      try {
        const params = StartRampTestSchema.parse(
          request.params.arguments,
        );
        const result = service.startRampTest(
          {
            appliance: params.appliance,
            replayer: params.replayer,
            tests: params.tests,
            duration: params.duration,
            controlSelector: params.controlSelector,
            jsonServer: params.jsonServer,
          },
          params.confirm,
        );
        const text = [
          params.confirm
            ? '**RAMP Test Started**'
            : '**RAMP Test Dry Run**',
          '',
          '```',
          result,
          '```',
        ].join('\n');
        return { content: [{ type: 'text', text }] };
      } catch (error) {
        const msg =
          error instanceof Error
            ? error.message
            : 'Unknown error';
        return {
          content: [
            {
              type: 'text',
              text: `Error starting RAMP test: ${msg}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // 5. stop_ramp_test
  registry.registerTool(
    {
      name: 'stop_ramp_test',
      description:
        'Stop a running RAMP test by killing its tmux session on the RAMP server.',
      inputSchema: zodToJsonSchema(StopRampTestSchema),
    },
    async (request) => {
      try {
        const params = StopRampTestSchema.parse(
          request.params.arguments,
        );
        const result = service.stopRampTest(params.session);
        const text = [
          '**RAMP Test Stopped**',
          '',
          result,
        ].join('\n');
        return { content: [{ type: 'text', text }] };
      } catch (error) {
        const msg =
          error instanceof Error
            ? error.message
            : 'Unknown error';
        return {
          content: [
            {
              type: 'text',
              text: `Error stopping RAMP test: ${msg}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // 6. test_status
  registry.registerTool(
    {
      name: 'test_status',
      description:
        'Check the status of RAMP tests running on the RAMP server (lists active tmux sessions).',
      inputSchema: zodToJsonSchema(TestStatusSchema),
    },
    async (_request) => {
      try {
        const status = service.getTestStatus();
        let text: string;
        if (!status.running) {
          text = '**No RAMP tests currently running.**';
        } else {
          const sessionLines = status.sessions.map(
            (s) => `| ${s.name} | ${s.created} |`,
          );
          text = [
            `**${status.sessions.length} RAMP test(s) running:**`,
            '',
            '| Session | Created |',
            '|---------|---------|',
            ...sessionLines,
          ].join('\n');
        }
        return { content: [{ type: 'text', text }] };
      } catch (error) {
        const msg =
          error instanceof Error
            ? error.message
            : 'Unknown error';
        return {
          content: [
            {
              type: 'text',
              text: `Error checking test status: ${msg}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // 7. fleet_regression_sweep
  registry.registerTool(
    {
      name: 'fleet_regression_sweep',
      description:
        'Run a regression sweep across all discovered sensors against a specific build. ' +
        'Checks each sensor against all its baseline profiles and optionally fingerprints regressions.',
      inputSchema: zodToJsonSchema(FleetRegressionSweepSchema),
    },
    async (request) => {
      try {
        const params = FleetRegressionSweepSchema.parse(
          request.params.arguments,
        );
        const report = await service.fleetRegressionSweep(
          params.build,
        );
        const sensorLines = report.sensors.map(
          (s) =>
            `| ${s.hostname} | ${s.type} | ${s.verdict} | ${s.error ?? '' } |`,
        );
        const text = [
          '**Fleet Regression Sweep**',
          '',
          report.summary,
          '',
          '| Hostname | Type | Verdict | Notes |',
          '|----------|------|---------|-------|',
          ...sensorLines,
        ].join('\n');
        return { content: [{ type: 'text', text }] };
      } catch (error) {
        const msg =
          error instanceof Error
            ? error.message
            : 'Unknown error';
        return {
          content: [
            {
              type: 'text',
              text: `Error running fleet sweep: ${msg}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
