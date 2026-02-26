import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({ execSync: vi.fn(() => '') }));
vi.mock('../utils/ssh.js', () => ({
  execOnRampServer: vi.fn(() => 'mock output'),
}));

import { RampControlService } from './ramp-control.js';
import { RampService } from './ramp.js';
import { execOnRampServer } from '../utils/ssh.js';

describe('RampControlService', () => {
  let service: RampControlService;
  let rampService: RampService;
  const mockExec = vi.mocked(execOnRampServer);

  beforeEach(() => {
    vi.clearAllMocks();
    rampService = new RampService({
      rampProjectPath: '/Users/russellsmith/Projects/ramp',
    });
    service = new RampControlService(rampService);
  });

  it('should construct with RampService dependency', () => {
    expect(service).toBeInstanceOf(RampControlService);
  });

  describe('ixiaSetRate', () => {
    it('should call execOnRampServer with ixia-rate.py', () => {
      service.ixiaSetRate('ixia-199-team2-Ixia-34', 50);
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('ixia-rate.py'),
      );
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('--rate 50'),
      );
    });

    it('should include replayer in command', () => {
      service.ixiaSetRate('ixia-199-team2-Ixia-34', 50);
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('--replayer ixia-199-team2-Ixia-34'),
      );
    });
  });

  describe('ixiaStop', () => {
    it('should call execOnRampServer with --stop', () => {
      service.ixiaStop('ixia-199-team2-Ixia-34');
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('--stop'),
      );
    });

    it('should include replayer in command', () => {
      service.ixiaStop('ixia-199-team2-Ixia-34');
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('--replayer ixia-199-team2-Ixia-34'),
      );
    });
  });

  describe('ixiaStatus', () => {
    it('should parse running status', () => {
      mockExec.mockReturnValueOnce('Test is running at 50 Gbps');
      const status = service.ixiaStatus('ixia-199-team2-Ixia-34');
      expect(status.running).toBe(true);
    });

    it('should parse stopped status', () => {
      mockExec.mockReturnValueOnce('No test running');
      const status = service.ixiaStatus('ixia-199-team2-Ixia-34');
      expect(status.running).toBe(false);
    });

    it('should include raw output', () => {
      mockExec.mockReturnValueOnce('Some raw output');
      const status = service.ixiaStatus('ixia-199-team2-Ixia-34');
      expect(status.raw).toBe('Some raw output');
    });
  });

  describe('startRampTest', () => {
    const testConfig = {
      appliance: 'ap3000-8649-132',
      replayer: 'ixia-199-team2-Ixia-1234',
      tests: 'ns2,ew2',
      duration: 3600,
      controlSelector: 'ap3000-ramp',
      jsonServer: '192.168.35.32:5146',
    };

    it('should return dry run text when confirm=false', () => {
      const result = service.startRampTest(testConfig, false);
      expect(result).toContain('DRY RUN');
      expect(result).toContain('ap3000-8649-132');
      expect(result).toContain('ns2,ew2');
      expect(mockExec).not.toHaveBeenCalled();
    });

    it('should create tmux session when confirm=true', () => {
      service.startRampTest(testConfig, true);
      expect(mockExec).toHaveBeenCalledTimes(2);
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('tmux new-session'),
      );
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('tmux send-keys'),
      );
    });

    it('should include all config in the run command', () => {
      service.startRampTest(testConfig, true);
      const sendKeysCall = mockExec.mock.calls[1][0];
      expect(sendKeysCall).toContain('--appliance ap3000-8649-132');
      expect(sendKeysCall).toContain(
        '--replayer ixia-199-team2-Ixia-1234',
      );
      expect(sendKeysCall).toContain('--tests ns2,ew2');
      expect(sendKeysCall).toContain('--duration 3600');
      expect(sendKeysCall).toContain(
        '--control-selector ap3000-ramp',
      );
      expect(sendKeysCall).toContain(
        '--json-server 192.168.35.32:5146',
      );
    });

    it('should return session name on success', () => {
      const result = service.startRampTest(testConfig, true);
      expect(result).toContain('RAMP test started in tmux session:');
      expect(result).toContain('rss-ramp-test-');
    });
  });

  describe('stopRampTest', () => {
    it('should kill the tmux session', () => {
      const result = service.stopRampTest('rss-ramp-test-123');
      expect(mockExec).toHaveBeenCalledWith(
        'tmux kill-session -t rss-ramp-test-123',
      );
      expect(result).toContain('Killed tmux session');
    });
  });

  describe('getTestStatus', () => {
    it('should return no sessions when tmux has none', () => {
      mockExec.mockReturnValueOnce('no sessions');
      const status = service.getTestStatus();
      expect(status.running).toBe(false);
      expect(status.sessions).toEqual([]);
    });

    it('should return no sessions when no server running', () => {
      mockExec.mockReturnValueOnce('no server running');
      const status = service.getTestStatus();
      expect(status.running).toBe(false);
      expect(status.sessions).toEqual([]);
    });

    it('should parse tmux session list', () => {
      mockExec.mockReturnValueOnce(
        'rss-ramp-test-123: 1 windows (created Mon Feb 24 10:00:00 2026)\nother-session: 1 windows',
      );
      const status = service.getTestStatus();
      expect(status.running).toBe(true);
      expect(status.sessions).toHaveLength(1);
      expect(status.sessions[0].name).toBe('rss-ramp-test-123');
    });

    it('should filter to rss-ramp sessions only', () => {
      mockExec.mockReturnValueOnce(
        'other-session: 1 windows\nrss-ramp-test-456: 2 windows',
      );
      const status = service.getTestStatus();
      expect(status.sessions).toHaveLength(1);
      expect(status.sessions[0].name).toBe('rss-ramp-test-456');
    });

    it('should handle execOnRampServer throwing', () => {
      mockExec.mockImplementationOnce(() => {
        throw new Error('SSH connection failed');
      });
      const status = service.getTestStatus();
      expect(status.running).toBe(false);
      expect(status.sessions).toEqual([]);
    });
  });
});
