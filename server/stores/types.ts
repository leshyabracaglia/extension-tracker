export type Store = 'chrome' | 'firefox' | 'edge' | 'safari';

export const STORES: Store[] = ['chrome', 'firefox', 'edge', 'safari'];

export const STORE_LABELS: Record<Store, string> = {
  chrome: 'Chrome',
  firefox: 'Firefox',
  edge: 'Edge',
  safari: 'Safari',
};

/** What a single store listing looks like at one moment in time. */
export interface ListingStats {
  name: string;
  url: string;
  /**
   * Users as reported by the store. Chrome: weekly users; Firefox: average daily users;
   * Edge: active installs. Safari (App Store) does not publish this, so it is null there.
   */
  users: number | null;
  rating: number | null;
  ratingCount: number | null;
  version: string | null;
  /** Store-specific extras (e.g. Firefox weekly downloads). */
  extra: Record<string, unknown>;
}

export interface StoreAdapter {
  /** Accepts a raw ID or a store URL and returns the canonical ID. */
  parseId(input: string): string;
  fetch(id: string): Promise<ListingStats>;
}

export async function getText(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
      'accept-language': 'en-US,en;q=0.9',
      ...init?.headers,
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return res.text();
}

/** Parses "1,234", "10,000+", "28.6K", "1.2M" into a number. */
export function parseCount(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = raw.replace(/[\s,+]/g, '').match(/^(\d+(?:\.\d+)?)([KkMm])?$/);
  if (!m) return null;
  const mult = m[2] ? (m[2].toLowerCase() === 'k' ? 1e3 : 1e6) : 1;
  return Math.round(Number(m[1]) * mult);
}

export function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}
