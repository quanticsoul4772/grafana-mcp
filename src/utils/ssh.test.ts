import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync } from 'child_process';

vi.mock('child_process', () => ({ execSync: vi.fn(() => 'mock output\n') }));

import { execOnRampServer, execOnSensor } from './ssh.js';

describe('SSH utilities', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('execOnRampServer', () => {
    it('should execute command via ssh ramp', () => {
      const result = execOnRampServer('ls /tmp');
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('ssh ramp'),
        expect.any(Object),
      );
      expect(result).toBe('mock output');
    });

    it('should escape shell arguments', () => {
      execOnRampServer('echo "hello world"');
      const call = (execSync as any).mock.calls[0][0];
      expect(call).toContain('echo \\"hello world\\"');
    });
  });

  describe('execOnSensor', () => {
    it('should SSH to sensor IP with sshpass when password provided', () => {
      const result = execOnSensor('192.168.21.132', 'corelightctl version', 'broala');
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('192.168.21.132'),
        expect.any(Object),
      );
      expect(result).toBe('mock output');
    });

    it('should SSH without sshpass when no password', () => {
      execOnSensor('192.168.21.132', 'uptime');
      const call = (execSync as any).mock.calls[0][0];
      expect(call).toContain('ssh');
      expect(call).not.toContain('sshpass');
    });
  });
});
