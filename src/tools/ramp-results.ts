import { zodToJsonSchema } from 'zod-to-json-schema';
import { ToolRegistry } from '../tool-registry.js';
import { RampResultsService } from '../services/ramp-results.js';
import { ListTestRunsSchema, GetTestResultSchema, GetTestVitalsSchema, SummarizeRunSchema } from '../ramp-types.js';

export function registerRampResultsTools(registry: ToolRegistry, service: RampResultsService) {
  registry.registerTool(
    {
      name: 'list_test_runs',
      description: 'List RAMP test runs from the results directory. Filter by date or sensor name.',
      inputSchema: zodToJsonSchema(ListTestRunsSchema),
    },
    async (request) => {
      try {
        const params = ListTestRunsSchema.parse(request.params.arguments);
        const runs = service.listTestRuns({ date: params.date, sensor: params.sensor });
        if (runs.length === 0) {
          return { content: [{ type: 'text', text: 'No test runs found.' }] };
        }
        const lines = runs.map((r) =>
          `- **${r.date}/${r.runNumber}** ${r.testId} — ${r.testName} (${r.uuid.slice(0, 8)})`,
        );
        return { content: [{ type: 'text', text: `**${runs.length} test run(s):**\n\n${lines.join('\n')}` }] };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return { content: [{ type: 'text', text: `Error listing runs: ${msg}` }], isError: true };
      }
    },
  );

  registry.registerTool(
    {
      name: 'get_test_result',
      description: 'Read the final result (Gbps, kpps, klogps, status) from a RAMP test run.',
      inputSchema: zodToJsonSchema(GetTestResultSchema),
    },
    async (request) => {
      try {
        const params = GetTestResultSchema.parse(request.params.arguments);
        const result = service.getTestResult(params.path);
        if (!result) {
          return { content: [{ type: 'text', text: 'No test-result.jsonl found at that path.' }] };
        }
        return { content: [{ type: 'text', text: `**Test Result:**\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\`` }] };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return { content: [{ type: 'text', text: `Error reading result: ${msg}` }], isError: true };
      }
    },
  );

  registry.registerTool(
    {
      name: 'get_test_vitals',
      description: 'Read all VITAL metric samples from a RAMP test run (time-series data).',
      inputSchema: zodToJsonSchema(GetTestVitalsSchema),
    },
    async (request) => {
      try {
        const params = GetTestVitalsSchema.parse(request.params.arguments);
        const vitals = service.getTestVitals(params.path);
        if (vitals.length === 0) {
          return { content: [{ type: 'text', text: 'No vital.jsonl found at that path.' }] };
        }
        return { content: [{ type: 'text', text: `**${vitals.length} VITAL samples:**\n\n\`\`\`json\n${JSON.stringify(vitals.slice(0, 5), null, 2)}\n\`\`\`\n\n${vitals.length > 5 ? `... and ${vitals.length - 5} more` : ''}` }] };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return { content: [{ type: 'text', text: `Error reading vitals: ${msg}` }], isError: true };
      }
    },
  );

  registry.registerTool(
    {
      name: 'summarize_run',
      description: 'Get a complete summary of a RAMP test run including metadata, final result, vital count, and error status.',
      inputSchema: zodToJsonSchema(SummarizeRunSchema),
    },
    async (request) => {
      try {
        const params = SummarizeRunSchema.parse(request.params.arguments);
        const summary = service.summarizeRun(params.path);
        const sections = [];
        if (summary.meta) {
          sections.push(`**Metadata:**\n\`\`\`json\n${JSON.stringify(summary.meta, null, 2)}\n\`\`\``);
        }
        if (summary.result) {
          sections.push(`**Final Result:**\n\`\`\`json\n${JSON.stringify(summary.result, null, 2)}\n\`\`\``);
        }
        sections.push(`**Vitals:** ${summary.vitalCount} samples`);
        if (summary.hasErrors) sections.push('**ERRORS present in error.jsonl**');
        sections.push(`\n---\n${summary.summary}`);
        return { content: [{ type: 'text', text: sections.join('\n\n') }] };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return { content: [{ type: 'text', text: `Error summarizing run: ${msg}` }], isError: true };
      }
    },
  );
}
