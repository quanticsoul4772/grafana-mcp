const RELATIVE_RE = /^now(?:-(\d+)([smhd]))?$/;

export function isRelativeTime(input: string): boolean {
  return RELATIVE_RE.test(input);
}

const UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
};

export function parseRelativeTime(input: string): string {
  const match = input.match(RELATIVE_RE);
  if (!match) return input; // not relative, pass through

  const nowEpoch = Math.floor(Date.now() / 1000);
  if (!match[1]) return String(nowEpoch); // bare "now"

  const amount = parseInt(match[1], 10);
  const unit = match[2];
  const offsetSeconds = amount * (UNIT_SECONDS[unit] ?? 0);
  return String(nowEpoch - offsetSeconds);
}
