import fs from 'fs';
import path from 'path';

export interface TestRunInfo {
  date: string;
  runNumber: string;
  testId: string;
  testName: string;
  time: string;
  uuid: string;
  path: string;
}

export interface TestResult {
  [key: string]: any;
}

export class RampResultsService {
  private rampProjectPath: string;

  constructor(options?: { rampProjectPath?: string }) {
    this.rampProjectPath =
      options?.rampProjectPath ??
      process.env.RAMP_PROJECT_PATH ??
      path.join(process.env.HOME ?? '~', 'Projects', 'ramp');
  }

  private parseRunDirectory(
    dirName: string,
  ): { testId: string; testName: string; time: string; uuid: string } | null {
    const parts = dirName.split('--');
    if (parts.length < 4) return null;
    return {
      testId: parts[0],
      testName: parts[1],
      time: parts[2],
      uuid: parts.slice(3).join('--'),
    };
  }

  listTestRuns(options?: { date?: string; sensor?: string }): TestRunInfo[] {
    const resultsDir = path.join(this.rampProjectPath, 'results');
    if (!fs.existsSync(resultsDir)) return [];

    const runs: TestRunInfo[] = [];
    const dates = options?.date
      ? [options.date]
      : fs
          .readdirSync(resultsDir)
          .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
          .sort()
          .reverse();

    for (const date of dates) {
      const dateDir = path.join(resultsDir, date);
      if (!fs.existsSync(dateDir) || !fs.statSync(dateDir).isDirectory())
        continue;

      const counters = fs
        .readdirSync(dateDir)
        .filter((d) => /^\d+$/.test(d))
        .sort();
      for (const counter of counters) {
        const counterDir = path.join(dateDir, counter);
        if (!fs.statSync(counterDir).isDirectory()) continue;

        const testDirs = fs.readdirSync(counterDir);
        for (const testDir of testDirs) {
          const parsed = this.parseRunDirectory(testDir);
          if (!parsed) continue;
          if (
            options?.sensor &&
            !parsed.testId.toLowerCase().includes(options.sensor.toLowerCase())
          )
            continue;

          runs.push({
            date,
            runNumber: counter,
            testId: parsed.testId,
            testName: parsed.testName,
            time: parsed.time,
            uuid: parsed.uuid,
            path: path.join(counterDir, testDir),
          });
        }
      }
    }

    return runs;
  }

  getTestResult(runPath: string): TestResult | null {
    const filePath = path.join(runPath, 'test-result.jsonl');
    if (!fs.existsSync(filePath)) return null;
    const lines = fs
      .readFileSync(filePath, 'utf-8')
      .trim()
      .split('\n')
      .filter(Boolean);
    if (lines.length === 0) return null;
    return JSON.parse(lines[lines.length - 1]); // last line is the final result
  }

  getTestVitals(runPath: string): TestResult[] {
    const filePath = path.join(runPath, 'vital.jsonl');
    if (!fs.existsSync(filePath)) return [];
    return fs
      .readFileSync(filePath, 'utf-8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  getTestMeta(runPath: string): TestResult | null {
    const filePath = path.join(runPath, 'meta.jsonl');
    if (!fs.existsSync(filePath)) return null;
    const lines = fs
      .readFileSync(filePath, 'utf-8')
      .trim()
      .split('\n')
      .filter(Boolean);
    if (lines.length === 0) return null;
    return JSON.parse(lines[0]);
  }

  summarizeRun(runPath: string): {
    meta: TestResult | null;
    result: TestResult | null;
    vitalCount: number;
    hasErrors: boolean;
    summary: string;
  } {
    const meta = this.getTestMeta(runPath);
    const result = this.getTestResult(runPath);
    const vitals = this.getTestVitals(runPath);
    const errorPath = path.join(runPath, 'error.jsonl');
    const hasErrors = fs.existsSync(errorPath);

    const parts: string[] = [];
    if (meta) {
      parts.push(`Sensor: ${meta.sensor_uid ?? 'unknown'}, Version: ${meta.version ?? 'unknown'}`);
    }
    if (result) {
      parts.push(`Result: ${result.gbps?.toFixed(1) ?? '?'} Gbps, ${result.kpps?.toFixed(0) ?? '?'} kpps, ${result.klogps?.toFixed(1) ?? '?'} klogps`);
      parts.push(`Status: ${result.status ?? 'unknown'}`);
    }
    parts.push(`Vitals: ${vitals.length} samples`);
    if (hasErrors) parts.push('ERRORS PRESENT');

    return {
      meta,
      result,
      vitalCount: vitals.length,
      hasErrors,
      summary: parts.join(' | '),
    };
  }
}
