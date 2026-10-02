import { config } from './config.ts';

/** Calendar day (YYYY-MM-DD) in the configured timezone. */
export function today(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone }).format(now);
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
