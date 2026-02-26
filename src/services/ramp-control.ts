import { execOnRampServer } from '../utils/ssh.js';
import { RampService } from './ramp.js';
import type { RampAnalysisService } from './ramp-analysis.js';

export interface IxiaStatus {
  running: boolean;
  rate?: number;
  testModel?: string;
  raw: string;
}

export interface TestStatus {
  running: boolean;
  sessions: Array<{ name: string; created: string }>;
}

export interface RampTestConfig {
  appliance: string;
  replayer: string;
  tests: string;
  duration: number;
  controlSelector: string;
  jsonServer: string;
}

export interface FleetReport {
  sensors: Array<{
    hostname: string;
    type: string;
    verdict: string;
    fingerprint?: string;
    error?: string;
  }>;
  summary: string;
}

const RAMP_DIR = '/home/broala/ankitv/new_development/ramp';

export class RampControlService {
  constructor(
    private rampService: RampService,
    private analysisService?: RampAnalysisService,
  ) {}

  ixiaSetRate(replayer: string, rateGbps: number): string {
    const cmd =
      `cd ${RAMP_DIR} && source env.sh && python scripts/ixia-rate.py --replayer ${replayer} --rate ${rateGbps}`;
    return execOnRampServer(cmd);
  }

  ixiaStop(replayer: string): string {
    const cmd =
      `cd ${RAMP_DIR} && source env.sh && python scripts/ixia-rate.py --replayer ${replayer} --stop`;
    return execOnRampServer(cmd);
  }

  ixiaStatus(replayer: string): IxiaStatus {
    const cmd =
      `cd ${RAMP_DIR} && source env.sh && python scripts/ixia-rate.py --replayer ${replayer} --status`;
    const raw = execOnRampServer(cmd);
    const lower = raw.toLowerCase();
    const running =
      lower.includes('running') && !lower.includes('no test running') && !lower.includes('not running');
    return { running, raw };
  }

  startRampTest(config: RampTestConfig, confirm: boolean): string {
    if (!confirm) {
      return (
        `DRY RUN: Would start RAMP test:\n` +
        `  Appliance: ${config.appliance}\n` +
        `  Replayer: ${config.replayer}\n` +
        `  Tests: ${config.tests}\n` +
        `  Duration: ${config.duration}s\n` +
        `  Control: ${config.controlSelector}\n` +
        `  JSON Server: ${config.jsonServer}`
      );
    }

    const sessionName = `rss-ramp-test-${Date.now()}`;
    const runCmd =
      `cd ${RAMP_DIR} && source env.sh && PYTHONPATH=. python scripts/ramp-run.py` +
      ` --appliance ${config.appliance}` +
      ` --replayer ${config.replayer}` +
      ` --tests ${config.tests}` +
      ` --duration ${config.duration}` +
      ` --control-selector ${config.controlSelector}` +
      ` --json-server ${config.jsonServer}`;

    execOnRampServer(
      `tmux new-session -d -s ${sessionName} -c ${RAMP_DIR}`,
    );
    execOnRampServer(
      `tmux send-keys -t ${sessionName} '${runCmd.replace(/'/g, "'\\''")}' Enter`,
    );

    return `RAMP test started in tmux session: ${sessionName}`;
  }

  stopRampTest(sessionName: string): string {
    execOnRampServer(`tmux kill-session -t ${sessionName}`);
    return `Killed tmux session: ${sessionName}`;
  }

  getTestStatus(): TestStatus {
    try {
      const raw = execOnRampServer(
        'tmux list-sessions 2>/dev/null || echo "no sessions"',
      );
      if (
        raw.includes('no sessions') ||
        raw.includes('no server running')
      ) {
        return { running: false, sessions: [] };
      }
      const sessions = raw
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [name, ...rest] = line.split(':');
          return { name: name.trim(), created: rest.join(':').trim() };
        })
        .filter((s) => s.name.startsWith('rss-ramp'));
      return { running: sessions.length > 0, sessions };
    } catch {
      return { running: false, sessions: [] };
    }
  }

  async fleetRegressionSweep(build: string): Promise<FleetReport> {
    const sensors = this.rampService.getAllSensors();
    if (sensors.length === 0) {
      throw new Error(
        'No sensors discovered. Run discover_sensors first.',
      );
    }

    const baselines = this.rampService.loadBaselines();
    const buildData = baselines.data[build];
    if (!buildData)
      throw new Error(
        `Build "${build}" not found in baselines.json`,
      );

    const results = await Promise.all(
      sensors.map(async (sensor) => {
        const config = this.rampService.getSensorConfigByHostname(
          sensor.hostname,
        );
        if (!config) {
          return {
            hostname: sensor.hostname,
            type: 'unknown',
            verdict: 'SKIPPED',
            error: 'No type mapping',
          };
        }

        const typeData = buildData[config.type];
        if (!typeData) {
          return {
            hostname: sensor.hostname,
            type: config.type,
            verdict: 'SKIPPED',
            error: `No baseline for ${config.type}`,
          };
        }

        const profiles = Object.keys(typeData);
        const verdicts: string[] = [];

        for (const profile of profiles) {
          try {
            const verdict =
              await this.rampService.getPerformanceVerdict({
                sensor: sensor.hostname,
                build,
                profile,
              });
            let detail = `${profile}: ${verdict.level}`;
            if (
              verdict.level !== 'PASS' &&
              this.analysisService
            ) {
              try {
                const fp =
                  await this.analysisService.fingerprintRegression(
                    {
                      sensor: sensor.hostname,
                      build,
                      profile,
                    },
                  );
                detail += ` (${fp.rootCause})`;
              } catch {
                /* fingerprint optional */
              }
            }
            verdicts.push(detail);
          } catch (err) {
            verdicts.push(
              `${profile}: ERROR — ${err instanceof Error ? err.message : 'unknown'}`,
            );
          }
        }

        return {
          hostname: sensor.hostname,
          type: config.type,
          verdict: verdicts.join(' | '),
        };
      }),
    );

    const checked = results.filter((r) => !r.error);
    const skipped = results.filter((r) => r.error);

    return {
      sensors: results,
      summary: `Fleet sweep against ${build}: ${checked.length} checked, ${skipped.length} skipped, ${sensors.length} total`,
    };
  }
}
