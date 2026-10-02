export function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return Math.round(n).toLocaleString('en-US');
}

export function fmtRating(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : n.toFixed(2);
}

export function fmtDelta(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined) return '';
  const rounded = Number(n.toFixed(digits));
  if (rounded === 0) return '±0';
  const s = digits ? Math.abs(rounded).toFixed(digits) : Math.abs(rounded).toLocaleString('en-US');
  return `${rounded > 0 ? '+' : '−'}${s}`;
}

export function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '';
  return `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toFixed(1)}%`;
}
