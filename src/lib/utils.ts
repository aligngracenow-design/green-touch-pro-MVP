export function fmtMoney(n: number, compact = false): string {
  if (compact && Math.abs(n) >= 1000) {
    if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
    return `$${(n / 1000).toFixed(0)}K`;
  }
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export const statusColors: Record<string, string> = {
  active: 'bg-blue/15 text-blue',
  completed: 'bg-green/15 text-green',
  planning: 'bg-amber/15 text-amber',
  paid: 'bg-green/15 text-green',
  sent: 'bg-blue/15 text-blue',
  draft: 'bg-muted/15 text-muted',
  hot: 'bg-red/15 text-red',
  warm: 'bg-amber/15 text-amber',
  new: 'bg-blue/15 text-blue',
  won: 'bg-green/15 text-green',
  lost: 'bg-muted/15 text-muted',
  done: 'bg-green/15 text-green',
  open: 'bg-amber/15 text-amber',
};

export const healthColors: Record<string, string> = {
  excellent: 'text-green',
  good: 'text-blue',
  warning: 'text-amber',
  critical: 'text-red',
};

export const priorityColors: Record<string, string> = {
  high: 'bg-red/15 text-red',
  med: 'bg-amber/15 text-amber',
  low: 'bg-green/15 text-green',
};
