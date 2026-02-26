import { execSync } from 'child_process';

const SSH_TIMEOUT = 30000; // 30s

export function execOnRampServer(cmd: string): string {
  const output = execSync(
    `ssh ramp "${cmd.replace(/"/g, '\\"')}"`,
    { encoding: 'utf-8', timeout: SSH_TIMEOUT },
  );
  return output.trim();
}

export function execOnSensor(ip: string, cmd: string, password?: string): string {
  const sshCmd = password
    ? `sshpass -p '${password}' ssh -o StrictHostKeyChecking=no broala@${ip} "${cmd.replace(/"/g, '\\"')}"`
    : `ssh -o StrictHostKeyChecking=no broala@${ip} "${cmd.replace(/"/g, '\\"')}"`;
  const output = execSync(sshCmd, { encoding: 'utf-8', timeout: SSH_TIMEOUT });
  return output.trim();
}
